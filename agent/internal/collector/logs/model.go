package logs

import (
	"time"

	"github.com/google/uuid"
)

type LogEntry struct {
	ID        uuid.UUID `json:"id,omitempty"`
	MachineID uuid.UUID `json:"machine_id"`
	Hostname  string    `json:"hostname"`
	Platform  string    `json:"platform"`
	Level     string    `json:"level"`
	Source    string    `json:"source"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}
