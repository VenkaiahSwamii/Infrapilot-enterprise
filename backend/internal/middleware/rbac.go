package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"
)

func RequireRoles(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {

		role, exists := c.Get("role")

		if !exists {
			// Log missing role attempt
			username := getUsernameFromContext(c)
			utils.LogAudit(username, uuid.Nil, "RBAC MissingRole", "Failure")
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Role not found in token",
			})
			c.Abort()
			return
		}

		userRole := normalizeRole(role.(string))

		for _, allowed := range roles {
			normAllowed := normalizeRole(allowed)
			if normAllowed == userRole || userRole == "SUPERADMIN" {
				c.Next()
				return
			}
		}

		// Log permission denied
		username := getUsernameFromContext(c)
		utils.LogAudit(username, uuid.Nil, "RBAC PermissionDenied", "Failure")
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Permission denied",
		})

		c.Abort()
	}
}

func normalizeRole(r string) string {
	r = strings.ToUpper(strings.ReplaceAll(strings.ReplaceAll(r, " ", ""), "_", ""))
	switch r {
	case "SUPERADMIN":
		return "SUPERADMIN"
	case "ADMIN", "ORGADMIN", "ORGANIZATIONADMIN":
		return "ADMIN"
	case "DEVOPS", "DEVOPSENGINEER":
		return "DEVOPS"
	case "OPERATOR":
		return "OPERATOR"
	case "VIEWER", "READONLY", "READONLYUSER", "USER", "MEMBER", "STANDARD", "STAFF":
		return "VIEWER"
	default:
		return r
	}
}

// helper to retrieve username from context, fallback to "admin"
func getUsernameFromContext(c *gin.Context) string {
	userIDVal, exists := c.Get("userId")
	if !exists {
		return "admin"
	}
	if database.DB == nil {
		return "admin"
	}
	var user models.User
	if err := database.DB.First(&user, "id = ?", userIDVal).Error; err == nil {
		return user.Username
	}
	return "admin"
}
