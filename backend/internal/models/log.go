package models

import (
	"time"

	"github.com/google/uuid"
)

// Log defines the database model for logs table
type Log struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	MachineID uuid.UUID `gorm:"type:uuid;index;not null" json:"machine_id"`
	Hostname  string    `gorm:"index;size:255" json:"hostname"`
	Platform  string    `gorm:"size:50" json:"platform"`               // linux, windows
	Level     string    `gorm:"index;size:20;not null" json:"level"`   // INFO, WARN, ERROR, CRITICAL, DEBUG
	Source    string    `gorm:"index;size:100;not null" json:"source"` // syslog, auth, kernel, system, security, application
	Message   string    `gorm:"type:text;not null" json:"message"`
	Timestamp time.Time `gorm:"index;not null" json:"timestamp"`
	CreatedAt time.Time `json:"created_at"`
}

func (Log) TableName() string {
	return "logs"
}
