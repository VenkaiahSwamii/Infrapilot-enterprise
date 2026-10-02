package synthetic

import (
	"fmt"
	"log"
	"strings"
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
	activeAlerts map[string]uuid.UUID // testID.String() -> alertID
}

func NewService(repo Repository, hub *websocket.Hub) *Service {
	return &Service{
		repo:         repo,
		hub:          hub,
		activeAlerts: make(map[string]uuid.UUID),
	}
}

func (s *Service) ExecuteAndRecordTest(test *models.SyntheticTest) *models.SyntheticTestResult {
	result := ExecuteProbe(test)
	if err := s.repo.SaveResult(result); err != nil {
		log.Printf("[Synthetic Service] Failed to save result for test %s: %v", test.Name, err)
	}

	// Process Alert Engine Integration (Single Active Alert Anti-Spam)
	s.processAlertLifecycle(test, result)

	// Broadcast Real-Time WebSocket Update
	if s.hub != nil {
		s.hub.BroadcastJSON(map[string]interface{}{
			"type":             "synthetic_update",
			"event":            "synthetic.updated",
			"test_id":          test.ID.String(),
			"name":             test.Name,
			"status":           result.Status,
			"http_status":      result.HTTPStatus,
			"response_time_ms": result.ResponseTimeMs,
			"target_url":       test.URL,
			"timestamp":        result.Timestamp,
		})
	}

	return result
}

func (s *Service) processAlertLifecycle(test *models.SyntheticTest, result *models.SyntheticTestResult) {
	testKey := test.ID.String()

	s.mu.Lock()
	existingAlertID, hasAlert := s.activeAlerts[testKey]
	s.mu.Unlock()

	status := strings.ToUpper(result.Status)

	if status == "FAIL" || status == "ERROR" || status == "TIMEOUT" {
		severity := "Critical"
		if status == "TIMEOUT" {
			severity = "Warning"
		}

		desc := fmt.Sprintf("Synthetic test '%s' failed target %s (HTTP %d, Latency %.1f ms): %s",
			test.Name, test.URL, result.HTTPStatus, result.ResponseTimeMs, result.ErrorMessage)

		alert := &models.LinuxAlert{
			ID:          existingAlertID,
			MachineID:   test.ID, // Map synthetic test ID as host target entity
			Title:       fmt.Sprintf("Synthetic Test Failed: %s", test.Name),
			Description: desc,
			Category:    "Synthetic",
			Component:   test.Name,
			Source:      "SyntheticMonitor",
			Type:        "synthetic_failure",
			Severity:    severity,
			Priority:    models.MapSeverityToPriority(severity),
			Message:     desc,
			Status:      "OPEN",
			CreatedAt:   time.Now(),
		}

		if err := alerts.ProcessGeneratedAlert(models.Machine{ID: test.ID, Hostname: test.Name}, alert); err == nil {
			s.mu.Lock()
			s.activeAlerts[testKey] = alert.ID
			s.mu.Unlock()
		}
	} else if status == "PASS" {
		if hasAlert {
			// Auto-resolve synthetic alert on PASS
			s.mu.Lock()
			delete(s.activeAlerts, testKey)
			s.mu.Unlock()

			alerts.ResetBreachCounter(fmt.Sprintf("%s:Synthetic:%s", test.ID.String(), test.Name))
			log.Printf("[Synthetic Service] Test '%s' recovered to PASS -> Synthetic alert resolved.", test.Name)
		}
	}
}

func (s *Service) RunTestNow(id uuid.UUID) (*models.SyntheticTestResult, error) {
	test, err := s.repo.GetTestByID(id)
	if err != nil || test == nil {
		return nil, fmt.Errorf("synthetic test not found")
	}
	res := s.ExecuteAndRecordTest(test)
	return res, nil
}

func (s *Service) CreateTest(test *models.SyntheticTest) error {
	return s.repo.CreateTest(test)
}

func (s *Service) UpdateTest(test *models.SyntheticTest) error {
	return s.repo.UpdateTest(test)
}

func (s *Service) DeleteTest(id uuid.UUID) error {
	return s.repo.DeleteTest(id)
}

func (s *Service) GetTestByID(id uuid.UUID) (*models.SyntheticTest, error) {
	return s.repo.GetTestByID(id)
}

func (s *Service) GetAllTests() ([]models.SyntheticTest, error) {
	return s.repo.GetAllTests()
}

func (s *Service) GetTestResults(testID uuid.UUID, timeRange string, limit int) ([]models.SyntheticTestResult, error) {
	return s.repo.GetTestResults(testID, timeRange, limit)
}

func (s *Service) GetOverviewStats() (*OverviewStats, error) {
	return s.repo.GetOverviewStats()
}
