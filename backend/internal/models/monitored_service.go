package models

import (
	"time"

	"github.com/google/uuid"
)

type MonitoredService struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ServerID    uuid.UUID `gorm:"type:uuid;index;not null;uniqueIndex:idx_server_service" json:"server_id"`
	ServiceName string    `gorm:"size:100;not null;uniqueIndex:idx_server_service" json:"service_name"`
	DisplayName string    `gorm:"size:150" json:"display_name"`
	AlertLevel  string    `gorm:"size:20;default:'CRITICAL'" json:"alert_level"` // CRITICAL, WARNING
	Enabled     bool      `gorm:"default:true" json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
