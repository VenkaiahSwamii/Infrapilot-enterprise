package alerts

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

var (
	alertEmailCooldown = make(map[string]time.Time)
	alertEmailMu       sync.Mutex
)

// shouldSendAlertEmail returns true if an email has not been sent for this alert key in the specified interval
func shouldSendAlertEmail(key string, interval time.Duration) bool {
	alertEmailMu.Lock()
	defer alertEmailMu.Unlock()
	last, exists := alertEmailCooldown[key]
	if !exists || time.Since(last) >= interval {
		alertEmailCooldown[key] = time.Now()
		return true
	}
	return false
}

// Global hub instance holder if set by application startup
var hubInstance *websocket.Hub

// SetHub registers the active websocket.Hub for alert broadcasting.
func SetHub(h *websocket.Hub) {
	hubInstance = h
}

// FindOpenAlert queries PostgreSQL for an existing ACTIVE/OPEN alert matching machine_id, rule_id.
func FindOpenAlert(machineID uuid.UUID, ruleID uuid.UUID) (*models.LinuxAlert, error) {
	if database.DB == nil {
		return nil, fmt.Errorf("database connection unavailable")
	}
	var alert models.LinuxAlert
	err := database.DB.Where("machine_id = ? AND rule_id = ? AND LOWER(status) IN ('open', 'active')", machineID, ruleID).First(&alert).Error
	if err != nil {
		return nil, err
	}
	return &alert, nil
}

// ProcessAlertCondition handles creation of a new alert if condition is met and no duplicate open alert exists,
// updates in-place if an active alert exists, or auto-resolves an existing open alert if condition is cleared.
func ProcessAlertCondition(machine models.Machine, rule models.AlertRule, value float64, isAlerting bool) error {
	existingAlert, err := FindOpenAlert(machine.ID, rule.ID)
	hasOpenAlert := (err == nil && existingAlert != nil)

	hostname := machine.Hostname
	if hostname == "" {
		hostname = machine.ID.String()
	}

	if isAlerting {
		if hasOpenAlert {
			// Update the existing active alert in-place with latest telemetry without duplicating
			now := time.Now()
			msg := fmt.Sprintf("%s exceeded threshold: %.1f %s %.1f", rule.Name, value, rule.Operator, rule.Value)
			if database.DB != nil {
				database.DB.Model(&models.LinuxAlert{}).Where("id = ?", existingAlert.ID).Updates(map[string]interface{}{
					"metric_value": value,
					"message":      msg,
					"updated_at":   now,
				})
			}
			existingAlert.MetricValue = value
			existingAlert.Message = msg
			existingAlert.UpdatedAt = now

			key := fmt.Sprintf("%s:%s", machine.ID.String(), rule.Name)
			if shouldSendAlertEmail(key, 3*time.Minute) {
				go services.SendAlert(*existingAlert)
			}

			return nil
		}

		// Create New Alert
		now := time.Now()
		newAlert := models.LinuxAlert{
			ID:          uuid.New(),
			MachineID:   machine.ID,
			RuleID:      rule.ID,
			Title:       rule.Name,
			Description: fmt.Sprintf("%s: metric value %.1f violated rule threshold %.1f (%s)", rule.Name, value, rule.Value, rule.Operator),
			Type:        rule.Metric,
			Category:    rule.Metric,
			Severity:    rule.Severity,
			Priority:    models.MapSeverityToPriority(rule.Severity),
			Message:     fmt.Sprintf("%s exceeded threshold: %.1f %s %.1f", rule.Name, value, rule.Operator, rule.Value),
			MetricValue: value,
			Threshold:   rule.Value,
			Status:      "ACTIVE",
			Source:      "RuleEngine",
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		if database.DB != nil {
			if err := database.DB.Create(&newAlert).Error; err != nil {
				log.Printf("[Alert Engine] Failed to save alert for machine %s: %v", hostname, err)
				return err
			}
		}

		log.Printf("[Alert Engine] Machine %s Rule %s Current %.1f Threshold %.1f Result ALERT CREATED",
			hostname, rule.Name, value, rule.Value)

		key := fmt.Sprintf("%s:%s", machine.ID.String(), rule.Name)
		if shouldSendAlertEmail(key, 3*time.Minute) {
			go services.SendAlert(newAlert)
		}

		BroadcastAlertPayload(newAlert, hostname)
		return nil
	}

	// Not alerting: check if open alert needs auto-resolution
	if hasOpenAlert {
		now := time.Now()
		resolutionNote := "Auto resolved: Metric returned to normal levels"
		existingAlert.Status = "RESOLVED"
		existingAlert.ResolutionNote = resolutionNote
		existingAlert.ResolvedBy = "System (Auto-Resolved)"
		existingAlert.ResolvedAt = &now
		existingAlert.UpdatedAt = now

		if database.DB != nil {
			if err := database.DB.Model(&models.LinuxAlert{}).Where("id = ?", existingAlert.ID).Updates(map[string]interface{}{
				"status":          "RESOLVED",
				"resolution_note": resolutionNote,
				"resolved_by":     "System (Auto-Resolved)",
				"resolved_at":     &now,
				"updated_at":      now,
			}).Error; err != nil {
				log.Printf("[Alert Engine] Failed to auto-resolve alert %s: %v", existingAlert.ID, err)
				return err
			}
		}

		log.Printf("[Alert Engine] Machine %s Rule %s Current %.1f Threshold %.1f Result AUTO RESOLVED",
			hostname, rule.Name, value, rule.Value)

		BroadcastAlertPayload(*existingAlert, hostname)
		return nil
	}

	return nil
}

// ProcessGeneratedAlert handles persistence, strict duplicate prevention, and broadcasting for domain health checkers.
func ProcessGeneratedAlert(machine models.Machine, alert *models.LinuxAlert) error {
	if alert.ID == uuid.Nil {
		alert.ID = uuid.New()
	}
	if alert.MachineID == uuid.Nil {
		alert.MachineID = machine.ID
	}
	if alert.Priority == "" {
		alert.Priority = models.MapSeverityToPriority(alert.Severity)
	}
	if alert.Status == "" {
		alert.Status = "ACTIVE"
	}
	now := time.Now()
	if alert.CreatedAt.IsZero() {
		alert.CreatedAt = now
	}
	alert.UpdatedAt = now

	hostname := machine.Hostname
	if hostname == "" {
		hostname = machine.ID.String()
	}

	// Phase 6: Robust Duplicate Prevention & In-Place Value Updates
	if database.DB != nil {
		var existing models.LinuxAlert
		var err error
		if alert.RuleID != uuid.Nil {
			err = database.DB.Where("machine_id = ? AND rule_id = ? AND LOWER(status) IN ('open', 'active')", machine.ID, alert.RuleID).First(&existing).Error
		} else {
			err = database.DB.Where("machine_id = ? AND (category = ? OR type = ?) AND component = ? AND LOWER(status) IN ('open', 'active')",
				machine.ID, alert.Category, alert.Type, alert.Component).First(&existing).Error
		}

		if err == nil {
			// Alert already exists and is active -> update latest metric value and message in-place!
			database.DB.Model(&models.LinuxAlert{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
				"metric_value": alert.MetricValue,
				"message":      alert.Message,
				"severity":     alert.Severity,
				"priority":     alert.Priority,
				"updated_at":   now,
			})
			existing.MetricValue = alert.MetricValue
			existing.Message = alert.Message
			existing.Severity = alert.Severity
			existing.Priority = alert.Priority
			existing.UpdatedAt = now

			key := fmt.Sprintf("%s:%s", machine.ID.String(), existing.Title)
			if shouldSendAlertEmail(key, 3*time.Minute) {
				go services.SendAlert(existing)
			}

			BroadcastAlertPayload(existing, hostname)
			return nil
		}
	}

	if database.DB != nil {
		if err := database.DB.Create(alert).Error; err != nil {
			log.Printf("[Alert Engine] Failed to create alert '%s': %v", alert.Title, err)
			return err
		}
	}

	log.Printf("[Alert Engine] Machine %s Category %s Priority %s Result ALERT CREATED (%s)",
		hostname, alert.Category, alert.Priority, alert.Title)

	// Dispatch real-time SMTP Email & Multi-Channel Notifications
	key := fmt.Sprintf("%s:%s", machine.ID.String(), alert.Title)
	if shouldSendAlertEmail(key, 3*time.Minute) {
		go services.SendAlert(*alert)
	}

	BroadcastAlertPayload(*alert, hostname)
	return nil
}

// BroadcastAlertPayload sends real-time alert data to WebSocket subscribers.
func BroadcastAlertPayload(alert models.LinuxAlert, hostname string) {
	payload := map[string]interface{}{
		"type":                 "alert",
		"id":                   alert.ID.String(),
		"machine_id":           alert.MachineID.String(),
		"rule_id":              alert.RuleID.String(),
		"title":                alert.Title,
		"description":          alert.Description,
		"category":             alert.Category,
		"component":            alert.Component,
		"source":               alert.Source,
		"severity":             alert.Severity,
		"priority":             alert.Priority,
		"status":               alert.Status,
		"hostname":             hostname,
		"value":                alert.MetricValue,
		"threshold":            alert.Threshold,
		"message":              alert.Message,
		"recovery_suggestion":  alert.RecoverySuggestion,
		"is_correlated":        alert.IsCorrelated,
		"correlated_alert_ids": alert.CorrelatedAlertIDs,
		"resolution_note":      alert.ResolutionNote,
		"resolved_by":          alert.ResolvedBy,
		"resolved_at":          alert.ResolvedAt,
		"created_at":           alert.CreatedAt,
		"updated_at":           alert.UpdatedAt,
	}

	// 1. Broadcast via global WebSocket hub
	if websocket.WS != nil {
		websocket.WS.Broadcast(payload)

		// Publish structured event to global room (serverID: "")
		if alert.Status == "RESOLVED" {
			websocket.PublishEvent("alert.resolved", "", payload)
		} else {
			websocket.PublishEvent("alert.created", "", payload)
		}
	}

	// 2. Broadcast via injected Hub if available
	if hubInstance != nil {
		eventObj := map[string]interface{}{
			"event":   "alert.created",
			"payload": payload,
		}
		if alert.Status == "RESOLVED" {
			eventObj["event"] = "alert.resolved"
		}
		jsonData, err := json.Marshal(eventObj)
		if err == nil {
			hubInstance.Broadcast(jsonData)
		}
	}
}
