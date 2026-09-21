package alerts

import (
	"fmt"
	"strings"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
)

// CheckServiceHealth evaluates Linux system service statuses.
func CheckServiceHealth(machine models.Machine, metric models.Metric, input services.SaveMetricInput) []models.LinuxAlert {
	var alerts []models.LinuxAlert

	criticalServices := map[string]string{
		"nginx":            "Web Server",
		"sshd":             "SSH Remote Access",
		"ssh":              "SSH Remote Access",
		"cron":             "System Job Scheduler",
		"crond":            "System Job Scheduler",
		"journald":         "System Logging Daemon",
		"systemd-journald": "System Logging Daemon",
		"docker":           "Docker Container Engine",
		"kubelet":          "Kubernetes Kubelet Node Agent",
		"postgresql":       "PostgreSQL Database",
		"postgres":         "PostgreSQL Database",
		"mysql":            "MySQL Database",
		"mysqld":           "MySQL Database",
		"redis":            "Redis Cache",
		"redis-server":     "Redis Cache",
		"systemd-resolved": "System DNS Resolver",
	}

	for _, svc := range input.Services {
		svcName := strings.ToLower(strings.TrimSpace(svc.Name))
		svcStatus := strings.ToLower(strings.TrimSpace(svc.Status))

		if description, isCritical := criticalServices[svcName]; isCritical {
			if svcStatus == "stopped" || svcStatus == "failed" || svcStatus == "inactive" || svcStatus == "dead" || svcStatus == "exited" {
				alerts = append(alerts, models.LinuxAlert{
					Title:              "Service Down",
					Description:        fmt.Sprintf("Critical system service '%s' (%s) is stopped or failed", svc.Name, description),
					Category:           "Service",
					Component:          svc.Name,
					Source:             "ServiceChecker",
					Type:               "service_status",
					Severity:           "Critical",
					Priority:           models.MapSeverityToPriority("Critical"),
					Message:            fmt.Sprintf("Service Down: %s is Stopped", svc.Name),
					Status:             "OPEN",
					RecoverySuggestion: fmt.Sprintf("Restart service using `systemctl restart %s` and check journal logs (`journalctl -u %s -n 50`).", svc.Name, svc.Name),
				})
			}
		} else {
			// Non-critical custom service check
			if svcStatus == "failed" {
				alerts = append(alerts, models.LinuxAlert{
					Title:              "Service Failed",
					Description:        fmt.Sprintf("System service '%s' entered failed state", svc.Name),
					Category:           "Service",
					Component:          svc.Name,
					Source:             "ServiceChecker",
					Type:               "service_status",
					Severity:           "Warning",
					Priority:           models.MapSeverityToPriority("Warning"),
					Message:            fmt.Sprintf("Service Failed: %s", svc.Name),
					Status:             "OPEN",
					RecoverySuggestion: fmt.Sprintf("Check service logs using `journalctl -u %s`.", svc.Name),
				})
			}
		}
	}

	return alerts
}
