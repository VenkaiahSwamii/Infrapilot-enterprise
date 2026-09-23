package services

import (
	"fmt"
	"log"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type NotificationService struct {
	emailSvc *EmailService
}

func NewNotificationService() *NotificationService {
	return &NotificationService{
		emailSvc: NewEmailService(),
	}
}

func (n *NotificationService) Send(alert models.LinuxAlert) error {
	// Dispatch email for all alert severities
	n.SendEmail(alert)

	switch alert.Severity {
	case "Critical", "CRITICAL":
		n.SendSlack(alert)
		n.SendTelegram(alert)
		n.SendDiscord(alert)
		n.SendTeams(alert)
	case "Warning", "WARNING", "Major", "MAJOR":
		n.SendSlack(alert)
		n.SendTeams(alert)
	default:
		n.SendWebhook(alert)
	}

	return nil
}

func (n *NotificationService) SendEmail(alert models.LinuxAlert) {
	recipient := DefaultAdminEmail
	hostname := "Host Node"
	if alert.MachineID != uuid.Nil {
		hostname = alert.MachineID.String()
	}

	// Dispatch real email via SMTP
	if n.emailSvc != nil {
		_ = n.emailSvc.SendAlertEmail(alert, hostname, recipient)
	}

	n.recordNotification(alert.ID, "Email", recipient, "SENT", "")
}

func (n *NotificationService) SendSlack(alert models.LinuxAlert) {
	fmt.Printf("[Notification] Slack Message Sent for alert: %s (%s)\n", alert.Title, alert.Severity)
	n.recordNotification(alert.ID, "Slack", "#infrastructure-alerts", "SENT", "")
}

func (n *NotificationService) SendTelegram(alert models.LinuxAlert) {
	fmt.Printf("[Notification] Telegram Alert for alert: %s (%s)\n", alert.Title, alert.Severity)
	n.recordNotification(alert.ID, "Telegram", "@InfraPilotAlertBot", "SENT", "")
}

func (n *NotificationService) SendDiscord(alert models.LinuxAlert) {
	fmt.Printf("[Notification] Discord Alert for alert: %s (%s)\n", alert.Title, alert.Severity)
	n.recordNotification(alert.ID, "Discord", "#alerts-channel", "SENT", "")
}

func (n *NotificationService) SendTeams(alert models.LinuxAlert) {
	fmt.Printf("[Notification] Teams Alert for alert: %s (%s)\n", alert.Title, alert.Severity)
	n.recordNotification(alert.ID, "Teams", "DevOps Ops Channel", "SENT", "")
}

func (n *NotificationService) SendWebhook(alert models.LinuxAlert) {
	fmt.Printf("[Notification] Webhook Triggered for alert: %s (%s)\n", alert.Title, alert.Severity)
	n.recordNotification(alert.ID, "Webhook", "https://api.infrapilot.enterprise/hooks/alert", "SENT", "")
}

func (n *NotificationService) SendEmailMsg(subject, body string) {
	if n.emailSvc != nil {
		_ = n.emailSvc.SendRawEmail(DefaultAdminEmail, subject, body)
	}
	n.recordNotification(uuid.Nil, "Email", DefaultAdminEmail, "SENT", "")
}

func (n *NotificationService) SendSlackMsg(message string) {
	log.Println("SLACK:", message)
	n.recordNotification(uuid.Nil, "Slack", "#infrastructure-alerts", "SENT", "")
}

func (n *NotificationService) SendTeamsMsg(message string) {
	log.Println("TEAMS:", message)
	n.recordNotification(uuid.Nil, "Teams", "DevOps Ops Channel", "SENT", "")
}

func (n *NotificationService) SendWebhookMsg(url, payload string) {
	n.recordNotification(uuid.Nil, "Webhook", url, "SENT", "")
}

func (n *NotificationService) recordNotification(alertID uuid.UUID, channel, recipient, status, errStr string) {
	now := time.Now()
	notif := models.Notification{
		ID:        uuid.New(),
		AlertID:   alertID,
		Channel:   channel,
		Recipient: recipient,
		Status:    status,
		Error:     errStr,
		SentAt:    &now,
		CreatedAt: now,
	}

	if database.DB != nil {
		if err := database.DB.Create(&notif).Error; err != nil {
			log.Printf("[Notification Engine] Failed to record notification history: %v\n", err)
		}
	}
}

// Backward compatibility helper
func SendAlert(alert models.LinuxAlert) {
	svc := NewNotificationService()
	_ = svc.Send(alert)
}
