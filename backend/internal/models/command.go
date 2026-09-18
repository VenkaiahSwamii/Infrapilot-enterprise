package models

import (
	"time"

	"github.com/google/uuid"
)

type Command struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	MachineID uuid.UUID `gorm:"type:uuid;not null" json:"machine_id"`
	Command   string    `json:"command"`
	Status    string    `json:"status"` // Pending, Running, Completed, Failed
	Output    string    `json:"output"`
	CreatedAt time.Time `json:"created_at"`
}
