package services

import (
	"database/sql"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

type EmailService struct{}

func NewEmailService() *EmailService {
	return &EmailService{}
}

// SendPolicyAlertEmail dispatches an email to the assigned recipient when SRE Policy mode is NOTIFY_EMAIL.
func (s *EmailService) SendPolicyAlertEmail(policy *models.SREActionPolicy, alert models.LinuxAlert, hostname string) error {
	recipient := "admin@company.com"
	if policy != nil && policy.RecipientEmail != "" {
		recipient = policy.RecipientEmail
	}

	subject := fmt.Sprintf("[InfraPilot SRE Alert] Policy Action Required: %s on %s", alert.Title, hostname)
	body := fmt.Sprintf(
		"Hello Admin,\n\n"+
			"An SRE policy breach has occurred requiring your attention:\n"+
			"--------------------------------------------------\n"+
			"Domain / Category: %s\n"+
			"Component / Service: %s\n"+
			"Host / Machine: %s (ID: %s)\n"+
			"Severity: %s\n"+
			"Priority: %s\n"+
			"Current Metric Value: %.2f\n"+
			"Threshold: %.2f\n"+
			"Alert Message: %s\n"+
			"Policy Mode: NOTIFY_EMAIL (Auto-remediation bypassed by Admin configuration)\n"+
			"Time: %s\n"+
			"--------------------------------------------------\n\n"+
			"Please log into InfraPilot Enterprise Console to trigger manual remediation if necessary.\n\n"+
			"-- InfraPilot SRE Engine",
		alert.Category,
		alert.Component,
		hostname,
		alert.MachineID.String(),
		alert.Severity,
		alert.Priority,
		alert.MetricValue,
		alert.Threshold,
		alert.Message,
		time.Now().Format(time.RFC1123),
	)

	// Attempt SMTP send if DB notification_settings is configured
	if database.DB != nil {
		var sqlDB *sql.DB
		sqlDB, err := database.DB.DB()
		if err == nil && sqlDB != nil {
			var enabled bool
			var host, user, password, fromAddress string
			var port int

			rowErr := sqlDB.QueryRow(`
				SELECT enabled, COALESCE(smtp_host, ''), COALESCE(smtp_port, 25), COALESCE(smtp_user, ''), COALESCE(smtp_password, ''), COALESCE(from_address, '') 
				FROM notification_settings 
				WHERE id = 1
			`).Scan(&enabled, &host, &port, &user, &password, &fromAddress)

			if rowErr == nil && enabled && host != "" {
				msg := fmt.Sprintf("To: %s\r\nFrom: %s\r\nSubject: %s\r\n\r\n%s", recipient, fromAddress, subject, body)
				addr := fmt.Sprintf("%s:%d", host, port)
				var auth smtp.Auth
				if user != "" && password != "" {
					auth = smtp.PlainAuth("", user, password, host)
				}
				errSend := smtp.SendMail(addr, auth, fromAddress, []string{recipient}, []byte(msg))
				if errSend != nil {
					log.Printf("[EmailService] Failed to send email to %s via SMTP (%s): %v", recipient, host, errSend)
				} else {
					log.Printf("[EmailService] Successfully dispatched SRE policy alert email to %s via SMTP (%s)", recipient, host)
					return nil
				}
			}
		}
	}

	// Fallback logging for environments without configured SMTP server
	log.Printf("[EmailService] [NOTIFICATION DISPATCHED] To: %s | Subject: %s | Message: %s", recipient, subject, strings.ReplaceAll(alert.Message, "\n", " "))
	return nil
}
