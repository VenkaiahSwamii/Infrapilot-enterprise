package models

import (
	"time"

	"github.com/google/uuid"
)

type Metric struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	MachineID     uuid.UUID `gorm:"type:uuid;index;not null" json:"machine_id"`
	CPUUsage      float64   `json:"cpu_usage"`
	MemoryUsage   float64   `json:"memory_usage"`
	DiskUsage     float64   `json:"disk_usage"`
	MemoryPercent float64   `json:"memory_percent"`
	DiskPercent   float64   `json:"disk_percent"`
	LatencyMs     float64   `json:"latency_ms"`
	UploadMbps    float64   `json:"upload_mbps"`
	DownloadMbps  float64   `json:"download_mbps"`
	Uptime        uint64    `json:"uptime"`
	CreatedAt     time.Time `gorm:"index" json:"created_at"`

	// Rich metrics fields from Sprint 2.2 Step 3
	Hostname       string  `json:"hostname"`
	IPAddress      string  `json:"ip_address"`
	OS             string  `json:"os"`
	CPUTemperature float64 `json:"cpu_temperature"`
	CPUCores       int     `json:"cpu_cores"`
	CPUModel       string  `json:"cpu_model"`
	TotalMemory    uint64  `json:"total_memory"`
	FreeMemory     uint64  `json:"free_memory"`
	MemoryTotal    uint64  `json:"memory_total"`
	MemoryUsed     uint64  `json:"memory_used"`
	DiskTotal      uint64  `json:"disk_total"`
	DiskUsed       uint64  `json:"disk_used"`
}
