package alerts

import (
	"fmt"
	"strings"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
)

// CheckSecurityHealth evaluates SSH availability, firewall enablement, and dangerous open ports.
func CheckSecurityHealth(machine models.Machine, metric models.Metric, input services.SaveMetricInput) []models.LinuxAlert {
	var alerts []models.LinuxAlert

	// 1. Insecure / Dangerous Open Ports Check
	dangerousPorts := map[string]string{
		"23":   "Telnet (Unencrypted plaintext credentials)",
		"21":   "FTP (Unencrypted file transfer)",
		"69":   "TFTP (Trivial FTP without auth)",
		"513":  "Rexec / Rlogin (Legacy remote access)",
		"111":  "Portmapper / RPCbind",
		"3389": "Exposed RDP Port",
	}

	for _, port := range input.OpenPorts {
		cleanPort := strings.TrimSpace(port)
		// Extract port number if in host:port or ip:port format
		if idx := strings.LastIndex(cleanPort, ":"); idx != -1 {
			cleanPort = cleanPort[idx+1:]
		}

		if desc, isDangerous := dangerousPorts[cleanPort]; isDangerous {
			alerts = append(alerts, models.LinuxAlert{
				Title:              "Insecure Open Port Detected",
				Description:        fmt.Sprintf("Potentially insecure open network port detected: Port %s (%s)", cleanPort, desc),
				Category:           "Security",
				Component:          fmt.Sprintf("port_%s", cleanPort),
				Source:             "SecurityChecker",
				Type:               "insecure_port",
				Severity:           "Warning",
				Priority:           models.MapSeverityToPriority("Warning"),
				Message:            fmt.Sprintf("Insecure Open Port %s: %s", cleanPort, desc),
				Status:             "OPEN",
				RecoverySuggestion: fmt.Sprintf("Close port %s using firewall rules (`ufw deny %s` or `iptables -A INPUT -p tcp --dport %s -j DROP`) or disable unencrypted service.", cleanPort, cleanPort, cleanPort),
			})
		}
	}

	// 2. SSH Service Check
	sshFound := false
	sshDown := false
	firewallInactive := false

	for _, svc := range input.Services {
		sName := strings.ToLower(svc.Name)
		sStatus := strings.ToLower(svc.Status)

		if sName == "ssh" || sName == "sshd" {
			sshFound = true
			if sStatus == "stopped" || sStatus == "failed" || sStatus == "inactive" || sStatus == "dead" {
				sshDown = true
			}
		}

		if sName == "ufw" || sName == "firewalld" || sName == "iptables" {
			if sStatus == "stopped" || sStatus == "inactive" || sStatus == "disabled" {
				firewallInactive = true
			}
		}
	}

	isWindows := strings.EqualFold(machine.OS, "windows") || strings.Contains(strings.ToLower(machine.OS), "win")
	if !isWindows && sshFound && sshDown {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "SSH Service Down",
			Description:        "SSH remote daemon service is stopped or inactive, blocking secure admin access",
			Category:           "Security",
			Component:          "sshd",
			Source:             "SecurityChecker",
			Type:               "ssh_down",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            "SSH Service Down (Remote SSH Access Unavailable)",
			Status:             "OPEN",
			RecoverySuggestion: "Restart SSH service on host terminal (`systemctl restart ssh` or `systemctl restart sshd`).",
		})
	}

	if firewallInactive {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "Firewall Disabled",
			Description:        "System host firewall service (UFW/Firewalld) is inactive or disabled",
			Category:           "Security",
			Component:          "firewall",
			Source:             "SecurityChecker",
			Type:               "firewall_disabled",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            "Host Firewall Service Inactive / Disabled",
			Status:             "OPEN",
			RecoverySuggestion: "Enable host firewall (`ufw enable` or `systemctl start firewalld`).",
		})
	}

	return alerts
}
