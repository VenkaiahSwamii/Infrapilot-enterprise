package network

import (
	"fmt"
	"log"
	"sync"
	"time"

	"infrapilot/backend/internal/alerts"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

type Service struct {
	repo Repository
	hub  *websocket.Hub

	mu           sync.Mutex
	activeAlerts map[string]uuid.UUID // checkID.String() -> alertID
}

func NewService(repo Repository, hub *websocket.Hub) *Service {
	return &Service{
		repo:         repo,
		hub:          hub,
		activeAlerts: make(map[string]uuid.UUID),
	}
}

func (s *Service) ExecuteAndRecordCheck(check *models.NetworkCheck) *models.NetworkMetric {
	metric := ExecuteNetworkProbe(check)

	if err := s.repo.SaveMetric(metric); err != nil {
		log.Printf("[Network Service] Failed to save metric for check %s: %v", check.Name, err)
	}

	// Alert Engine Integration & Single Active Alert Anti-Spam
	s.processAlertLifecycle(check, metric)

	// Broadcast WS network_update
	if s.hub != nil {
		s.hub.BroadcastJSON(map[string]interface{}{
			"type":      "network_update",
			"check_id":  check.ID,
			"name":      check.Name,
			"check_type": check.Type,
			"target":    check.Target,
			"status":    metric.Status,
			"latency_ms": metric.LatencyMs,
			"packet_loss_pct": metric.PacketLossPct,
			"created_at": metric.CreatedAt,
		})
	}

	return metric
}

func (s *Service) processAlertLifecycle(check *models.NetworkCheck, metric *models.NetworkMetric) {
	s.mu.Lock()
	defer s.mu.Unlock()

	checkKey := check.ID.String()
	alertID, hasAlert := s.activeAlerts[checkKey]

	if metric.Status == "CRITICAL" || metric.Status == "DEGRADED" {
		check.BreachCounter++
		_ = s.repo.UpdateCheck(check)

		severity := "Warning"
		if metric.Status == "CRITICAL" {
			severity = "Critical"
		}

		desc := fmt.Sprintf("Network check '%s' (%s target %s) reported status %s (Latency: %.1f ms, Packet Loss: %.1f%%): %s",
			check.Name, check.Type, check.Target, metric.Status, metric.LatencyMs, metric.PacketLossPct, metric.ErrorMessage)

		alert := &models.LinuxAlert{
			ID:          alertID,
			MachineID:   check.ID,
			Title:       fmt.Sprintf("Network Degradation: %s", check.Name),
			Description: desc,
			Category:    "Network",
			Component:   check.Name,
			Source:      "NetworkMonitor",
			Type:        "network_failure",
			Severity:    severity,
			Priority:    models.MapSeverityToPriority(severity),
			Message:     desc,
			Status:      "OPEN",
			CreatedAt:   time.Now(),
		}

		if err := alerts.ProcessGeneratedAlert(models.Machine{ID: check.ID, Hostname: check.Name}, alert); err == nil {
			s.activeAlerts[checkKey] = alert.ID
		}
	} else if metric.Status == "HEALTHY" {
		if hasAlert {
			delete(s.activeAlerts, checkKey)
			alerts.ResetBreachCounter(fmt.Sprintf("%s:Network:%s", check.ID.String(), check.Name))
			log.Printf("[Network Service] Network check '%s' recovered to HEALTHY. Auto-resolved open alert.", check.Name)
		}
		if check.BreachCounter > 0 {
			check.BreachCounter = 0
			_ = s.repo.UpdateCheck(check)
		}
	}
}

func (s *Service) GetOverviewStats() (*OverviewStats, error) {
	return s.repo.GetOverviewStats()
}

func (s *Service) GetAllChecks() ([]models.NetworkCheck, error) {
	return s.repo.GetAllChecks()
}

func (s *Service) CreateCheck(check *models.NetworkCheck) error {
	return s.repo.CreateCheck(check)
}

func (s *Service) GetCheckByID(id uuid.UUID) (*models.NetworkCheck, error) {
	return s.repo.GetCheckByID(id)
}

func (s *Service) UpdateCheck(check *models.NetworkCheck) error {
	return s.repo.UpdateCheck(check)
}

func (s *Service) DeleteCheck(id uuid.UUID) error {
	return s.repo.DeleteCheck(id)
}

func (s *Service) RunCheckNow(id uuid.UUID) (*models.NetworkMetric, error) {
	check, err := s.repo.GetCheckByID(id)
	if err != nil || check == nil {
		return nil, fmt.Errorf("network check not found")
	}
	return s.ExecuteAndRecordCheck(check), nil
}

func (s *Service) GetCheckMetrics(id uuid.UUID, timeRange string, limit int) ([]models.NetworkMetric, error) {
	return s.repo.GetCheckMetrics(id, timeRange, limit)
}

func (s *Service) GetHostNetworkViews() ([]HostNetworkView, error) {
	return s.repo.GetHostNetworkViews()
}
