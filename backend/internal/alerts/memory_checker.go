package alerts

import (
	"fmt"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
)

// CheckMemoryHealth evaluates RAM usage, Swap utilization, and Free Memory.
func CheckMemoryHealth(machine models.Machine, metric models.Metric, input services.SaveMetricInput) []models.LinuxAlert {
	var alerts []models.LinuxAlert

	memPct := input.MemoryPercent
	if memPct == 0 {
		memPct = metric.MemoryPercent
	}
	if memPct == 0 {
		memPct = metric.MemoryUsage
	}

	// 1. RAM Utilization Check
	if memPct > 95.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High Memory Usage",
			Description:        fmt.Sprintf("RAM usage reached critical level: %.1f%%", memPct),
			Category:           "Memory",
			Component:          "ram",
			Source:             "MemoryChecker",
			Type:               "memory_percent",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            fmt.Sprintf("Memory Usage Critical: %.1f%% > 95.0%%", memPct),
			MetricValue:        memPct,
			Threshold:          95.0,
			Status:             "OPEN",
			RecoverySuggestion: "Free RAM immediately or restart memory-leaking processes. Drop PageCache (`sync; echo 3 > /proc/sys/vm/drop_caches`) or allocate more RAM.",
		})
	} else if memPct > 85.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High Memory Usage",
			Description:        fmt.Sprintf("RAM usage reached warning level: %.1f%%", memPct),
			Category:           "Memory",
			Component:          "ram",
			Source:             "MemoryChecker",
			Type:               "memory_percent",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("Memory Usage Warning: %.1f%% > 85.0%%", memPct),
			MetricValue:        memPct,
			Threshold:          85.0,
			Status:             "OPEN",
			RecoverySuggestion: "Investigate memory usage by process (`ps aux --sort=-%mem`).",
		})
	}

	// 2. Swap Utilization Check
	if input.SwapUsage > 80.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High Swap Usage",
			Description:        fmt.Sprintf("Swap space utilization high: %.1f%%", input.SwapUsage),
			Category:           "Memory",
			Component:          "swap",
			Source:             "MemoryChecker",
			Type:               "swap_usage",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("Swap Usage Warning: %.1f%% > 80.0%%", input.SwapUsage),
			MetricValue:        input.SwapUsage,
			Threshold:          80.0,
			Status:             "OPEN",
			RecoverySuggestion: "High swap thrashing causes disk I/O degradation. Tune `sysctl vm.swappiness` or increase physical RAM.",
		})
	}

	// 3. Low Free Memory Check (<500MB free)
	const minFreeBytes uint64 = 500 * 1024 * 1024 // 500MB
	freeRam := input.FreeMemory
	if freeRam == 0 {
		freeRam = metric.FreeMemory
	}
	if freeRam > 0 && freeRam < minFreeBytes {
		freeMB := float64(freeRam) / (1024 * 1024)
		alerts = append(alerts, models.LinuxAlert{
			Title:              "Low Free Memory",
			Description:        fmt.Sprintf("Available free memory dangerously low: %.0f MB remaining", freeMB),
			Category:           "Memory",
			Component:          "free_ram",
			Source:             "MemoryChecker",
			Type:               "free_memory",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            fmt.Sprintf("Free Memory Low: %.0f MB < 500 MB", freeMB),
			MetricValue:        freeMB,
			Threshold:          500.0,
			Status:             "OPEN",
			RecoverySuggestion: "Risk of OOM Killer terminating vital services. Increase system RAM or reduce cached workload buffers.",
		})
	}

	return alerts
}
