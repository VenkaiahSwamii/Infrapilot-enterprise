package services

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"infrapilot/backend/internal/config"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

var (
	emailCooldownMu  sync.Mutex
	emailCooldownMap = make(map[string]time.Time)

	// Flapping protection tracker
	flappingMu      sync.Mutex
	flappingHistory = make(map[string][]time.Time)
)

// getAlertCooldownKey builds a consistent, normalized in-memory key for alert throttling
func getAlertCooldownKey(machineID uuid.UUID, category, title string) string {
	cleanTitle := strings.TrimSpace(strings.TrimPrefix(title, "[RESOLVED] "))
	if category != "" {
		return fmt.Sprintf("%s:%s:%s", machineID.String(), category, cleanTitle)
	}
	return fmt.Sprintf("%s:%s", machineID.String(), cleanTitle)
}

// ResetAlertEmailCooldown re-arms the email alert trigger when an issue is resolved,
// ensuring that any subsequent distinct incident immediately notifies developers.
func ResetAlertEmailCooldown(machineID uuid.UUID, category, title string) {
	key := getAlertCooldownKey(machineID, category, title)
	emailCooldownMu.Lock()
	delete(emailCooldownMap, key)
	emailCooldownMu.Unlock()
	log.Printf("[EmailService] Alert email lifecycle re-armed for '%s' on machine %s (key: %s)", title, machineID.String(), key)
}

// CheckFlapping evaluates if an alert key is toggling rapidly (flapping).
// Returns isFlapping=true if toggled >= 3 times within 5 minutes.
func CheckFlapping(key string) bool {
	flappingMu.Lock()
	defer flappingMu.Unlock()

	now := time.Now()
	cutoff := now.Add(-5 * time.Minute)

	var recent []time.Time
	for _, t := range flappingHistory[key] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	recent = append(recent, now)
	flappingHistory[key] = recent

	return len(recent) >= 4
}

// ResolvedSMTPConfig holds resolved credentials for delivery
type ResolvedSMTPConfig struct {
	Enabled          bool
	Host             string
	Port             int
	User             string
	Password         string
	From             string
	DefaultRecipient string
}

// GetResolvedSMTPConfig fetches the active SMTP configuration hierarchically:
// 1. Database table notification_settings (if set by Admin in UI)
// 2. Config struct parsed from config.toml
// 3. Environment variables
func GetResolvedSMTPConfig() ResolvedSMTPConfig {
	cfg := config.Get()
	res := ResolvedSMTPConfig{
		Enabled:          cfg.SMTP.Enabled,
		Host:             cfg.SMTP.Host,
		Port:             cfg.SMTP.Port,
		User:             cfg.SMTP.User,
		Password:         cfg.SMTP.Password,
		From:             cfg.SMTP.From,
		DefaultRecipient: cfg.SMTP.DefaultRecipient,
	}

	// Fallback to environment variables if config was empty
	if res.Host == "" {
		res.Host = os.Getenv("SMTP_HOST")
	}
	if res.Host == "" {
		res.Host = "smtp.gmail.com"
	}
	if res.Port == 0 {
		if p, err := strconv.Atoi(os.Getenv("SMTP_PORT")); err == nil && p > 0 {
			res.Port = p
		} else {
			res.Port = 587
		}
	}
	if res.User == "" {
		res.User = os.Getenv("SMTP_USER")
	}
	if res.Password == "" {
		res.Password = os.Getenv("SMTP_PASSWORD")
	}
	if res.From == "" {
		res.From = os.Getenv("SMTP_FROM")
	}
	if res.From == "" {
		res.From = "InfraPilot Enterprise <notifications@infrapilot.enterprise>"
	}
	if res.DefaultRecipient == "" {
		res.DefaultRecipient = os.Getenv("SMTP_DEFAULT_RECIPIENT")
	}
	if res.DefaultRecipient == "" {
		res.DefaultRecipient = cfg.Alerts.AdminEmail
	}

	// 1. Check database notification_settings override if available
	if database.DB != nil {
		var sqlDB *sql.DB
		sqlDB, err := database.DB.DB()
		if err == nil && sqlDB != nil {
			var enabled bool
			var dbHost, dbUser, dbPass, dbFrom, dbRecipient string
			var dbPort int

			rowErr := sqlDB.QueryRow(`
				SELECT enabled, COALESCE(smtp_host, ''), COALESCE(smtp_port, 587), 
				       COALESCE(smtp_user, ''), COALESCE(smtp_password, ''), 
				       COALESCE(from_address, ''), COALESCE(default_recipient, '')
				FROM notification_settings 
				WHERE id = 1
			`).Scan(&enabled, &dbHost, &dbPort, &dbUser, &dbPass, &dbFrom, &dbRecipient)

			if rowErr == nil {
				if dbHost != "" {
					res.Enabled = enabled
					res.Host = dbHost
					if dbPort > 0 {
						res.Port = dbPort
					}
					if dbUser != "" {
						res.User = dbUser
					}
					if dbPass != "" {
						res.Password = dbPass
					}
					if dbFrom != "" {
						res.From = dbFrom
					}
				}
				if dbRecipient != "" {
					res.DefaultRecipient = dbRecipient
				}
			}
		}
	}

	return res
}

type EmailService struct{}

func NewEmailService() *EmailService {
	return &EmailService{}
}

// SendAlertEmail dispatches an email for any system alert according to strict incident lifecycle:
// Exactly ONE email on trigger breach, TOTAL SILENCE while unresolved, and exactly ONE email on resolution.
func (s *EmailService) SendAlertEmail(alert models.LinuxAlert, hostname string, targetEmail string) error {
	smtpCfg := GetResolvedSMTPConfig()
	cfg := config.Get()

	// 1. Check Master Alert Email Toggle
	if !cfg.Alerts.EmailEnabled || !smtpCfg.Enabled {
		log.Printf("[EmailService] Email suppressed: alerts/smtp is disabled (alert: '%s' on %s)", alert.Title, hostname)
		return nil
	}

	recipient := strings.TrimSpace(targetEmail)
	if recipient == "" {
		recipient = smtpCfg.DefaultRecipient
	}
	if recipient == "" {
		recipient = cfg.Alerts.AdminEmail
	}

	// Resolve Machine details for 4 W's WHERE clause
	ipAddress := ""
	platform := ""
	if database.DB != nil && alert.MachineID != uuid.Nil {
		var srv models.Server
		if err := database.DB.Where("id = ?", alert.MachineID).First(&srv).Error; err == nil {
			if srv.Hostname != "" && (hostname == "" || hostname == alert.MachineID.String()) {
				hostname = srv.Hostname
			}
			ipAddress = srv.IPAddress
			platform = srv.OS
			if platform == "" {
				platform = srv.Platform
			}
		}
	}

	isResolved := strings.Contains(strings.ToUpper(alert.Title), "[RESOLVED]") || strings.EqualFold(alert.Status, "RESOLVED")

	// 2. Incident Lifecycle: Resolution Path
	if isResolved {
		if !cfg.Alerts.SendResolvedEmails {
			log.Printf("[EmailService] Resolution email suppressed: alerts.send_resolved_emails is false for '%s' on %s", alert.Title, hostname)
			return nil
		}

		// Calculate Outage Duration
		var outageDuration time.Duration
		if alert.ResolvedAt != nil && !alert.CreatedAt.IsZero() {
			outageDuration = alert.ResolvedAt.Sub(alert.CreatedAt)
		} else if !alert.CreatedAt.IsZero() {
			outageDuration = time.Since(alert.CreatedAt)
		}

		return s.SendIncidentResolvedEmail(&alert, hostname, ipAddress, platform, outageDuration, recipient)
	}

	// 3. Incident Lifecycle: Trigger Path
	// Check Flapping
	flappingKey := fmt.Sprintf("%s:%s", alert.MachineID.String(), alert.Title)
	if CheckFlapping(flappingKey) {
		log.Printf("[EmailService] Alert '%s' on %s is flapping - suppressing repeated trigger emails", alert.Title, hostname)
		return nil
	}

	// Fetch Top 5 processes at trigger time for instant root-cause analysis
	var topProcesses []models.LinuxProcess
	if database.DB != nil && alert.MachineID != uuid.Nil {
		orderCol := "cpu_percent desc"
		if strings.EqualFold(alert.Category, "Memory") {
			orderCol = "memory_percent desc"
		}
		_ = database.DB.Where("machine_id = ?", alert.MachineID).Order(orderCol).Limit(5).Find(&topProcesses).Error
	}

	return s.SendIncidentTriggerEmail(&alert, hostname, ipAddress, platform, topProcesses, recipient)
}

// SendIncidentTriggerEmail sends exactly ONE email on breach, sets RFC-2822 Message-ID, and marks alert in DB
func (s *EmailService) SendIncidentTriggerEmail(alert *models.LinuxAlert, hostname, ipAddress, platform string, topProcesses []models.LinuxProcess, recipient string) error {
	smtpCfg := GetResolvedSMTPConfig()
	if recipient == "" {
		recipient = smtpCfg.DefaultRecipient
	}

	// Check if trigger email was already sent for this specific alert to enforce zero duplicates
	if alert.EmailSent {
		log.Printf("[EmailService] Trigger email already sent for alert %s ('%s') - maintaining silence", alert.ID, alert.Title)
		return nil
	}

	// Verify database state directly to avoid races with in-memory replicas
	if database.DB != nil && alert.ID != uuid.Nil {
		var dbSent bool
		if err := database.DB.Model(&models.LinuxAlert{}).Select("email_sent").Where("id = ?", alert.ID).Scan(&dbSent).Error; err == nil && dbSent {
			log.Printf("[EmailService] Trigger email already recorded in DB for alert %s - maintaining silence", alert.ID)
			return nil
		}
	}

	// In-memory cooldown check for identical alert title & machine
	cooldownKey := getAlertCooldownKey(alert.MachineID, alert.Category, alert.Title)
	emailCooldownMu.Lock()
	lastSent, exists := emailCooldownMap[cooldownKey]
	if exists && time.Since(lastSent) < 15*time.Minute {
		emailCooldownMu.Unlock()
		log.Printf("[EmailService] Trigger email suppressed by lifecycle cooldown for '%s' on %s (key: %s)", alert.Title, hostname, cooldownKey)
		return nil
	}
	emailCooldownMap[cooldownKey] = time.Now()
	emailCooldownMu.Unlock()

	// Generate RFC-2822 Threading Message-ID
	messageID := alert.MessageID
	if messageID == "" {
		messageID = fmt.Sprintf("<incident-%s@infrapilot.enterprise>", alert.ID.String())
		alert.MessageID = messageID
	}

	subject := fmt.Sprintf("[InfraPilot Alert] %s: %s on %s", alert.Severity, alert.Title, hostname)

	backendURL := config.Get().BackendURL
	if backendURL == "" {
		backendURL = "http://localhost:8080"
	}
	dashboardURL := fmt.Sprintf("%s/dashboard?machine_id=%s", backendURL, alert.MachineID.String())
	terminalURL := fmt.Sprintf("%s/fleet-terminal?machine_id=%s", backendURL, alert.MachineID.String())

	incidentData := EmailIncidentData{
		IsResolution: false,
		Alert:        *alert,
		Hostname:     hostname,
		IPAddress:    ipAddress,
		Platform:     platform,
		TopProcesses: topProcesses,
		DashboardURL: dashboardURL,
		TerminalURL:  terminalURL,
	}

	msgBytes := BuildIncidentEmailMessage(smtpCfg.From, recipient, subject, messageID, "", incidentData)

	err := s.dispatchRawBytes(smtpCfg, recipient, msgBytes)
	if err == nil {
		alert.EmailSent = true
		if database.DB != nil && alert.ID != uuid.Nil {
			database.DB.Model(&models.LinuxAlert{}).Where("id = ?", alert.ID).Updates(map[string]interface{}{
				"email_sent": true,
				"message_id": messageID,
			})
		}
		log.Printf("[EmailService] Exactly-1 trigger email sent for alert %s ('%s') to %s with Message-ID %s", alert.ID, alert.Title, recipient, messageID)
	}
	return err
}

// SendIncidentResolvedEmail sends exactly ONE resolution email with RFC-2822 In-Reply-To matching the trigger
func (s *EmailService) SendIncidentResolvedEmail(alert *models.LinuxAlert, hostname, ipAddress, platform string, outageDuration time.Duration, recipient string) error {
	smtpCfg := GetResolvedSMTPConfig()
	if recipient == "" {
		recipient = smtpCfg.DefaultRecipient
	}

	// Retrieve original Message-ID from alert or DB for threading
	inReplyTo := alert.MessageID
	if inReplyTo == "" && database.DB != nil && alert.ID != uuid.Nil {
		var dbAlert models.LinuxAlert
		if err := database.DB.Select("message_id").Where("id = ?", alert.ID).First(&dbAlert).Error; err == nil {
			inReplyTo = dbAlert.MessageID
		}
	}
	if inReplyTo == "" {
		inReplyTo = fmt.Sprintf("<incident-%s@infrapilot.enterprise>", alert.ID.String())
	}

	subject := fmt.Sprintf("[InfraPilot Alert] RESOLVED: %s on %s", strings.TrimPrefix(alert.Title, "[RESOLVED] "), hostname)

	backendURL := config.Get().BackendURL
	if backendURL == "" {
		backendURL = "http://localhost:8080"
	}
	dashboardURL := fmt.Sprintf("%s/dashboard?machine_id=%s", backendURL, alert.MachineID.String())

	incidentData := EmailIncidentData{
		IsResolution:   true,
		Alert:          *alert,
		Hostname:       hostname,
		IPAddress:      ipAddress,
		Platform:       platform,
		OutageDuration: outageDuration,
		DashboardURL:   dashboardURL,
	}

	resMessageID := fmt.Sprintf("<resolution-%s@infrapilot.enterprise>", alert.ID.String())
	msgBytes := BuildIncidentEmailMessage(smtpCfg.From, recipient, subject, resMessageID, inReplyTo, incidentData)

	err := s.dispatchRawBytes(smtpCfg, recipient, msgBytes)
	if err == nil {
		log.Printf("[EmailService] Exactly-1 resolution email sent for alert %s on %s (threaded into %s)", alert.ID, hostname, inReplyTo)
		ResetAlertEmailCooldown(alert.MachineID, alert.Category, alert.Title)
	}
	return err
}

// SendPolicyAlertEmail dispatches an email to the assigned recipient when SRE Policy mode is NOTIFY_EMAIL.
func (s *EmailService) SendPolicyAlertEmail(policy *models.SREActionPolicy, alert models.LinuxAlert, hostname string) error {
	smtpCfg := GetResolvedSMTPConfig()
	recipient := smtpCfg.DefaultRecipient
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
			"Please log into InfraPilot Enterprise Console to inspect telemetry or trigger manual remediation.\n\n"+
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

// SendManualResolutionEmail sends a correlated resolution email when an operator manually fixes and restarts a service in NOTIFY_EMAIL mode.
func (s *EmailService) SendManualResolutionEmail(alert *models.LinuxAlert, hostname, serviceName string, restartCount int, recipient string) error {
	smtpCfg := GetResolvedSMTPConfig()
	if recipient == "" {
		recipient = smtpCfg.DefaultRecipient
	}

	subject := fmt.Sprintf("🟢 [RESOLVED] Service '%s' Restored by Operator on %s", serviceName, hostname)
	body := fmt.Sprintf(
		"Hello Administrator,\n\n"+
			"The incident for service '%s' has been marked RESOLVED.\n"+
			"--------------------------------------------------\n"+
			"Service / Unit: %s\n"+
			"Host / Machine: %s\n"+
			"Action: Operator Manual Restart Detected & Verified Healthy\n"+
			"Updated 24h Restart Count: %d\n"+
			"Resolution Status: HEALTHY / RUNNING\n"+
			"Resolution Time: %s\n"+
			"--------------------------------------------------\n\n"+
			"Telemetry and health monitors have returned to normal operating baseline.\n\n"+
			"-- InfraPilot SRE Engine",
		serviceName,
		serviceName,
		hostname,
		restartCount,
		time.Now().Format(time.RFC1123),
	)

	return s.SendRawEmail(recipient, subject, body)
}

// SendRawEmail sends a simple text or HTML message directly
func (s *EmailService) SendRawEmail(to, subject, body string) error {
	smtpCfg := GetResolvedSMTPConfig()
	recipient := strings.TrimSpace(to)
	if recipient == "" {
		recipient = smtpCfg.DefaultRecipient
	}

	msg := fmt.Sprintf("To: %s\r\nFrom: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", recipient, smtpCfg.From, subject, body)
	return s.dispatchRawBytes(smtpCfg, recipient, []byte(msg))
}

// SendDiagnosticTestEmail executes an end-to-end diagnostic verification of SMTP connectivity and delivers a test card
func (s *EmailService) SendDiagnosticTestEmail(to string, overrideHost string, overridePort int, overrideUser, overridePass, overrideFrom string) (map[string]interface{}, error) {
	host := overrideHost
	port := overridePort
	user := overrideUser
	pass := overridePass
	from := overrideFrom

	activeCfg := GetResolvedSMTPConfig()
	if host == "" {
		host = activeCfg.Host
	}
	if port <= 0 {
		port = activeCfg.Port
	}
	if user == "" {
		user = activeCfg.User
	}
	if pass == "" {
		pass = activeCfg.Password
	}
	if from == "" {
		from = activeCfg.From
	}
	recipient := strings.TrimSpace(to)
	if recipient == "" {
		recipient = activeCfg.DefaultRecipient
	}

	result := map[string]interface{}{
		"host":      host,
		"port":      port,
		"recipient": recipient,
		"from":      from,
		"dns_ok":    false,
		"tcp_ok":    false,
		"tls_ok":    false,
		"auth_ok":   false,
		"sent_ok":   false,
	}

	// 1. DNS Resolution check
	ips, err := net.LookupIP(host)
	if err != nil {
		result["error"] = fmt.Sprintf("DNS resolution failed for '%s': %v", host, err)
		return result, err
	}
	result["dns_ok"] = true
	result["resolved_ip"] = ips[0].String()

	// 2. TCP Connection & TLS Handshake
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	var conn net.Conn
	if port == 465 {
		tlsDialer := &tls.Dialer{
			NetDialer: &net.Dialer{Timeout: 5 * time.Second},
			Config:    &tls.Config{ServerName: host},
		}
		conn, err = tlsDialer.Dial("tcp", addr)
		if err != nil {
			result["error"] = fmt.Sprintf("SMTPS (port 465) TLS dial to %s failed: %v", addr, err)
			return result, err
		}
		result["tcp_ok"] = true
		result["tls_ok"] = true
	} else {
		conn, err = net.DialTimeout("tcp", addr, 5*time.Second)
		if err != nil {
			result["error"] = fmt.Sprintf("TCP dial to %s timed out or failed: %v", addr, err)
			return result, err
		}
		result["tcp_ok"] = true
	}
	defer conn.Close()

	// 3. SMTP Client & STARTTLS / Auth Handshake
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		result["error"] = fmt.Sprintf("SMTP protocol handshake failed: %v", err)
		return result, err
	}
	defer client.Close()

	// Upgrade to TLS via STARTTLS if not already on direct TLS (port 465)
	if port != 465 {
		tlsConfig := &tls.Config{
			ServerName: host,
		}
		if hasStartTLS, _ := client.Extension("STARTTLS"); hasStartTLS {
			if err := client.StartTLS(tlsConfig); err != nil {
				result["error"] = fmt.Sprintf("STARTTLS negotiation failed: %v", err)
				return result, err
			}
			result["tls_ok"] = true
		}
	}

	// Authenticate
	if user != "" && pass != "" {
		auth := smtp.PlainAuth("", user, pass, host)
		if err := client.Auth(auth); err != nil {
			result["error"] = fmt.Sprintf("SMTP Authentication failed: %v (Please check Username and App Password)", err)
			return result, err
		}
		result["auth_ok"] = true
	}

	// Send Test Card Email
	testAlert := models.LinuxAlert{
		ID:          uuid.New(),
		Title:       "SMTP Connection Test Verified",
		Severity:    "Info",
		Status:      "RESOLVED",
		Category:    "Diagnostics",
		Component:   "SMTP Engine",
		MetricValue: 100.0,
		Threshold:   100.0,
		Message:     "Your InfraPilot Enterprise SMTP settings were tested and verified successfully.",
		CreatedAt:   time.Now(),
	}

	testData := EmailIncidentData{
		IsResolution: true,
		Alert:        testAlert,
		Hostname:     "InfraPilot Central Engine",
		IPAddress:    ips[0].String(),
		Platform:     "Enterprise Central",
		DashboardURL: config.Get().BackendURL + "/dashboard",
	}

	subject := "🟢 [InfraPilot Enterprise] SMTP Connection Verification Successful"
	msgBytes := BuildIncidentEmailMessage(from, recipient, subject, fmt.Sprintf("<test-%s@infrapilot.enterprise>", uuid.New().String()), "", testData)

	if err := client.Mail(extractEmail(from)); err != nil {
		result["error"] = fmt.Sprintf("MAIL FROM command rejected: %v", err)
		return result, err
	}
	if err := client.Rcpt(recipient); err != nil {
		result["error"] = fmt.Sprintf("RCPT TO command rejected for %s: %v", recipient, err)
		return result, err
	}
	w, err := client.Data()
	if err != nil {
		result["error"] = fmt.Sprintf("DATA command failed: %v", err)
		return result, err
	}
	if _, err := w.Write(msgBytes); err != nil {
		result["error"] = fmt.Sprintf("Email content write failed: %v", err)
		return result, err
	}
	if err := w.Close(); err != nil {
		result["error"] = fmt.Sprintf("Email transmission finalization failed: %v", err)
		return result, err
	}

	result["sent_ok"] = true
	result["message"] = fmt.Sprintf("Test email successfully delivered to %s via %s:%d", recipient, host, port)
	return result, nil
}

func (s *EmailService) dispatchRawBytes(smtpCfg ResolvedSMTPConfig, recipient string, msgBytes []byte) error {
	addr := fmt.Sprintf("%s:%d", smtpCfg.Host, smtpCfg.Port)
	fromAddr := extractEmail(smtpCfg.From)
	if fromAddr == "" {
		fromAddr = smtpCfg.User
	}

	var auth smtp.Auth
	if smtpCfg.User != "" && smtpCfg.Password != "" {
		auth = smtp.PlainAuth("", smtpCfg.User, smtpCfg.Password, smtpCfg.Host)
	}

	// Port 465 requires direct TLS connection
	if smtpCfg.Port == 465 {
		tlsDialer := &tls.Dialer{
			NetDialer: &net.Dialer{Timeout: 10 * time.Second},
			Config:    &tls.Config{ServerName: smtpCfg.Host},
		}
		conn, err := tlsDialer.Dial("tcp", addr)
		if err != nil {
			log.Printf("[EmailService] SMTPS (465) TLS Dial failed to %s: %v", addr, err)
			return err
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, smtpCfg.Host)
		if err != nil {
			log.Printf("[EmailService] SMTPS client handshake failed: %v", err)
			return err
		}
		defer client.Close()

		if auth != nil {
			if err := client.Auth(auth); err != nil {
				log.Printf("[EmailService] SMTPS authentication failed: %v", err)
				return err
			}
		}

		if err := client.Mail(fromAddr); err != nil {
			return err
		}
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		if _, err := w.Write(msgBytes); err != nil {
			return err
		}
		if err := w.Close(); err != nil {
			return err
		}
		log.Printf("[EmailService] SMTPS Dispatch successful to %s via (%s)", recipient, addr)
		return nil
	}

	// Standard ports (587, 25) use STARTTLS via smtp.SendMail
	err := smtp.SendMail(addr, auth, fromAddr, []string{recipient}, msgBytes)
	if err != nil {
		log.Printf("[EmailService] SMTP Dispatch to %s via (%s) returned error: %v", recipient, addr, err)
		return err
	}
	log.Printf("[EmailService] SMTP Dispatch successful to %s via (%s)", recipient, addr)
	return nil
}

func extractEmail(from string) string {
	if strings.Contains(from, "<") && strings.Contains(from, ">") {
		start := strings.Index(from, "<")
		end := strings.Index(from, ">")
		if start < end {
			return strings.TrimSpace(from[start+1 : end])
		}
	}
	return strings.TrimSpace(from)
}
