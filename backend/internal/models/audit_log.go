package models

import (
	"time"

	"github.com/google/uuid"
)

type AuditLog struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Username  string    `json:"username"`
	IP        string    `json:"ip"`
	Resource  string    `json:"resource"`
	MachineID uuid.UUID `gorm:"type:uuid;not null" json:"machine_id"`
	Action    string    `json:"action"`
	Result    string    `gorm:"type:text" json:"result"`
	CreatedAt time.Time `json:"created_at"`
}
