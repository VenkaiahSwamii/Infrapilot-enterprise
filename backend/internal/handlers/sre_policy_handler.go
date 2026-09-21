package handlers

import (
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// DefaultSREActionPolicies provides initial defaults when no policies are configured.
var DefaultSREActionPolicies = []models.SREActionPolicy{
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000001"),
		Category:       "Service",
		Component:      "ssh",
		Mode:           "AUTO_REMEDIATE",
		RecipientEmail: "admin@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000002"),
		Category:       "Service",
		Component:      "cron",
		Mode:           "AUTO_REMEDIATE",
		RecipientEmail: "admin@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000003"),
		Category:       "Service",
		Component:      "systemd-journald",
		Mode:           "AUTO_REMEDIATE",
		RecipientEmail: "admin@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000004"),
		Category:       "Service",
		Component:      "nginx",
		Mode:           "NOTIFY_EMAIL",
		RecipientEmail: "devops-oncall@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000005"),
		Category:       "Service",
		Component:      "postgresql",
		Mode:           "NOTIFY_EMAIL",
		RecipientEmail: "dba-alerts@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000006"),
		Category:       "Storage",
		Component:      "root_disk",
		Mode:           "AUTO_REMEDIATE",
		RecipientEmail: "sysadmin@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000007"),
		Category:       "Storage",
		Component:      "var_log_disk",
		Mode:           "AUTO_REMEDIATE",
		RecipientEmail: "sysadmin@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000008"),
		Category:       "Network",
		Component:      "gateway",
		Mode:           "AUTO_REMEDIATE",
		RecipientEmail: "network-team@company.com",
		Enabled:        true,
	},
	{
		ID:             uuid.MustParse("10000000-0000-0000-0000-000000000009"),
		Category:       "Network",
		Component:      "dns_latency",
		Mode:           "NOTIFY_EMAIL",
		RecipientEmail: "network-team@company.com",
		Enabled:        true,
	},
}

// GetSREActionPolicies handles GET /api/v1/sre/policies
func GetSREActionPolicies(c *gin.Context) {
	if database.DB == nil {
		c.JSON(http.StatusOK, DefaultSREActionPolicies)
		return
	}

	var policies []models.SREActionPolicy
	if err := database.DB.Find(&policies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch SRE action policies"})
		return
	}

	// Seed defaults if empty
	if len(policies) == 0 {
		now := time.Now()
		seeded := make([]models.SREActionPolicy, len(DefaultSREActionPolicies))
		for i, def := range DefaultSREActionPolicies {
			item := def
			item.CreatedAt = now
			item.UpdatedAt = now
			database.DB.Create(&item)
			seeded[i] = item
		}
		policies = seeded
	}

	c.JSON(http.StatusOK, policies)
}

// SaveSREActionPolicy handles POST /api/v1/sre/policies (Create or Upsert by Category + Component)
func SaveSREActionPolicy(c *gin.Context) {
	var input struct {
		ID             *uuid.UUID `json:"id"`
		Category       string     `json:"category" binding:"required"`
		Component      string     `json:"component" binding:"required"`
		Mode           string     `json:"mode" binding:"required"`
		RecipientEmail string     `json:"recipient_email"`
		Enabled        *bool      `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category := strings.TrimSpace(input.Category)
	component := strings.TrimSpace(input.Component)
	mode := strings.ToUpper(strings.TrimSpace(input.Mode))
	if mode != "AUTO_REMEDIATE" && mode != "NOTIFY_EMAIL" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid mode. Must be AUTO_REMEDIATE or NOTIFY_EMAIL"})
		return
	}

	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	recipient := strings.TrimSpace(input.RecipientEmail)
	if recipient == "" {
		recipient = "admin@company.com"
	}

	now := time.Now()
	var policy models.SREActionPolicy

	if database.DB != nil {
		// Check if existing policy matches Category + Component or provided ID
		var existing models.SREActionPolicy
		var err error
		if input.ID != nil && *input.ID != uuid.Nil {
			err = database.DB.Where("id = ?", *input.ID).First(&existing).Error
		} else {
			err = database.DB.Where("LOWER(category) = LOWER(?) AND LOWER(component) = LOWER(?)", category, component).First(&existing).Error
		}

		if err == nil {
			// Update existing policy
			existing.Mode = mode
			existing.RecipientEmail = recipient
			existing.Enabled = enabled
			existing.UpdatedAt = now
			if err := database.DB.Save(&existing).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update SRE action policy"})
				return
			}
			c.JSON(http.StatusOK, existing)
			return
		}

		// Create new policy
		policy = models.SREActionPolicy{
			ID:             uuid.New(),
			Category:       category,
			Component:      component,
			Mode:           mode,
			RecipientEmail: recipient,
			Enabled:        enabled,
			CreatedAt:      now,
			UpdatedAt:      now,
		}

		if err := database.DB.Create(&policy).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create SRE action policy"})
			return
		}
	} else {
		policy = models.SREActionPolicy{
			ID:             uuid.New(),
			Category:       input.Category,
			Component:      input.Component,
			Mode:           mode,
			RecipientEmail: recipient,
			Enabled:        enabled,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
	}

	c.JSON(http.StatusCreated, policy)
}

// UpdateSREActionPolicy handles PUT /api/v1/sre/policies/:id
func UpdateSREActionPolicy(c *gin.Context) {
	idParam := c.Param("id")
	policyID, err := uuid.Parse(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid policy ID format"})
		return
	}

	var input struct {
		Mode           string `json:"mode"`
		RecipientEmail string `json:"recipient_email"`
		Enabled        *bool  `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if database.DB == nil {
		c.JSON(http.StatusOK, gin.H{"status": "updated"})
		return
	}

	var policy models.SREActionPolicy
	if err := database.DB.Where("id = ?", policyID).First(&policy).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "SRE action policy not found"})
		return
	}

	if input.Mode != "" {
		mode := strings.ToUpper(strings.TrimSpace(input.Mode))
		if mode == "AUTO_REMEDIATE" || mode == "NOTIFY_EMAIL" {
			policy.Mode = mode
		}
	}

	if input.RecipientEmail != "" {
		policy.RecipientEmail = strings.TrimSpace(input.RecipientEmail)
	}

	if input.Enabled != nil {
		policy.Enabled = *input.Enabled
	}

	policy.UpdatedAt = time.Now()
	if err := database.DB.Save(&policy).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update policy"})
		return
	}

	c.JSON(http.StatusOK, policy)
}

// DeleteSREActionPolicy handles DELETE /api/v1/sre/policies/:id
func DeleteSREActionPolicy(c *gin.Context) {
	idParam := c.Param("id")
	policyID, err := uuid.Parse(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid policy ID format"})
		return
	}

	if database.DB != nil {
		if err := database.DB.Where("id = ?", policyID).Delete(&models.SREActionPolicy{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete SRE action policy"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Policy deleted successfully"})
}
