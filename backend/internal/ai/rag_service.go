package ai

import (
	"fmt"
	"strings"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

type RAGService struct{}

func NewRAGService() *RAGService {
	return &RAGService{}
}

func (r *RAGService) RetrieveContext(query string) string {
	db := database.DB
	if db == nil {
		return "Live Telemetry Summary: Database unavailable. No active telemetry stream."
	}

	var servers []models.Server
	_ = db.Find(&servers).Error

	var sb strings.Builder
	sb.WriteString("Live Infrastructure Telemetry Summary:\n")

	if len(servers) == 0 {
		sb.WriteString("- Monitored Servers: 0 registered nodes.\n")
	} else {
		sb.WriteString(fmt.Sprintf("- Monitored Servers (%d total):\n", len(servers)))
		for _, s := range servers {
			var metric models.LinuxMetric
			metricStr := "no metrics reported"
			if s.ID != [16]byte{} {
				if err := db.Where("machine_id = ?", s.ID).Order("sampled_at desc").First(&metric).Error; err == nil {
					metricStr = fmt.Sprintf("CPU: %.1f%%, Memory: %.1f%%, Disk: %.1f%%", metric.CPUUsage, metric.MemoryPercent, metric.DiskUsage)
				}
			}
			sb.WriteString(fmt.Sprintf("  * Host %s (%s, %s): %s | %s\n", s.Hostname, s.IPAddress, s.OS, s.Status, metricStr))
		}
	}

	var openIncidentsCount int64
	_ = db.Model(&models.Incident{}).Where("status != ?", "RESOLVED").Count(&openIncidentsCount).Error
	sb.WriteString(fmt.Sprintf("- Active Incidents: %d open\n", openIncidentsCount))

	var containerCount int64
	_ = db.Model(&models.DockerContainer{}).Count(&containerCount).Error
	sb.WriteString(fmt.Sprintf("- Docker Containers: %d active\n", containerCount))

	return sb.String()
}
