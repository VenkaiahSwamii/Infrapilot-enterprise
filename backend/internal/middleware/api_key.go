package middleware

import (
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/security"

	"github.com/gin-gonic/gin"
)

// APIKeyAuthMiddleware verifies client API keys against enterprise scoped keys or legacy server/machine records
func APIKeyAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		authHeader := c.GetHeader("Authorization")
		if apiKey == "" && len(authHeader) >= 7 && authHeader[:7] == "Bearer " {
			apiKey = authHeader[7:]
		}

		if apiKey != "" {
			// 1. Check if this is an Enterprise Scoped API Key (starts with sk_live_ or matched via SHA-256)
			if database.DB != nil {
				if apiKeyRecord, err := security.ValidateAPIKey(apiKey, database.DB); err == nil && apiKeyRecord != nil {
					now := time.Now().UTC()
					clientIP := c.ClientIP()
					// Update usage asynchronously to avoid blocking request hot path
					go func(id interface{}, ip string, t time.Time) {
						if database.DB != nil {
							database.DB.Model(&models.APIKey{}).
								Where("id = ?", id).
								Updates(map[string]interface{}{"last_used_at": t, "last_used_ip": ip})
						}
					}(apiKeyRecord.ID, clientIP, now)

					c.Set("api_key_record", apiKeyRecord)
					c.Set("api_key_id", apiKeyRecord.ID)
					c.Set("organization_id", apiKeyRecord.OrganizationID)
					c.Set("scopes", apiKeyRecord.Scopes)
					c.Set("api_key", apiKey)
					c.Next()
					return
				}
			}

			// 2. Legacy server/machine key backward compatibility
			var server models.Server
			var machine models.Machine

			if database.DB != nil {
				if err := database.DB.Where("api_key = ?", apiKey).First(&server).Error; err == nil {
					now := time.Now().UTC()
					server.LastSeen = now
					database.DB.Model(&server).Updates(map[string]interface{}{"last_seen": now, "retry_count": 0})
					c.Set("server", &server)
					c.Set("machine", &server)
					c.Set("api_key", apiKey)
					c.Set("scopes", "*")
					c.Next()
					return
				}
				if err := database.DB.Where("api_key = ?", apiKey).First(&machine).Error; err == nil {
					now := time.Now().UTC()
					machine.LastSeen = now
					database.DB.Model(&machine).Updates(map[string]interface{}{"last_seen": now, "retry_count": 0})
					c.Set("server", &machine)
					c.Set("machine", &machine)
					c.Set("api_key", apiKey)
					c.Set("scopes", "*")
					c.Next()
					return
				}
			}
		}

		// Fallback for agent requests: check machine_id query parameter or headers
		machineID := c.GetHeader("X-Machine-ID")
		if machineID == "" {
			machineID = c.Query("machine_id")
		}
		if machineID == "" {
			machineID = c.Param("id")
		}
		if machineID != "" && database.DB != nil {
			var server models.Server
			var machine models.Machine
			if err := database.DB.Where("id = ?", machineID).First(&server).Error; err == nil {
				c.Set("server", &server)
				c.Set("machine", &server)
				c.Set("scopes", "*")
				c.Next()
				return
			}
			if err := database.DB.Where("id = ?", machineID).First(&machine).Error; err == nil {
				c.Set("server", &machine)
				c.Set("machine", &machine)
				c.Set("scopes", "*")
				c.Next()
				return
			}
		}

		// Allow unauthenticated request to proceed to route-level authorization guards
		c.Next()
	}
}

// RequireScope verifies that the authenticated API key or caller possesses the required scope
func RequireScope(requiredScope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// If authenticated via JWT user session, check user role or allow if admin
		if userRole, exists := c.Get("user_role"); exists {
			roleStr := strings.ToLower(userRole.(string))
			if strings.Contains(roleStr, "admin") || strings.Contains(roleStr, "operator") {
				c.Next()
				return
			}
		}

		// Check API Key Record scopes
		if recordObj, exists := c.Get("api_key_record"); exists {
			if apiKeyRecord, ok := recordObj.(*models.APIKey); ok && apiKeyRecord != nil {
				if apiKeyRecord.HasScope(requiredScope) {
					c.Next()
					return
				}
				c.JSON(http.StatusForbidden, gin.H{
					"error":          "insufficient_scope",
					"message":        "The provided API key does not have permission to access this resource",
					"required_scope": requiredScope,
					"granted_scopes": apiKeyRecord.Scopes,
				})
				c.Abort()
				return
			}
		}

		// Fallback for legacy machine authentication (grant full scope for backward compatibility)
		if _, hasServer := c.Get("server"); hasServer {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{
			"error":          "unauthorized_scope_access",
			"message":        "Scope verification failed: no valid API key or session with required privileges",
			"required_scope": requiredScope,
		})
		c.Abort()
	}
}
