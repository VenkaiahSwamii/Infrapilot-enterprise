package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Server model represents the unified Server/Machine entity (Sprint 10.2)
type Server struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name            string    `json:"name"`
	Hostname        string    `json:"hostname"`
	IPAddress       string    `json:"ip_address"`
	OS              string    `json:"os"`
	OperatingSystem string    `json:"operating_system"`
	Platform        string    `json:"platform"`
	AgentVersion    string    `json:"agent_version"`
	Username        string    `gorm:"column:username;default:''" json:"username,omitempty"`

	ResourceType   string `gorm:"default:windows" json:"resource_type"`
	Organization   string `gorm:"default:Default Organization" json:"organization"`
	OrganizationID string `gorm:"index" json:"organization_id"`
	Kernel         string `json:"kernel"`
	Architecture   string `json:"architecture"`
	MACAddress     string `json:"mac_address"`
	CPUModel       string `json:"cpu_model"`
	TotalMemoryGB  uint64 `json:"total_memory_gb"`
	TotalDiskGB    uint64 `json:"total_disk_gb"`
	GPU            string `json:"gpu"`
	Virtualization string `json:"virtualization"`
	CloudProvider  string `json:"cloud_provider"`

	Status    string `gorm:"default:ONLINE" json:"status"`
	Online    bool   `json:"online"`
	IsBlocked bool   `gorm:"default:false" json:"is_blocked"`

	HealthScore float64 `gorm:"default:100" json:"health_score"`

	LastSeen time.Time `json:"last_seen"`

	RetryCount int `gorm:"default:0" json:"retry_count"`

	APIKey        string    `gorm:"index:idx_servers_api_key,unique,where:api_key IS NOT NULL AND api_key != ''" json:"-"`
	KeyVersion    int       `gorm:"default:1" json:"key_version"`
	LastKeyRotate time.Time `json:"last_key_rotate"`

	// Relational snapshot metrics (optional, mapped via MachineID)
	LinuxMetric *LinuxMetric     `gorm:"foreignKey:MachineID" json:"linux_metric,omitempty"`
	LinuxDocker *LinuxDocker     `gorm:"foreignKey:MachineID" json:"linux_docker,omitempty"`
	LinuxK8s    *LinuxKubernetes `gorm:"foreignKey:MachineID" json:"linux_k8s,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Server) TableName() string {
	return "servers"
}

func (s *Server) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

type ServerSnapshot struct {
	Server
	CPUUsage        *float64   `json:"cpu_usage"`
	MemoryUsage     *float64   `json:"memory_usage"`
	DiskUsage       *float64   `json:"disk_usage"`
	StorageUsage    *float64   `json:"storage_usage"`
	UploadMbps      *float64   `json:"upload_mbps"`
	DownloadMbps    *float64   `json:"download_mbps"`
	LatencyMs       *float64   `json:"latency_ms"`
	NetworkMbps     *float64   `json:"network_mbps"`
	Uptime          *uint64    `json:"uptime"`
	MetricAt        *time.Time `json:"metric_at"`
	CPUTemperature  *float64   `json:"cpu_temperature"`
	CPUFrequencyMHz *float64   `json:"cpu_frequency_mhz"`
	CPUCores        *int       `json:"cpu_cores"`
	DiskReadBps     *float64   `json:"disk_read_bps"`
	DiskWriteBps    *float64   `json:"disk_write_bps"`
	DiskIOPS        *float64   `json:"disk_iops"`
	MemoryTotal     uint64     `json:"memory_total"`
	MemoryUsed      uint64     `json:"memory_used"`
	DiskTotal       uint64     `json:"disk_total"`
	DiskUsed        uint64     `json:"disk_used"`
}
