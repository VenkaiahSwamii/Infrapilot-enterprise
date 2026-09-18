package archival

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/pelletier/go-toml/v2"
	"gorm.io/gorm"
)

type ArchivalConfig struct {
	Enabled                 bool   `toml:"enabled" json:"enabled"`
	APIEndpoint             string `toml:"api_endpoint" json:"api_endpoint"`
	APIKey                  string `toml:"api_key" json:"api_key"`
	EventRetentionMinutes   int    `toml:"event_retention_minutes" json:"event_retention_minutes"`
	RawRetentionMinutes     int    `toml:"raw_retention_minutes" json:"raw_retention_minutes"`
	ExportEvents            bool   `toml:"export_events" json:"export_events"`
	ExportRawMetrics        bool   `toml:"export_raw_metrics" json:"export_raw_metrics"`
	ExportAggregatedMetrics bool   `toml:"export_aggregated_metrics" json:"export_aggregated_metrics"`
}

func LoadArchivalConfig() ArchivalConfig {
	cfg := ArchivalConfig{
		Enabled:               true,
		APIEndpoint:           "https://ijlkg6lgp3m6lb7ekfhbz2phwe0izzqh.lambda-url.ap-south-1.on.aws/",
		EventRetentionMinutes: 10,
		RawRetentionMinutes:   60,
		ExportEvents:          true,
		ExportRawMetrics:      true,
	}

	// Try reading config.toml if present
	if data, err := os.ReadFile("config.toml"); err == nil {
		var tomlData struct {
			Server struct {
				Archival ArchivalConfig `toml:"archival"`
			} `toml:"server"`
		}
		if err := toml.Unmarshal(data, &tomlData); err == nil && tomlData.Server.Archival.APIEndpoint != "" {
			cfg = tomlData.Server.Archival
		}
	}

	if envEndpoint := os.Getenv("AWS_LAMBDA_ARCHIVAL_URL"); envEndpoint != "" {
		cfg.APIEndpoint = envEndpoint
	}

	return cfg
}

func RunArchivalPipeline(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database connection is nil")
	}

	cfg := LoadArchivalConfig()
	if !cfg.Enabled || cfg.APIEndpoint == "" {
		log.Println("[Archival Pipeline] Cold storage archival is disabled or API endpoint is missing.")
		return nil
	}

	log.Printf("[Archival Pipeline] Starting cold storage export to AWS Lambda URL: %s", cfg.APIEndpoint)

	archiveDir := os.TempDir()
	timestamp := time.Now().Format("20060102_150405")
	archiveFileName := fmt.Sprintf("infrapilot_cold_archive_%s.jsonl", timestamp)
	archivePath := filepath.Join(archiveDir, archiveFileName)

	file, err := os.Create(archivePath)
	if err != nil {
		return fmt.Errorf("failed to create temporary archive file: %w", err)
	}

	archiveCount := 0

	// 1. Export Events if enabled
	var eventIDs []string
	if cfg.ExportEvents {
		eventCutoff := time.Now().Add(-time.Duration(cfg.EventRetentionMinutes) * time.Minute)
		var events []models.AuditLog
		if err := db.Where("created_at < ?", eventCutoff).Find(&events).Error; err == nil && len(events) > 0 {
			for _, evt := range events {
				line, _ := json.Marshal(map[string]interface{}{
					"type":       "audit_log",
					"id":         evt.ID.String(),
					"username":   evt.Username,
					"action":     evt.Action,
					"resource":   evt.Resource,
					"result":     evt.Result,
					"created_at": evt.CreatedAt,
					"machine_id": evt.MachineID.String(),
				})
				file.Write(append(line, '\n'))
				eventIDs = append(eventIDs, evt.ID.String())
				archiveCount++
			}
		}
	}

	// 2. Export Metrics if enabled
	var metricIDs []string
	if cfg.ExportRawMetrics {
		metricCutoff := time.Now().Add(-time.Duration(cfg.RawRetentionMinutes) * time.Minute)
		var metrics []models.Metric
		if err := db.Where("created_at < ?", metricCutoff).Find(&metrics).Error; err == nil && len(metrics) > 0 {
			for _, m := range metrics {
				line, _ := json.Marshal(map[string]interface{}{
					"type":           "metric",
					"id":             m.ID.String(),
					"machine_id":     m.MachineID.String(),
					"cpu_usage":      m.CPUUsage,
					"memory_usage":   m.MemoryUsage,
					"disk_usage":     m.DiskUsage,
					"memory_percent": m.MemoryPercent,
					"disk_percent":   m.DiskPercent,
					"created_at":     m.CreatedAt,
					"hostname":       m.Hostname,
				})
				file.Write(append(line, '\n'))
				metricIDs = append(metricIDs, m.ID.String())
				archiveCount++
			}
		}
	}

	file.Close()

	if archiveCount == 0 {
		log.Println("[Archival Pipeline] No cold telemetry records found matching retention threshold.")
		_ = os.Remove(archivePath)
		return nil
	}

	log.Printf("[Archival Pipeline] Exported %d cold records to %s. Compressing and uploading...", archiveCount, archivePath)

	// 3. Compress file to .gz
	gzPath := archivePath + ".gz"
	if err := compressFile(archivePath, gzPath); err != nil {
		_ = os.Remove(archivePath)
		return fmt.Errorf("failed to compress archive file: %w", err)
	}

	// 4. Upload to AWS Lambda URL
	err = uploadToAWSLambda(gzPath, cfg.APIEndpoint, cfg.APIKey)
	_ = os.Remove(archivePath)
	_ = os.Remove(gzPath)

	if err != nil {
		return fmt.Errorf("cold storage AWS Lambda upload failed (retaining records in DB): %w", err)
	}

	log.Println("[Archival Pipeline] Upload successful! Purging exported cold records from DB...")

	// 5. Purge archived records from DB after upload confirmation
	if len(eventIDs) > 0 {
		db.Where("id IN ?", eventIDs).Delete(&models.AuditLog{})
	}
	if len(metricIDs) > 0 {
		db.Where("id IN ?", metricIDs).Delete(&models.Metric{})
	}

	log.Printf("[Archival Pipeline] Cleaned up %d events and %d metrics from database.", len(eventIDs), len(metricIDs))
	return nil
}

func compressFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	gz := gzip.NewWriter(out)
	defer gz.Close()

	_, err = io.Copy(gz, in)
	return err
}

func uploadToAWSLambda(gzPath, endpoint, apiKey string) error {
	f, err := os.Open(gzPath)
	if err != nil {
		return err
	}
	defer f.Close()

	req, err := http.NewRequest("POST", endpoint, f)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/gzip")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("AWS Lambda upload returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
