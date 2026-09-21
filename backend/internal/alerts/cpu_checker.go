package alerts

import (
	"fmt"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
)

// CheckCPUHealth evaluates CPU utilization, temperature, and load average.
func CheckCPUHealth(machine models.Machine, metric models.Metric, input services.SaveMetricInput) []models.LinuxAlert {
	var alerts []models.LinuxAlert

	// 1. CPU Usage Check
	cpuVal := input.CPUUsage
	if cpuVal == 0 {
		cpuVal = metric.CPUUsage
	}

	if cpuVal > 95.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High CPU Usage",
			Description:        fmt.Sprintf("CPU usage reached critical level: %.1f%%", cpuVal),
			Category:           "CPU",
			Component:          "processor",
			Source:             "CPUChecker",
			Type:               "cpu_usage",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            fmt.Sprintf("CPU Usage Critical: %.1f%% > 95.0%%", cpuVal),
			MetricValue:        cpuVal,
			Threshold:          95.0,
			Status:             "OPEN",
			RecoverySuggestion: "Identify top CPU-consuming processes (`top` or `htop`). Scale workloads or restart high-usage background services.",
		})
	} else if cpuVal > 90.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High CPU Usage",
			Description:        fmt.Sprintf("CPU usage reached warning level: %.1f%%", cpuVal),
			Category:           "CPU",
			Component:          "processor",
			Source:             "CPUChecker",
			Type:               "cpu_usage",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("CPU Usage Warning: %.1f%% > 90.0%%", cpuVal),
			MetricValue:        cpuVal,
			Threshold:          90.0,
			Status:             "OPEN",
			RecoverySuggestion: "Monitor CPU trend. Check for runaway loops or unoptimized worker threads.",
		})
	}

	// 2. CPU Temperature Check
	if input.CPUTemperature > 95.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "CPU Temperature Critical",
			Description:        fmt.Sprintf("CPU temperature reached dangerous level: %.1f°C", input.CPUTemperature),
			Category:           "CPU",
			Component:          "thermal_zone",
			Source:             "CPUChecker",
			Type:               "cpu_temperature",
			Severity:           "Critical",
			Priority:           models.MapSeverityToPriority("Critical"),
			Message:            fmt.Sprintf("CPU Temperature Critical: %.1f°C > 95.0°C", input.CPUTemperature),
			MetricValue:        input.CPUTemperature,
			Threshold:          95.0,
			Status:             "OPEN",
			RecoverySuggestion: "Check server cooling, fan speeds, and airflow immediately to prevent hardware thermal throttling.",
		})
	} else if input.CPUTemperature > 85.0 {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "CPU Temperature High",
			Description:        fmt.Sprintf("CPU temperature elevated: %.1f°C", input.CPUTemperature),
			Category:           "CPU",
			Component:          "thermal_zone",
			Source:             "CPUChecker",
			Type:               "cpu_temperature",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("CPU Temperature Warning: %.1f°C > 85.0°C", input.CPUTemperature),
			MetricValue:        input.CPUTemperature,
			Threshold:          85.0,
			Status:             "OPEN",
			RecoverySuggestion: "Verify server room ambient temperature and cooling system status.",
		})
	}

	// 3. Load Average vs CPU Cores Check
	cores := input.CPUCores
	if cores <= 0 {
		cores = metric.CPUCores
	}
	if cores > 0 && input.Load1 > float64(cores) {
		alerts = append(alerts, models.LinuxAlert{
			Title:              "High Load Average",
			Description:        fmt.Sprintf("System load average (1m: %.2f) exceeds CPU core capacity (%d cores)", input.Load1, cores),
			Category:           "CPU",
			Component:          "scheduler",
			Source:             "CPUChecker",
			Type:               "load_average",
			Severity:           "Warning",
			Priority:           models.MapSeverityToPriority("Warning"),
			Message:            fmt.Sprintf("Load Average %.2f > %d Cores", input.Load1, cores),
			MetricValue:        input.Load1,
			Threshold:          float64(cores),
			Status:             "OPEN",
			RecoverySuggestion: "Check I/O wait times (`iostat`) or thread contention (`vmstat`). Consider increasing CPU core allocation.",
		})
	}

	return alerts
}
