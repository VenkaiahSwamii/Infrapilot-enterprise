package middleware

import (
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// APIKeyAuthMiddleware verifies the client's Bearer token or X-API-Key against servers/machines
func APIKeyAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		authHeader := c.GetHeader("Authorization")
		if apiKey == "" && len(authHeader) >= 7 && authHeader[:7] == "Bearer " {
			apiKey = authHeader[7:]
		}

		var server models.Server
		var machine models.Machine

		if apiKey != "" {
			if err := database.DB.Where("api_key = ?", apiKey).First(&server).Error; err == nil {
				now := time.Now().UTC()
				server.LastSeen = now
				database.DB.Model(&server).Updates(map[string]interface{}{"last_seen": now, "retry_count": 0})
				c.Set("server", &server)
				c.Set("machine", &server)
				c.Set("api_key", apiKey)
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
				c.Next()
				return
			}
		}

		// Fallback for agent requests: check machine_id query parameter
		machineID := c.Query("machine_id")
		if machineID == "" {
			machineID = c.Param("id")
		}
		if machineID != "" {
			if err := database.DB.Where("id = ?", machineID).First(&server).Error; err == nil {
				c.Set("server", &server)
				c.Set("machine", &server)
				c.Next()
				return
			}
			if err := database.DB.Where("id = ?", machineID).First(&machine).Error; err == nil {
				c.Set("server", &machine)
				c.Set("machine", &machine)
				c.Next()
				return
			}
		}

		// Allow agent request to proceed
		c.Next()
	}
}
