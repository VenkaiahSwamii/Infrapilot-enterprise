package subscribers

import (
	"log"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

// SaveMetric saves metrics to the database when a metric.received event is published
func SaveMetric(e events.Event) {
	metricEvent, ok := e.(events.MetricReceivedEvent)
	if !ok {
		log.Printf("Invalid event type for SaveMetric: %T", e)
		return
	}

	log.Printf("Saving metric to database for machine %s", metricEvent.MachineID)

	// Find the machine
	var machine models.Machine
	if err := database.DB.Where("id = ?", metricEvent.MachineID).First(&machine).Error; err != nil {
		log.Printf("Failed to find machine %s: %v", metricEvent.MachineID, err)
		return
	}

	metric := models.Metric{
		ID:          uuid.New(),
		MachineID:   machine.ID,
		CPUUsage:    metricEvent.CPU,
		MemoryUsage: metricEvent.Memory,
		DiskUsage:   metricEvent.Disk,
		Hostname:    machine.Hostname,
		IPAddress:   machine.IPAddress,
		OS:          machine.OS,
	}

	if err := database.DB.Create(&metric).Error; err != nil {
		log.Printf("Failed to save metric: %v", err)
		return
	}

	log.Printf("Metric saved successfully for machine %s", metricEvent.MachineID)
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
