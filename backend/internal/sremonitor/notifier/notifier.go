package notifier

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

type SREAlertEvent struct {
	EventType    string   `json:"event_type"`
	Target       string   `json:"target"`
	ActionTaken  string   `json:"action_taken"`
	Success      bool     `json:"success"`
	ErrorMessage string   `json:"error_message"`
	Phase        string   `json:"phase"`
}

type WebhookPayload struct {
	ServerID     string   `json:"server_id"`
	EventType    string   `json:"event_type"`
	Target       string   `json:"target"`
	ActionTaken  string   `json:"action_taken"`
	Success      bool     `json:"success"`
	ErrorMessage string   `json:"error_message"`
	Phase        string   `json:"phase"`
	Recipients   []string `json:"recipients"`
	TimestampMs  int64    `json:"timestamp_ms"`
}

func SendAlertEmail(event *SREAlertEvent, db *sql.DB, serverID string) {
	enabled := true
	host := "smtp.gmail.com"
	port := 587
	user := "infrapilotadmin@gmail.com"
	password := "ajrlswurhrurjddk"
	fromAddress := "InfraPilot Enterprise <infrapilotadmin@gmail.com>"
	var webhookURL string
	var webhookEnabled bool
	recipients := []string{"infrapilotadmin@gmail.com"}

	if db != nil {
		var dbEnabled, dbWebhookEnabled bool
		var dbHost, dbUser, dbPass, dbFrom, dbWebhookURL string
		var dbPort int
		var routingRules []byte

		err := db.QueryRow(`
			SELECT enabled, smtp_host, smtp_port, smtp_user, smtp_password, from_address, routing_rules, 
			       COALESCE(webhook_url, ''), COALESCE(webhook_enabled, false)
			FROM notification_settings
			WHERE id = 1
		`).Scan(&dbEnabled, &dbHost, &dbPort, &dbUser, &dbPass, &dbFrom, &routingRules, &dbWebhookURL, &dbWebhookEnabled)

		if err == nil {
			if dbHost != "" {
				host = dbHost
				port = dbPort
				user = dbUser
				password = dbPass
				fromAddress = dbFrom
			}
			webhookURL = dbWebhookURL
			webhookEnabled = dbWebhookEnabled

			var rules map[string][]string
			if err := json.Unmarshal(routingRules, &rules); err == nil && len(rules[event.EventType]) > 0 {
				recipients = rules[event.EventType]
			}
		}
	}

	// 1. Trigger Webhook if configured
	if webhookEnabled && webhookURL != "" {
		payload := WebhookPayload{
			ServerID:     serverID,
			EventType:    event.EventType,
			Target:       event.Target,
			ActionTaken:  event.ActionTaken,
			Success:      event.Success,
			ErrorMessage: event.ErrorMessage,
			Phase:        event.Phase,
			Recipients:   recipients,
			TimestampMs:  time.Now().UnixMilli(),
		}

		jsonBytes, err := json.Marshal(payload)
		if err == nil {
			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Post(webhookURL, "application/json", bytes.NewBuffer(jsonBytes))
			if err != nil {
				log.Printf("[SRE Notifier] Failed to trigger webhook (%s): %v", webhookURL, err)
			} else {
				log.Printf("[SRE Notifier] Successfully sent alert webhook (HTTP %d)", resp.StatusCode)
				_ = resp.Body.Close()
			}
		}
	}

	// 2. Send Direct SMTP Email to infrapilotadmin@gmail.com
	if host != "" && len(recipients) > 0 && enabled {
		subject := fmt.Sprintf("InfraPilot Alert [%s]: %s on %s", event.EventType, event.Target, serverID)
		body := fmt.Sprintf("Event Type: %s\r\nTarget: %s\r\nServer: %s\r\nPhase: %s\r\nSuccess: %t\r\nError: %s\r\nAction Taken: %s\r\n\r\n-- InfraPilot SRE Engine",
			event.EventType, event.Target, serverID, event.Phase, event.Success, event.ErrorMessage, event.ActionTaken)

		msg := fmt.Appendf(nil, "To: %s\r\nFrom: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", strings.Join(recipients, ","), fromAddress, subject, body)

		addr := fmt.Sprintf("%s:%d", host, port)
		auth := smtp.PlainAuth("", user, password, host)

		err := smtp.SendMail(addr, auth, user, recipients, msg)
		if err != nil {
			log.Printf("[SRE Notifier] SMTP Send error to %v: %v", recipients, err)
		} else {
			log.Printf("[SRE Notifier] Successfully sent alert email to %v for %s", recipients, event.EventType)
		}
	}
}
