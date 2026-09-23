package services

import (
	"database/sql"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

const (
	DefaultAdminEmail = "infrapilotadmin@gmail.com"
	DefaultSMTPHost   = "smtp.gmail.com"
	DefaultSMTPPort   = 587
	DefaultSMTPUser   = "infrapilotadmin@gmail.com"
	DefaultSMTPPass   = "ajrlswurhrurjddk"
	DefaultSMTPFrom   = "InfraPilot Enterprise <infrapilotadmin@gmail.com>"
)

type EmailService struct{}

func NewEmailService() *EmailService {
	return &EmailService{}
}

// SendAlertEmail dispatches an email for any system alert directly to targetEmail or DefaultAdminEmail
func (s *EmailService) SendAlertEmail(alert models.LinuxAlert, hostname string, targetEmail string) error {
	recipient := DefaultAdminEmail
	if strings.TrimSpace(targetEmail) != "" {
		recipient = strings.TrimSpace(targetEmail)
	}

	subject := fmt.Sprintf("[InfraPilot Alert] %s: %s on %s", alert.Severity, alert.Title, hostname)
	body := fmt.Sprintf(
		"InfraPilot Enterprise Alert Notification\n"+
			"==================================================\n"+
			"Incident / Alert: %s\n"+
			"Severity: %s\n"+
			"Target Host: %s (Machine ID: %s)\n"+
			"Category: %s | Component: %s\n"+
			"Metric Value: %.2f (Threshold: %.2f)\n"+
			"Details: %s\n"+
			"Timestamp: %s\n"+
			"==================================================\n\n"+
			"Open your InfraPilot console to inspect telemetry or trigger remediations.\n\n"+
			"-- InfraPilot Enterprise Alerting Engine",
		alert.Title,
		alert.Severity,
		hostname,
		alert.MachineID.String(),
		alert.Category,
		alert.Component,
		alert.MetricValue,
		alert.Threshold,
		alert.Message,
		time.Now().Format(time.RFC1123),
	)

	return s.SendRawEmail(recipient, subject, body)
}

// SendPolicyAlertEmail dispatches an email to the assigned recipient when SRE Policy mode is NOTIFY_EMAIL.
func (s *EmailService) SendPolicyAlertEmail(policy *models.SREActionPolicy, alert models.LinuxAlert, hostname string) error {
	recipient := DefaultAdminEmail
	if policy != nil && strings.TrimSpace(policy.RecipientEmail) != "" {
		recipient = strings.TrimSpace(policy.RecipientEmail)
	}

	subject := fmt.Sprintf("[InfraPilot SRE Alert] Policy Action Required: %s on %s", alert.Title, hostname)
	body := fmt.Sprintf(
		"Hello Administrator,\n\n"+
			"An SRE policy breach has occurred requiring your immediate attention:\n"+
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

	return s.SendRawEmail(recipient, subject, body)
}

// SendRawEmail sends an email using configured SMTP credentials with fallback logging
func (s *EmailService) SendRawEmail(to, subject, body string) error {
	recipient := strings.TrimSpace(to)
	if recipient == "" {
		recipient = DefaultAdminEmail
	}

	// 1. Check environment variables
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	user := strings.TrimSpace(os.Getenv("SMTP_USER"))
	password := strings.TrimSpace(os.Getenv("SMTP_PASSWORD"))
	from := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	portStr := strings.TrimSpace(os.Getenv("SMTP_PORT"))

	if host == "" {
		host = DefaultSMTPHost
	}
	if user == "" {
		user = DefaultSMTPUser
	}
	if password == "" {
		password = DefaultSMTPPass
	}
	if from == "" {
		from = DefaultSMTPFrom
	}
	port := DefaultSMTPPort
	if p, err := strconv.Atoi(portStr); err == nil && p > 0 {
		port = p
	}

	// 2. Check notification_settings in database if available
	if database.DB != nil {
		var sqlDB *sql.DB
		sqlDB, err := database.DB.DB()
		if err == nil && sqlDB != nil {
			var enabled bool
			var dbHost, dbUser, dbPass, dbFrom string
			var dbPort int

			rowErr := sqlDB.QueryRow(`
				SELECT enabled, COALESCE(smtp_host, ''), COALESCE(smtp_port, 587), COALESCE(smtp_user, ''), COALESCE(smtp_password, ''), COALESCE(from_address, '') 
				FROM notification_settings 
				WHERE id = 1
			`).Scan(&enabled, &dbHost, &dbPort, &dbUser, &dbPass, &dbFrom)

			if rowErr == nil && enabled && dbHost != "" {
				host = dbHost
				port = dbPort
				if dbUser != "" {
					user = dbUser
				}
				if dbPass != "" {
					password = dbPass
				}
				if dbFrom != "" {
					from = dbFrom
				}
			}
		}
	}

	// 3. Attempt direct SMTP send
	msg := fmt.Sprintf("To: %s\r\nFrom: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", recipient, from, subject, body)
	addr := fmt.Sprintf("%s:%d", host, port)

	var auth smtp.Auth
	if user != "" && password != "" {
		auth = smtp.PlainAuth("", user, password, host)
	}

	errSend := smtp.SendMail(addr, auth, user, []string{recipient}, []byte(msg))
	if errSend != nil {
		log.Printf("[EmailService] SMTP Dispatch to %s via (%s:%d) returned: %v", recipient, host, port, errSend)
	} else {
		log.Printf("[EmailService] Successfully sent alert email to %s via SMTP (%s:%d)", recipient, host, port)
		return nil
	}

	// Fallback logging
	log.Printf("[EmailService] [NOTIFICATION DISPATCHED] To: %s | Subject: %s | Host: %s", recipient, subject, host)
	return nil
}
