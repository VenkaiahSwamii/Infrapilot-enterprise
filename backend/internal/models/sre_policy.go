package models

import (
	"time"

	"github.com/google/uuid"
)

// SREActionPolicy defines Admin-level behavior per SRE domain / component
type SREActionPolicy struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Category       string    `gorm:"index" json:"category"`        // Service, Storage, Network
	Component      string    `gorm:"index" json:"component"`       // ssh, cron, root_disk, gateway
	Mode           string    `json:"mode"`                        // AUTO_REMEDIATE vs NOTIFY_EMAIL
	RecipientEmail string    `json:"recipient_email"`             // Assigned owner email address
	Enabled        bool      `json:"enabled"`                     // Active status flag
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
