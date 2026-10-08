package models

import (
	"time"

	"github.com/google/uuid"
)

type LinuxAlert struct {
	ID                 uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	MachineID          uuid.UUID  `gorm:"type:uuid;index;not null" json:"machine_id"`
	RuleID             uuid.UUID  `gorm:"type:uuid;index" json:"rule_id"`
	Title              string     `json:"title"`
	Description        string     `json:"description"`
	Type               string     `json:"type"`
	Category           string     `gorm:"index" json:"category"` // CPU, Memory, Storage, Network, Process, Service, Docker, Kubernetes, Filesystem, Security
	Component          string     `json:"component"`             // processor, ram, disk_sda, docker_mysql, kubelet, etc.
	Source             string     `json:"source"`                // Agent, AlertEngine, CPUChecker, DockerChecker, etc.
	Severity           string     `json:"severity"`              // Critical, Major, Warning, Info
	Priority           string     `json:"priority"`              // P1, P2, P3, P4
	Message            string     `json:"message"`
	Status             string     `gorm:"index;default:'OPEN'" json:"status"` // OPEN, RESOLVED, ACKNOWLEDGED
	MetricValue        float64    `json:"metric_value"`
	Threshold          float64    `json:"threshold"`
	RecoverySuggestion string     `json:"recovery_suggestion"`
	IsCorrelated       bool       `json:"is_correlated"`
	CorrelatedAlertIDs string     `gorm:"type:text" json:"correlated_alert_ids"`
	AcknowledgedBy     string     `json:"acknowledged_by"`
	ResolvedBy         string     `json:"resolved_by"`
	ResolutionNote     string     `json:"resolution_note"`
	ResolvedAt         *time.Time `json:"resolved_at,omitempty"`
	EmailSent          bool       `gorm:"default:false" json:"email_sent"`
	MessageID          string     `gorm:"type:text" json:"message_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// MapSeverityToPriority maps Severity to Priority Matrix (Phase 12).
// Critical -> P1, Major -> P2, Warning -> P3, Info -> P4
func MapSeverityToPriority(severity string) string {
	switch severity {
	case "Critical", "CRITICAL", "critical":
		return "P1"
	case "Major", "MAJOR", "major":
		return "P2"
	case "Warning", "WARNING", "warning":
		return "P3"
	case "Info", "INFO", "info":
		return "P4"
	default:
		return "P3"
	}
}
