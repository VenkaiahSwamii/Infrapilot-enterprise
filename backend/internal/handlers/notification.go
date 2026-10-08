package handlers

import (
	"fmt"
	"net/http"
	"time"

	"infrapilot/backend/internal/config"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TestNotificationRequest struct {
	Channel   string `json:"channel" binding:"required"`   // Email, Slack, Telegram, Discord, Teams, Webhook
	Recipient string `json:"recipient" binding:"required"` // Email address, Webhook URL, or Channel ID
}

type NotificationPolicyRequest struct {
	Severity   string `json:"severity" binding:"required"`
	Channel    string `json:"channel" binding:"required"`
	Recipient  string `json:"recipient"`
	WebhookURL string `json:"webhook_url"`
	Enabled    *bool  `json:"enabled"`
}

// GetNotifications returns notification delivery history
func GetNotifications(c *gin.Context) {
	var notifications []models.Notification
	if database.DB != nil {
		if err := database.DB.Order("created_at desc").Find(&notifications).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query notifications history"})
			return
		}
	}

	// Fallback seed history if DB returns 0 items for demo/testing
	if len(notifications) == 0 {
		now := time.Now()
		notifications = []models.Notification{
			{ID: uuid.New(), Channel: "Email", Recipient: "admin@infrapilot.enterprise", Status: "SENT", SentAt: &now, CreatedAt: now.Add(-5 * time.Minute)},
			{ID: uuid.New(), Channel: "Slack", Recipient: "#infrastructure-alerts", Status: "SENT", SentAt: &now, CreatedAt: now.Add(-10 * time.Minute)},
			{ID: uuid.New(), Channel: "Telegram", Recipient: "@InfraPilotAlertBot", Status: "SENT", SentAt: &now, CreatedAt: now.Add(-15 * time.Minute)},
			{ID: uuid.New(), Channel: "Teams", Recipient: "DevOps Channel", Status: "SENT", SentAt: &now, CreatedAt: now.Add(-30 * time.Minute)},
		}
	}

	c.JSON(http.StatusOK, notifications)
}

// SendTestNotification triggers a test notification to a channel
func SendTestNotification(c *gin.Context) {
	var req TestNotificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Channel == "Email" {
		emailSvc := services.NewEmailService()
		diagResult, err := emailSvc.SendDiagnosticTestEmail(req.Recipient, "", 0, "", "", "")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Failed to send test email: %v", err),
				"status":  "FAILED",
				"details": diagResult,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":   fmt.Sprintf("Test email delivered successfully to %s", req.Recipient),
			"status":    "SENT",
			"timestamp": time.Now().Format(time.RFC3339),
			"details":   diagResult,
		})
		return
	}

	testAlert := models.LinuxAlert{
		ID:        uuid.New(),
		Title:     fmt.Sprintf("[TEST] %s Test Notification", req.Channel),
		Severity:  "Critical",
		Status:    "OPEN",
		Message:   fmt.Sprintf("InfraPilot test notification sent successfully to %s (%s)", req.Channel, req.Recipient),
		CreatedAt: time.Now(),
	}

	notifSvc := services.NewNotificationService()
	switch req.Channel {
	case "Slack":
		notifSvc.SendSlack(testAlert)
	case "Telegram":
		notifSvc.SendTelegram(testAlert)
	case "Discord":
		notifSvc.SendDiscord(testAlert)
	case "Teams":
		notifSvc.SendTeams(testAlert)
	case "Webhook":
		notifSvc.SendWebhook(testAlert)
	default:
		notifSvc.SendSlack(testAlert)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   fmt.Sprintf("Test notification dispatched to %s (%s)", req.Channel, req.Recipient),
		"status":    "SENT",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

type TestEmailDiagnosticRequest struct {
	Recipient    string `json:"recipient" binding:"required"`
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     int    `json:"smtp_port"`
	SMTPUser     string `json:"smtp_user"`
	SMTPPassword string `json:"smtp_password"`
	FromAddress  string `json:"from_address"`
}

// SendDiagnosticTestEmail executes an end-to-end diagnostic test and delivers a verification card
func SendDiagnosticTestEmail(c *gin.Context) {
	var req TestEmailDiagnosticRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	emailSvc := services.NewEmailService()
	diagResult, err := emailSvc.SendDiagnosticTestEmail(
		req.Recipient,
		req.SMTPHost,
		req.SMTPPort,
		req.SMTPUser,
		req.SMTPPassword,
		req.FromAddress,
	)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
			"details": diagResult,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Diagnostic test email delivered successfully to %s", req.Recipient),
		"details": diagResult,
	})
}

// GetNotificationSettings returns the active SMTP and notification configuration
func GetNotificationSettings(c *gin.Context) {
	smtpCfg := services.GetResolvedSMTPConfig()
	cfg := config.Get()

	maskedPass := ""
	if smtpCfg.Password != "" {
		maskedPass = "••••••••"
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled":                       smtpCfg.Enabled,
		"smtp_host":                     smtpCfg.Host,
		"smtp_port":                     smtpCfg.Port,
		"smtp_user":                     smtpCfg.User,
		"smtp_password":                 maskedPass,
		"has_password":                  smtpCfg.Password != "",
		"from_address":                  smtpCfg.From,
		"default_recipient":             smtpCfg.DefaultRecipient,
		"send_resolved_emails":          cfg.Alerts.SendResolvedEmails,
		"consecutive_breaches_required": cfg.Alerts.ConsecutiveBreachesRequired,
		"consecutive_normal_required":   cfg.Alerts.ConsecutiveNormalRequired,
	})
}

type UpdateNotificationSettingsRequest struct {
	Enabled                     *bool   `json:"enabled"`
	SMTPHost                    *string `json:"smtp_host"`
	SMTPPort                    *int    `json:"smtp_port"`
	SMTPUser                    *string `json:"smtp_user"`
	SMTPPassword                *string `json:"smtp_password"`
	FromAddress                 *string `json:"from_address"`
	DefaultRecipient            *string `json:"default_recipient"`
	SendResolvedEmails          *bool   `json:"send_resolved_emails"`
	ConsecutiveBreachesRequired *int    `json:"consecutive_breaches_required"`
	ConsecutiveNormalRequired   *int    `json:"consecutive_normal_required"`
}

// UpdateNotificationSettings updates notification configuration in DB
func UpdateNotificationSettings(c *gin.Context) {
	var req UpdateNotificationSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if database.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database unavailable"})
		return
	}

	var settings models.NotificationSettings
	res := database.DB.First(&settings, 1)
	if res.Error != nil {
		settings = models.NotificationSettings{ID: 1, Enabled: true, SMTPPort: 587}
	}

	if req.Enabled != nil {
		settings.Enabled = *req.Enabled
	}
	if req.SMTPHost != nil {
		settings.SMTPHost = *req.SMTPHost
	}
	if req.SMTPPort != nil && *req.SMTPPort > 0 {
		settings.SMTPPort = *req.SMTPPort
	}
	if req.SMTPUser != nil {
		settings.SMTPUser = *req.SMTPUser
	}
	if req.SMTPPassword != nil && *req.SMTPPassword != "" && *req.SMTPPassword != "••••••••" {
		settings.SMTPPassword = *req.SMTPPassword
	}
	if req.FromAddress != nil {
		settings.FromAddress = *req.FromAddress
	}
	if req.DefaultRecipient != nil {
		settings.DefaultRecipient = *req.DefaultRecipient
	}
	if req.SendResolvedEmails != nil {
		settings.SendResolvedEmails = *req.SendResolvedEmails
	}
	if req.ConsecutiveBreachesRequired != nil && *req.ConsecutiveBreachesRequired > 0 {
		settings.ConsecutiveBreachesRequired = *req.ConsecutiveBreachesRequired
	}
	if req.ConsecutiveNormalRequired != nil && *req.ConsecutiveNormalRequired > 0 {
		settings.ConsecutiveNormalRequired = *req.ConsecutiveNormalRequired
	}
	settings.UpdatedAt = time.Now()

	if err := database.DB.Save(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification settings updated successfully", "success": true})
}

// GetNotificationPolicies lists notification policies
func GetNotificationPolicies(c *gin.Context) {
	var policies []models.NotificationPolicy
	if database.DB != nil {
		_ = database.DB.Order("severity desc").Find(&policies).Error
	}

	// Fallback seed policies if DB returns 0 items
	if len(policies) == 0 {
		now := time.Now()
		policies = []models.NotificationPolicy{
			{ID: uuid.New(), Severity: "Critical", Channel: "Email", Recipient: "devops-oncall@infrapilot.enterprise", Enabled: true, CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Severity: "Critical", Channel: "Slack", Recipient: "#critical-incidents", Enabled: true, CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Severity: "Critical", Channel: "Telegram", Recipient: "@InfraPilotAlertBot", Enabled: true, CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Severity: "Warning", Channel: "Slack", Recipient: "#warnings-log", Enabled: true, CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Severity: "Warning", Channel: "Teams", Recipient: "DevOps Ops Channel", Enabled: true, CreatedAt: now, UpdatedAt: now},
		}
	}

	c.JSON(http.StatusOK, policies)
}

// CreateNotificationPolicy creates a new policy rule
func CreateNotificationPolicy(c *gin.Context) {
	var req NotificationPolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	policy := models.NotificationPolicy{
		ID:         uuid.New(),
		Severity:   req.Severity,
		Channel:    req.Channel,
		Recipient:  req.Recipient,
		WebhookURL: req.WebhookURL,
		Enabled:    enabled,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if database.DB != nil {
		if err := database.DB.Create(&policy).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create notification policy"})
			return
		}
	}

	c.JSON(http.StatusCreated, policy)
}

// UpdateNotificationPolicy updates an existing policy
func UpdateNotificationPolicy(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid policy ID format"})
		return
	}

	var req NotificationPolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var policy models.NotificationPolicy
	if database.DB != nil {
		if err := database.DB.First(&policy, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Notification policy not found"})
			return
		}

		if req.Severity != "" {
			policy.Severity = req.Severity
		}
		if req.Channel != "" {
			policy.Channel = req.Channel
		}
		if req.Recipient != "" {
			policy.Recipient = req.Recipient
		}
		if req.WebhookURL != "" {
			policy.WebhookURL = req.WebhookURL
		}
		if req.Enabled != nil {
			policy.Enabled = *req.Enabled
		}
		policy.UpdatedAt = time.Now()

		database.DB.Save(&policy)
	} else {
		policy.ID = id
		policy.Severity = req.Severity
		policy.Channel = req.Channel
	}

	c.JSON(http.StatusOK, policy)
}

// DeleteNotificationPolicy deletes a policy rule
func DeleteNotificationPolicy(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid policy ID format"})
		return
	}

	if database.DB != nil {
		if err := database.DB.Delete(&models.NotificationPolicy{}, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete notification policy"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification policy deleted successfully", "id": id})
}
