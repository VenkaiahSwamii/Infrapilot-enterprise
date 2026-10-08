package models

import (
	"time"

	"github.com/google/uuid"
)

type AlertRule struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index;not null" json:"organization_id"`
	Name           string    `gorm:"not null" json:"name"`
	Metric         string    `gorm:"not null" json:"metric"`   // cpu, memory, disk
	Operator       string    `gorm:"not null" json:"operator"` // >, <, ==
	Value          float64   `gorm:"not null" json:"value"`
	Threshold      float64   `json:"threshold"`
	Severity            string     `gorm:"default:critical;not null" json:"severity"` // critical, warning, info
	IsEnabled           bool       `gorm:"default:true;not null" json:"is_enabled"`
	TargetScope         string     `gorm:"default:all" json:"target_scope"` // all, machine, os
	TargetMachineID     *uuid.UUID `gorm:"type:uuid;index" json:"target_machine_id,omitempty"`
	TargetOS            string     `json:"target_os,omitempty"` // linux, windows
	ConsecutiveBreaches int        `gorm:"default:2" json:"consecutive_breaches"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}
