package alerts

import (
	"fmt"
	"strings"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
)

// CheckNetworkHealth evaluates network packet loss, latency, and interface state.
func CheckNetworkHealth(machine models.Machine, metric models.Metric, input services.SaveMetricInput) []models.LinuxAlert {
	var alerts []models.LinuxAlert

	// 1. Packet Loss Check
	if input.PacketLoss > 15.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "Network Packet Loss Critical",
			Description:        fmt.Sprintf("Network interface packet loss critical: %.1f%%", input.PacketLoss),
			Category:           "Network",
			Component:          "network_stack",
			Source:             "NetworkChecker",
			Type:               "packet_loss",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            fmt.Sprintf("Packet Loss Critical: %.1f%% > 15.0%%", input.PacketLoss),
			MetricValue:        input.PacketLoss,
			Threshold:          15.0,
			Status:             "OPEN",
			RecoverySuggestion: "Inspect network hardware switch ports, cables, and routing tables (`mtr` or `traceroute`).",
		})
	} else if input.PacketLoss > 5.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "Network Packet Loss Warning",
			Description:        fmt.Sprintf("Network interface packet loss detected: %.1f%%", input.PacketLoss),
			Category:           "Network",
			Component:          "network_stack",
			Source:             "NetworkChecker",
			Type:               "packet_loss",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("Packet Loss Warning: %.1f%% > 5.0%%", input.PacketLoss),
			MetricValue:        input.PacketLoss,
			Threshold:          5.0,
			Status:             "OPEN",
			RecoverySuggestion: "Verify network link quality and gateway stability.",
		})
	}

	// 2. Latency Check
	latencyVal := input.LatencyMs
	if latencyVal == 0 {
		latencyVal = metric.LatencyMs
	}

	if latencyVal > 300.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High Network Latency Critical",
			Description:        fmt.Sprintf("Network round-trip latency critical: %.1f ms", latencyVal),
			Category:           "Network",
			Component:          "network_stack",
			Source:             "NetworkChecker",
			Type:               "latency_ms",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            fmt.Sprintf("Latency Critical: %.1f ms > 300.0 ms", latencyVal),
			MetricValue:        latencyVal,
			Threshold:          300.0,
			Status:             "OPEN",
			RecoverySuggestion: "Check network congestion, DNS resolution performance, or upstream ISP routing degradation.",
		})
	} else if latencyVal > 100.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High Network Latency Warning",
			Description:        fmt.Sprintf("Network round-trip latency elevated: %.1f ms", latencyVal),
			Category:           "Network",
			Component:          "network_stack",
			Source:             "NetworkChecker",
			Type:               "latency_ms",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("Latency Warning: %.1f ms > 100.0 ms", latencyVal),
			MetricValue:        latencyVal,
			Threshold:          100.0,
			Status:             "OPEN",
			RecoverySuggestion: "Monitor network traffic bandwidth utilization.",
		})
	}

	// 3. Network Interface State Check
	for _, iface := range input.NetworkInterfaces {
		// Ignore loopback interfaces
		if iface.Name == "lo" || strings.HasPrefix(iface.Name, "loopback") {
			continue
		}
		// If interface name starts with eth/en/wlan and speed is 0 or MAC missing with no addresses
		if len(iface.Addresses) == 0 && (strings.HasPrefix(iface.Name, "eth") || strings.HasPrefix(iface.Name, "en")) {
			alerts = append(alerts, models.LinuxAlert{
				Title:              "Network Interface Down",
				Description:        fmt.Sprintf("Network interface '%s' has no IP address bound or link down", iface.Name),
				Category:           "Network",
				Component:          iface.Name,
				Source:             "NetworkChecker",
				Type:               "interface_down",
				Severity:           "Warning",
				Priority:           models.MapSeverityToPriority("Warning"),
				Message:            fmt.Sprintf("Network Interface %s Disconnected / Down", iface.Name),
				Status:             "OPEN",
				RecoverySuggestion: fmt.Sprintf("Check cable attachment or bring interface up (`ip link set %s up`).", iface.Name),
			})
		}
	}

	return alerts
}
