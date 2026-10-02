package models

import (
	"time"

	"github.com/google/uuid"
)

// LogEntry defines the comprehensive GORM model for centralized log monitoring
// Supporting Linux (syslog/journald), Windows EventLogs, Docker, and Kubernetes pod logs.
type LogEntry struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	MachineID uuid.UUID `gorm:"type:uuid;index;not null" json:"machine_id"`
	Hostname  string    `gorm:"index;size:255" json:"hostname"`
	Platform  string    `gorm:"size:50" json:"platform"`               // linux, windows
	OS        string    `gorm:"size:100" json:"os"`                    // Ubuntu 24.04, Windows 11, etc.
	Level     string    `gorm:"index;size:20;not null" json:"level"`   // TRACE, DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL, FATAL
	Source    string    `gorm:"index;size:100;not null" json:"source"` // syslog, auth, kernel, system, security, eventlog, docker, kubernetes, application
	Service   string    `gorm:"index;size:100" json:"service"`         // nginx, payment-api, sshd, IIS, etc.
	Message   string    `gorm:"type:text;not null" json:"message"`

	// Container & Orchestration Context
	ContainerID    string `gorm:"index;size:128" json:"container_id,omitempty"`
	ContainerName  string `gorm:"index;size:255" json:"container_name,omitempty"`
	DockerImage    string `gorm:"size:255" json:"docker_image,omitempty"`
	ClusterName    string `gorm:"index;size:100" json:"cluster_name,omitempty"`
	Namespace      string `gorm:"index;size:100" json:"namespace,omitempty"`
	PodName        string `gorm:"index;size:255" json:"pod_name,omitempty"`
	DeploymentName string `gorm:"index;size:255" json:"deployment_name,omitempty"`

	// Process & Distributed Tracing Context
	ProcessName string `gorm:"size:100" json:"process_name,omitempty"`
	PID         int    `json:"pid,omitempty"`
	IPAddress   string `gorm:"size:50" json:"ip_address,omitempty"`
	RequestID   string `gorm:"index;size:128" json:"request_id,omitempty"`
	TraceID     string `gorm:"index;size:128" json:"trace_id,omitempty"`
	EventID     string `gorm:"index;size:50" json:"event_id,omitempty"` // Windows Event ID or Systemd Event ID

	// Raw log string & metadata
	RawLog   string `gorm:"type:text" json:"raw_log,omitempty"`
	Metadata string `gorm:"type:text" json:"metadata,omitempty"` // JSON serialized additional metadata

	Timestamp time.Time `gorm:"index;not null" json:"timestamp"`
	CreatedAt time.Time `json:"created_at"`
}

func (LogEntry) TableName() string {
	return "logs"
}
