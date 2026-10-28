package subscribers

import (
	"log"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

// SaveMetric is a no-op as telemetry is already comprehensively persisted
// with full memory, disk, process, and interface fields synchronously by metricService.SaveMetric.
// Creating a second record here previously generated duplicate rows with 0% memory/disk metrics.
func SaveMetric(e events.Event) {
	return
}

// SaveAuditLog saves audit events to the database
func SaveAuditLog(e events.Event) {
	log.Printf("Saving audit log for event: %s", e.Name())

	eventName := e.Name()
	timestamp := e.Timestamp()

	// Create audit log entry with basic information
	auditLog := models.AuditLog{
		ID:        uuid.New(),
		Username:  "system",
		Action:    eventName,
		Result:    "success",
		CreatedAt: timestamp,
	}

	// Try to extract machine ID if available
	switch ev := e.(type) {
	case events.MetricReceivedEvent:
		auditLog.Username = "agent"
		if id, err := uuid.Parse(ev.MachineID); err == nil {
			auditLog.MachineID = id
		}
	case events.MachineRegisteredEvent:
		auditLog.Username = "system"
		if id, err := uuid.Parse(ev.MachineID); err == nil {
			auditLog.MachineID = id
		}
	case events.MachineOfflineEvent:
		auditLog.Username = "system"
		if id, err := uuid.Parse(ev.MachineID); err == nil {
			auditLog.MachineID = id
		}
	case events.CommandExecutedEvent:
		auditLog.Username = ev.ExecutedBy
		if id, err := uuid.Parse(ev.MachineID); err == nil {
			auditLog.MachineID = id
		}
	case events.UserLoginEvent:
		auditLog.Username = ev.Username
	case events.UserLogoutEvent:
		auditLog.Username = ev.Username
	}

	if err := database.DB.Create(&auditLog).Error; err != nil {
		log.Printf("Failed to save audit log: %v", err)
		return
	}

	log.Printf("Audit log saved for event: %s", eventName)
}
