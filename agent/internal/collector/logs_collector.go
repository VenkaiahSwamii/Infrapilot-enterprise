package collector

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/google/uuid"
)

type AgentLogEntry struct {
	ID        uuid.UUID `json:"id"`
	MachineID uuid.UUID `json:"machine_id"`
	Hostname  string    `json:"hostname"`
	Platform  string    `json:"platform"`
	Level     string    `json:"level"`
	Source    string    `json:"source"`
	Service   string    `json:"service,omitempty"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type LogsCollector struct {
	lastProcessed time.Time
	initialized   bool
}

func NewLogsCollector() *LogsCollector {
	return &LogsCollector{lastProcessed: time.Now().Add(-10 * time.Minute)}
}

func (c *LogsCollector) CollectLogs(machineID uuid.UUID) []AgentLogEntry {
	now := time.Now()
	hostname, _ := os.Hostname()
	platform := runtime.GOOS

	var logs []AgentLogEntry
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	maxTs := c.lastProcessed

	if platform == "windows" {
		winLogs, latestTs := c.collectWindowsLogs(ctx, machineID, hostname)
		logs = append(logs, winLogs...)
		if latestTs.After(maxTs) {
			maxTs = latestTs
		}
	} else {
		linLogs, latestTs := c.collectLinuxLogs(ctx, machineID, hostname)
		logs = append(logs, linLogs...)
		if latestTs.After(maxTs) {
			maxTs = latestTs
		}
	}

	// Mark initialized after first collection cycle
	c.initialized = true

	// Always append agent telemetry / health status log
	logs = append(logs, AgentLogEntry{
		ID:        uuid.New(),
		MachineID: machineID,
		Hostname:  hostname,
		Platform:  platform,
		Level:     "INFO",
		Source:    "agent",
		Service:   "infrapilot-agent",
		Message:   fmt.Sprintf("Agent telemetry cycle active on %s (OS: %s, collected %d events)", hostname, platform, len(logs)),
		Timestamp: now,
	})

	if maxTs.After(c.lastProcessed) {
		c.lastProcessed = maxTs
	} else {
		c.lastProcessed = now
	}

	return logs
}

func (c *LogsCollector) collectWindowsLogs(ctx context.Context, machineID uuid.UUID, hostname string) ([]AgentLogEntry, time.Time) {
	var entries []AgentLogEntry
	latestTs := c.lastProcessed

	// Query System and Application event logs using wevtutil
	channels := []string{"System", "Application"}
	for _, ch := range channels {
		cmd := exec.CommandContext(ctx, "wevtutil", "qe", ch, "/c:15", "/rd:true", "/f:text")
		out, err := cmd.Output()
		if err != nil {
			continue
		}

		filterTime := c.lastProcessed
		if !c.initialized {
			filterTime = time.Time{} // First run: capture latest events unconditionally
		}

		parsed, ts := parseWevtutilOutput(string(out), ch, machineID, hostname, filterTime)
		entries = append(entries, parsed...)
		if ts.After(latestTs) {
			latestTs = ts
		}
	}

	return entries, latestTs
}

func parseWevtutilOutput(output string, channel string, machineID uuid.UUID, hostname string, afterTime time.Time) ([]AgentLogEntry, time.Time) {
	var entries []AgentLogEntry
	latestTs := afterTime

	blocks := strings.Split(output, "Event[")
	for _, block := range blocks {
		if strings.TrimSpace(block) == "" {
			continue
		}

		var eventSource, eventID, rawLevel, eventDesc string
		var eventTime time.Time

		lines := strings.Split(block, "\n")
		isDesc := false
		var descLines []string

		for _, rawLine := range lines {
			line := strings.TrimRight(rawLine, "\r")
			if isDesc {
				descLines = append(descLines, strings.TrimSpace(line))
				continue
			}

			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "Source:") {
				eventSource = strings.TrimSpace(strings.TrimPrefix(trimmed, "Source:"))
			} else if strings.HasPrefix(trimmed, "Date:") {
				dateStr := strings.TrimSpace(strings.TrimPrefix(trimmed, "Date:"))
				t, err := time.Parse(time.RFC3339Nano, dateStr)
				if err != nil {
					t, err = time.Parse("2006-01-02T15:04:05.9999999Z", dateStr)
					if err != nil {
						t, err = time.Parse(time.RFC3339, dateStr)
					}
				}
				if err == nil {
					eventTime = t
				}
			} else if strings.HasPrefix(trimmed, "Event ID:") {
				eventID = strings.TrimSpace(strings.TrimPrefix(trimmed, "Event ID:"))
			} else if strings.HasPrefix(trimmed, "Level:") {
				rawLevel = strings.TrimSpace(strings.TrimPrefix(trimmed, "Level:"))
			} else if strings.HasPrefix(trimmed, "Description:") {
				isDesc = true
			}
		}

		if eventTime.IsZero() {
			eventTime = time.Now()
		}

		if !afterTime.IsZero() && !eventTime.After(afterTime) {
			continue
		}

		if eventTime.After(latestTs) {
			latestTs = eventTime
		}

		level := "INFO"
		levelUpper := strings.ToUpper(rawLevel)
		if strings.Contains(levelUpper, "CRIT") {
			level = "CRITICAL"
		} else if strings.Contains(levelUpper, "ERR") {
			level = "ERROR"
		} else if strings.Contains(levelUpper, "WARN") {
			level = "WARN"
		} else if strings.Contains(levelUpper, "VERB") || strings.Contains(levelUpper, "DEBUG") {
			level = "DEBUG"
		}

		if eventSource == "" {
			eventSource = channel
		}

		eventDesc = strings.Join(descLines, " ")
		eventDesc = strings.TrimSpace(eventDesc)
		if len(eventDesc) > 400 {
			eventDesc = eventDesc[:400] + "..."
		}
		if eventDesc == "" {
			eventDesc = fmt.Sprintf("Windows Event %s logged by %s", eventID, eventSource)
		}

		msg := eventDesc
		if eventID != "" {
			msg = fmt.Sprintf("%s (Event ID: %s)", eventDesc, eventID)
		}

		entries = append(entries, AgentLogEntry{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  hostname,
			Platform:  "windows",
			Level:     level,
			Source:    "eventlog",
			Service:   eventSource,
			Message:   msg,
			Timestamp: eventTime,
		})
	}

	return entries, latestTs
}

func (c *LogsCollector) collectLinuxLogs(ctx context.Context, machineID uuid.UUID, hostname string) ([]AgentLogEntry, time.Time) {
	var entries []AgentLogEntry
	latestTs := c.lastProcessed

	cmd := exec.CommandContext(ctx, "journalctl", "-n", "20", "--no-pager", "-o", "short-iso")
	out, err := cmd.Output()
	if err == nil && len(out) > 0 {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, " ", 4)
			var ts time.Time
			var svc, msg string
			if len(parts) >= 4 {
				ts, _ = time.Parse(time.RFC3339, parts[0])
				svc = strings.TrimSuffix(parts[2], ":")
				msg = parts[3]
			} else {
				msg = line
			}
			if ts.IsZero() {
				ts = time.Now()
			}
			if !c.lastProcessed.IsZero() && !ts.After(c.lastProcessed) {
				continue
			}
			if ts.After(latestTs) {
				latestTs = ts
			}

			level := "INFO"
			msgUpper := strings.ToUpper(msg)
			if strings.Contains(msgUpper, "CRIT") || strings.Contains(msgUpper, "FATAL") {
				level = "CRITICAL"
			} else if strings.Contains(msgUpper, "ERR") || strings.Contains(msgUpper, "FAIL") {
				level = "ERROR"
			} else if strings.Contains(msgUpper, "WARN") {
				level = "WARN"
			}

			entries = append(entries, AgentLogEntry{
				ID:        uuid.New(),
				MachineID: machineID,
				Hostname:  hostname,
				Platform:  "linux",
				Level:     level,
				Source:    "journald",
				Service:   svc,
				Message:   msg,
				Timestamp: ts,
			})
		}
	}

	// Fallback to /var/log/syslog or /var/log/messages if journalctl returned 0 entries
	if len(entries) == 0 {
		for _, logPath := range []string{"/var/log/syslog", "/var/log/messages"} {
			if data, readErr := os.ReadFile(logPath); readErr == nil && len(data) > 0 {
				lines := strings.Split(string(data), "\n")
				startIdx := max(0, len(lines)-20)
				for _, line := range lines[startIdx:] {
					line = strings.TrimSpace(line)
					if line == "" {
						continue
					}
					level := "INFO"
					msgUpper := strings.ToUpper(line)
					if strings.Contains(msgUpper, "CRIT") || strings.Contains(msgUpper, "FATAL") {
						level = "CRITICAL"
					} else if strings.Contains(msgUpper, "ERR") || strings.Contains(msgUpper, "FAIL") {
						level = "ERROR"
					} else if strings.Contains(msgUpper, "WARN") {
						level = "WARN"
					}
					entries = append(entries, AgentLogEntry{
						ID:        uuid.New(),
						MachineID: machineID,
						Hostname:  hostname,
						Platform:  "linux",
						Level:     level,
						Source:    "syslog",
						Service:   "system",
						Message:   line,
						Timestamp: time.Now(),
					})
				}
				break
			}
		}
	}

	return entries, latestTs
}

