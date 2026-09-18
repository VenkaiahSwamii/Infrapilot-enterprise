package logs

import (
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

type Service struct {
	repo Repository
	hub  *websocket.Hub
}

func NewService(repo Repository, hub *websocket.Hub) *Service {
	return &Service{
		repo: repo,
		hub:  hub,
	}
}

func (s *Service) Ingest(entry *models.Log) error {
	if err := s.repo.CreateLog(entry); err != nil {
		return err
	}

	if s.hub != nil {
		s.hub.BroadcastJSON(map[string]interface{}{
			"event": "log_entry",
			"log":   entry,
		})
	}
	return nil
}

func (s *Service) IngestBatch(entries []models.Log) error {
	if len(entries) == 0 {
		return nil
	}

	if err := s.repo.CreateBatch(entries); err != nil {
		return err
	}

	if s.hub != nil {
		for _, entry := range entries {
			s.hub.BroadcastJSON(map[string]interface{}{
				"event": "log_entry",
				"log":   entry,
			})
		}
	}
	return nil
}

func (s *Service) GetLogs(level, source, query string, limit, offset int) ([]models.Log, int64, error) {
	return s.repo.GetLogs(level, source, query, limit, offset)
}

func (s *Service) GetMachineLogs(machineID uuid.UUID, level, source, query string, limit, offset int) ([]models.Log, int64, error) {
	return s.repo.GetLogsByMachine(machineID, level, source, query, limit, offset)
}
