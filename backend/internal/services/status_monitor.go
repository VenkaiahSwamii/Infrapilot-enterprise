package services

import (
	"log"
	"time"

	"infrapilot/backend/internal/config"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/websocket"
)

func StartStatusMonitorWithHub(hub *websocket.Hub) {
	ticker := time.NewTicker(5 * time.Second) // Fast 5-second polling loop for instant offline detection

	go func() {
		for range ticker.C {
			if database.DB == nil {
				continue
			}

			var machines []models.Machine
			if err := database.DB.Find(&machines).Error; err != nil {
				continue
			}

			cfg := config.Get()
			offlineThreshold := 60 * time.Second
			if cfg != nil && cfg.OfflineThresholdSec > 0 {
				offlineThreshold = time.Duration(cfg.OfflineThresholdSec) * time.Second
			}

			for _, machine := range machines {
				if machine.Status == "OFFLINE" && !machine.Online {
					continue
				}

				if EvaluateMachineStatusWithThreshold(machine.LastSeen, time.Now().UTC(), offlineThreshold) == "OFFLINE" {
					log.Printf("[StatusMonitor] Machine %s (%s) heartbeat timed out (>%v). Marking OFFLINE.", machine.Hostname, machine.ID, offlineThreshold)
					machine.Status = "OFFLINE"
					machine.Online = false
					machine.RetryCount = 0
					if err := database.DB.Save(&machine).Error; err != nil {
						log.Printf("[StatusMonitor] Failed to save status: %v", err)
						continue
					}

					// Build payload
					payload := websocket.ServerStatusPayload{
						MachineID: machine.ID.String(),
						Hostname:  machine.Hostname,
						Status:    "OFFLINE",
						LastSeen:  machine.LastSeen,
					}

					// Publish structured event
					websocket.PublishServerOffline(machine.ID.String(), payload)

					// Broadcast instant status change over WebSocket
					legacyPayload := map[string]interface{}{
						"type":       "machine_status_changed",
						"machine_id": machine.ID.String(),
						"hostname":   machine.Hostname,
						"status":     "OFFLINE",
						"online":     false,
						"last_seen":  machine.LastSeen,
					}
					if websocket.WS != nil {
						websocket.WS.Broadcast(legacyPayload)
					}
				}
			}
		}
	}()
}

func StartStatusMonitor() {
	StartStatusMonitorWithHub(nil)
}

// EvaluateMachineStatus helper for calculation and testing
func EvaluateMachineStatus(lastSeen time.Time, now time.Time) string {
	return EvaluateMachineStatusWithThreshold(lastSeen, now, time.Minute)
}

func EvaluateMachineStatusWithThreshold(lastSeen, now time.Time, threshold time.Duration) string {
	if threshold <= 0 {
		threshold = time.Minute
	}
	if lastSeen.IsZero() || now.UTC().Sub(lastSeen.UTC()) > threshold {
		return "OFFLINE"
	}
	return "ONLINE"
}

func configuredOfflineThreshold(cfg *config.Config) time.Duration {
	if cfg == nil || cfg.OfflineThresholdSec <= 0 {
		return time.Minute
	}
	return time.Duration(cfg.OfflineThresholdSec) * time.Second
}

// ReconcileMachineStatus ensures the machine struct status and online fields match its last_seen timestamp
func ReconcileMachineStatus(machine *models.Machine, now time.Time, threshold time.Duration) string {
	if machine == nil {
		return "OFFLINE"
	}
	status := EvaluateMachineStatusWithThreshold(machine.LastSeen, now, threshold)
	machine.Status = status
	machine.Online = (status == "ONLINE")
	return status
}
