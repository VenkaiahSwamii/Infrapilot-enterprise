package services

import (
	"fmt"
	"log"
	"strings"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

type CorrelationEngine struct {
	incidentService *IncidentService
}

func NewCorrelationEngine() *CorrelationEngine {
	return &CorrelationEngine{
		incidentService: NewIncidentService(),
	}
}

func (c *CorrelationEngine) Correlate(alert models.LinuxAlert) (*models.Incident, error) {
	// 1. Check if an active open incident already exists for this machine within correlation window
	existingIncident, err := c.incidentService.FindOpenIncident(alert.MachineID)
	if err == nil && existingIncident != nil {
		log.Printf("[CorrelationEngine] Correlating alert '%s' into existing Incident #%s", alert.Title, existingIncident.ID)

		// Cross-Component correlation check: e.g. Disk Exhaustion causing Service Crash
		alertCat := strings.ToLower(alert.Category)
		incTitle := strings.ToLower(existingIncident.Title)

		if (strings.Contains(alertCat, "service") || strings.Contains(alertCat, "process")) && strings.Contains(incTitle, "disk") {
			existingIncident.Description = fmt.Sprintf("CROSS-COMPONENT INCIDENT: Disk Exhaustion likely caused service crash (%s). Primary root cause: Disk Storage Space.", alert.Title)
			existingIncident.RootCause = "Disk Exhaustion"
			if database.DB != nil {
				database.DB.Model(existingIncident).Updates(map[string]interface{}{
					"description": existingIncident.Description,
					"root_cause":  existingIncident.RootCause,
				})
			}
		} else if strings.Contains(alertCat, "disk") && (strings.Contains(incTitle, "service") || strings.Contains(incTitle, "process")) {
			existingIncident.Description = fmt.Sprintf("CROSS-COMPONENT INCIDENT: High disk usage detected during service outage (%s). Primary root cause: Disk Exhaustion.", existingIncident.Title)
			existingIncident.RootCause = "Disk Exhaustion"
			if database.DB != nil {
				database.DB.Model(existingIncident).Updates(map[string]interface{}{
					"description": existingIncident.Description,
					"root_cause":  existingIncident.RootCause,
				})
			}
		}


		err = c.incidentService.AddAlertToIncident(existingIncident, alert)
		return existingIncident, err
	}

	// 2. Otherwise create a new Incident
	log.Printf("[CorrelationEngine] Creating new Incident for alert '%s' on machine %s", alert.Title, alert.MachineID)
	newIncident, err := c.incidentService.CreateIncident(alert)
	return newIncident, err
}

