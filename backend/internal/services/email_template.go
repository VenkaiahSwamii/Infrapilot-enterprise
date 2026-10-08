package services

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"infrapilot/backend/internal/models"
)

// EmailIncidentData bundles incident context for template rendering
type EmailIncidentData struct {
	IsResolution   bool
	Alert          models.LinuxAlert
	Hostname       string
	IPAddress      string
	Platform       string
	TopProcesses   []models.LinuxProcess
	OutageDuration time.Duration
	DashboardURL   string
	TerminalURL    string
}

// BuildIncidentEmailMessage constructs an RFC-2822 compliant MIME email with HTML and Plain Text parts
func BuildIncidentEmailMessage(from, to, subject, messageID, inReplyTo string, data EmailIncidentData) []byte {
	boundary := fmt.Sprintf("boundary_%d_%s", time.Now().UnixNano(), "infrapilot")

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("From: %s\r\n", from))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", to))
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	buf.WriteString("MIME-Version: 1.0\r\n")

	if messageID != "" {
		buf.WriteString(fmt.Sprintf("Message-ID: %s\r\n", messageID))
	}
	if inReplyTo != "" {
		buf.WriteString(fmt.Sprintf("In-Reply-To: %s\r\n", inReplyTo))
		buf.WriteString(fmt.Sprintf("References: %s\r\n", inReplyTo))
	}

	buf.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary))

	// 1. Plain-Text Part
	plainText := generatePlainTextBody(data)
	buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	buf.WriteString("Content-Transfer-Encoding: 7bit\r\n\r\n")
	buf.WriteString(plainText)
	buf.WriteString("\r\n\r\n")

	// 2. HTML Part
	htmlBody := generateHTMLBody(data)
	buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	buf.WriteString("Content-Transfer-Encoding: 7bit\r\n\r\n")
	buf.WriteString(htmlBody)
	buf.WriteString("\r\n\r\n")

	buf.WriteString(fmt.Sprintf("--%s--\r\n", boundary))

	return buf.Bytes()
}

func generatePlainTextBody(data EmailIncidentData) string {
	status := "TRIGGERED / ACTIVE"
	if data.IsResolution {
		status = "RESOLVED"
	}

	timeStr := data.Alert.CreatedAt.Format("2006-01-02 15:04:05 MST")
	timeUTC := data.Alert.CreatedAt.UTC().Format("15:04:05 UTC")
	if data.IsResolution && data.Alert.ResolvedAt != nil {
		timeStr = data.Alert.ResolvedAt.Format("2006-01-02 15:04:05 MST")
		timeUTC = data.Alert.ResolvedAt.UTC().Format("15:04:05 UTC")
	}

	var sb strings.Builder
	sb.WriteString("=================================================================\n")
	sb.WriteString(fmt.Sprintf("INFRAPILOT ENTERPRISE ALERT: %s\n", status))
	sb.WriteString("=================================================================\n\n")

	sb.WriteString(fmt.Sprintf("WHAT:  %s (%s)\n", data.Alert.Title, data.Alert.Severity))
	sb.WriteString(fmt.Sprintf("       Component: %s | Category: %s\n\n", data.Alert.Component, data.Alert.Category))

	if data.IsResolution {
		sb.WriteString(fmt.Sprintf("WHY:   Metric returned to normal levels (Threshold was: %.1f)\n", data.Alert.Threshold))
		if data.OutageDuration > 0 {
			sb.WriteString(fmt.Sprintf("       Total Outage Duration: %s\n\n", formatDuration(data.OutageDuration)))
		}
	} else {
		sb.WriteString(fmt.Sprintf("WHY:   Metric breached threshold: Current %.1f (Threshold: %.1f)\n", data.Alert.MetricValue, data.Alert.Threshold))
		sb.WriteString(fmt.Sprintf("       Details: %s\n\n", data.Alert.Message))
	}

	host := data.Hostname
	if host == "" {
		host = data.Alert.MachineID.String()
	}
	sb.WriteString(fmt.Sprintf("WHERE: Host: %s\n", host))
	if data.IPAddress != "" {
		sb.WriteString(fmt.Sprintf("       IP Address: %s\n", data.IPAddress))
	}
	if data.Platform != "" {
		sb.WriteString(fmt.Sprintf("       Platform: %s\n", data.Platform))
	}
	sb.WriteString(fmt.Sprintf("       Machine ID: %s\n\n", data.Alert.MachineID.String()))

	sb.WriteString(fmt.Sprintf("WHEN:  %s (%s)\n\n", timeStr, timeUTC))

	if len(data.TopProcesses) > 0 && !data.IsResolution {
		sb.WriteString("-----------------------------------------------------------------\n")
		sb.WriteString("TOP RESOURCE-CONSUMING PROCESSES AT INCIDENT TRIGGER:\n")
		sb.WriteString("-----------------------------------------------------------------\n")
		sb.WriteString(fmt.Sprintf("%-6s %-24s %-10s %-10s\n", "PID", "NAME", "CPU %", "MEM %"))
		for _, p := range data.TopProcesses {
			name := p.Name
			if len(name) > 23 {
				name = name[:20] + "..."
			}
			sb.WriteString(fmt.Sprintf("%-6d %-24s %-10.1f %-10.1f\n", p.PID, name, p.CPUPercent, p.MemoryPercent))
		}
		sb.WriteString("\n")
	}

	if data.DashboardURL != "" {
		sb.WriteString(fmt.Sprintf("Open Dashboard: %s\n", data.DashboardURL))
	}
	if data.TerminalURL != "" {
		sb.WriteString(fmt.Sprintf("Open Fleet Terminal: %s\n", data.TerminalURL))
	}

	sb.WriteString("\n-- InfraPilot Enterprise Monitoring System")
	return sb.String()
}

func generateHTMLBody(data EmailIncidentData) string {
	accentColor := "#ef4444" // Red for trigger
	statusText := "CRITICAL ALERT"
	statusBadgeBg := "#fee2e2"
	statusBadgeBorder := "#ef4444"

	if data.IsResolution {
		accentColor = "#10b981" // Green for resolved
		statusText = "RESOLVED"
		statusBadgeBg = "#d1fae5"
		statusBadgeBorder = "#10b981"
	} else if strings.EqualFold(data.Alert.Severity, "Warning") || strings.EqualFold(data.Alert.Severity, "Major") {
		accentColor = "#f59e0b" // Amber
		statusText = strings.ToUpper(data.Alert.Severity)
		statusBadgeBg = "#fef3c7"
		statusBadgeBorder = "#f59e0b"
	}

	timeLocal := data.Alert.CreatedAt.Format("02 Jan 2006 15:04:05 MST")
	timeUTC := data.Alert.CreatedAt.UTC().Format("15:04:05 UTC")
	if data.IsResolution && data.Alert.ResolvedAt != nil {
		timeLocal = data.Alert.ResolvedAt.Format("02 Jan 2006 15:04:05 MST")
		timeUTC = data.Alert.ResolvedAt.UTC().Format("15:04:05 UTC")
	}

	hostDisplay := data.Hostname
	if hostDisplay == "" {
		hostDisplay = data.Alert.MachineID.String()
	}

	whyContent := fmt.Sprintf("Metric <strong>%.1f</strong> violated threshold <strong>%.1f</strong>.<br><span style=\"color:#64748b;font-size:13px;\">%s</span>",
		data.Alert.MetricValue, data.Alert.Threshold, data.Alert.Message)
	if data.IsResolution {
		whyContent = fmt.Sprintf("Telemetry normalized below threshold <strong>%.1f</strong>.", data.Alert.Threshold)
	}

	// Build Processes HTML Table if available
	var procHTML string
	if len(data.TopProcesses) > 0 && !data.IsResolution {
		var rows strings.Builder
		for _, p := range data.TopProcesses {
			rows.WriteString(fmt.Sprintf(`
				<tr style="border-bottom: 1px solid #e2e8f0; font-family: monospace, Consolas, monospace; font-size: 13px;">
					<td style="padding: 8px 12px; color: #475569;">%d</td>
					<td style="padding: 8px 12px; font-weight: 600; color: #0f172a;">%s</td>
					<td style="padding: 8px 12px; color: #ef4444; font-weight: 600;">%.1f%%</td>
					<td style="padding: 8px 12px; color: #3b82f6;">%.1f%%</td>
					<td style="padding: 8px 12px; color: #64748b;">%s</td>
				</tr>
			`, p.PID, escapeHTML(p.Name), p.CPUPercent, p.MemoryPercent, escapeHTML(p.User)))
		}

		procHTML = fmt.Sprintf(`
			<div style="margin-top: 24px;">
				<div style="font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
					Top Resource Consuming Processes at Trigger Time:
				</div>
				<table style="width: 100%%; border-collapse: collapse; background-color: #f8fafc; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0;">
					<thead>
						<tr style="background-color: #f1f5f9; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569;">
							<th style="padding: 8px 12px;">PID</th>
							<th style="padding: 8px 12px;">Process</th>
							<th style="padding: 8px 12px;">CPU %%</th>
							<th style="padding: 8px 12px;">Memory %%</th>
							<th style="padding: 8px 12px;">User</th>
						</tr>
					</thead>
					<tbody>
						%s
					</tbody>
				</table>
			</div>
		`, rows.String())
	}

	// Outage duration pill
	var durationHTML string
	if data.IsResolution && data.OutageDuration > 0 {
		durationHTML = fmt.Sprintf(`
			<div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 4px; margin-top: 20px;">
				<div style="font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase;">Total Incident Downtime</div>
				<div style="font-size: 18px; font-weight: 800; color: #047857; margin-top: 2px;">%s</div>
			</div>
		`, formatDuration(data.OutageDuration))
	}

	// Action buttons
	var actionsHTML string
	if data.DashboardURL != "" || data.TerminalURL != "" {
		actionsHTML = `<div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px;">`
		if data.DashboardURL != "" {
			actionsHTML += fmt.Sprintf(`
				<a href="%s" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-block; margin-right: 10px;">
					View Machine Dashboard &rarr;
				</a>
			`, data.DashboardURL)
		}
		if data.TerminalURL != "" {
			actionsHTML += fmt.Sprintf(`
				<a href="%s" style="background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-block;">
					Open Fleet Terminal &rarr;
				</a>
			`, data.TerminalURL)
		}
		actionsHTML += `</div>`
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
	<div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
		
		<!-- Header -->
		<div style="background-color: #0f172a; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid %s;">
			<div>
				<div style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">INFRAPILOT <span style="color: #38bdf8; font-weight: 400;">ENTERPRISE</span></div>
				<div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Automated Infrastructure Monitoring &amp; Alert Engine</div>
			</div>
			<div style="background-color: %s; color: %s; border: 1px solid %s; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">
				%s
			</div>
		</div>

		<!-- Body Card -->
		<div style="padding: 24px;">
			<h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a;">%s</h2>
			
			%s

			<!-- The 4 W's Grid -->
			<div style="margin-top: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
				<div style="display: flex; border-bottom: 1px solid #e2e8f0;">
					<div style="width: 90px; padding: 12px; font-size: 11px; font-weight: 700; color: #64748b; background-color: #f1f5f9; text-transform: uppercase;">WHAT</div>
					<div style="padding: 12px; font-size: 13px; color: #0f172a; flex: 1;">
						<strong>%s</strong> &bull; Category: <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px;">%s</span> Component: <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px;">%s</span>
					</div>
				</div>

				<div style="display: flex; border-bottom: 1px solid #e2e8f0;">
					<div style="width: 90px; padding: 12px; font-size: 11px; font-weight: 700; color: #64748b; background-color: #f1f5f9; text-transform: uppercase;">WHY</div>
					<div style="padding: 12px; font-size: 13px; color: #0f172a; flex: 1;">
						%s
					</div>
				</div>

				<div style="display: flex; border-bottom: 1px solid #e2e8f0;">
					<div style="width: 90px; padding: 12px; font-size: 11px; font-weight: 700; color: #64748b; background-color: #f1f5f9; text-transform: uppercase;">WHERE</div>
					<div style="padding: 12px; font-size: 13px; color: #0f172a; flex: 1;">
						<strong>%s</strong> %s %s<br>
						<span style="font-family: monospace; font-size: 11px; color: #64748b;">Machine UUID: %s</span>
					</div>
				</div>

				<div style="display: flex;">
					<div style="width: 90px; padding: 12px; font-size: 11px; font-weight: 700; color: #64748b; background-color: #f1f5f9; text-transform: uppercase;">WHEN</div>
					<div style="padding: 12px; font-size: 13px; color: #0f172a; flex: 1;">
						<strong>%s</strong> <span style="color: #64748b;">(%s)</span>
					</div>
				</div>
			</div>

			%s

			%s
		</div>

		<!-- Footer -->
		<div style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
			This is an automated lifecycle notification from InfraPilot Enterprise Alert Engine.<br>
			Trigger emails are dispatched once on breach and resolution emails are dispatched once upon recovery.
		</div>
	</div>
</body>
</html>`,
		escapeHTML(data.Alert.Title),
		accentColor,
		statusBadgeBg,
		accentColor,
		statusBadgeBorder,
		statusText,
		escapeHTML(data.Alert.Title),
		durationHTML,
		escapeHTML(data.Alert.Title),
		escapeHTML(data.Alert.Category),
		escapeHTML(data.Alert.Component),
		whyContent,
		escapeHTML(hostDisplay),
		formatIP(data.IPAddress),
		formatPlatform(data.Platform),
		data.Alert.MachineID.String(),
		timeLocal,
		timeUTC,
		procHTML,
		actionsHTML,
	)
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

func formatIP(ip string) string {
	if ip == "" {
		return ""
	}
	return fmt.Sprintf(" &bull; <span style=\"font-family: monospace;\">%s</span>", ip)
}

func formatPlatform(platform string) string {
	if platform == "" {
		return ""
	}
	return fmt.Sprintf(" &bull; <span style=\"background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:11px;\">%s</span>", platform)
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second

	if h > 0 {
		return fmt.Sprintf("%dh %dm %ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
