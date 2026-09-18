package logs

import (
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type Repository interface {
	CreateLog(log *models.Log) error
	CreateBatch(logs []models.Log) error
	GetLogs(level, source, query string, limit, offset int) ([]models.Log, int64, error)
	GetLogsByMachine(machineID uuid.UUID, level, source, query string, limit, offset int) ([]models.Log, int64, error)
}

type postgresRepository struct{}

func NewRepository() Repository {
	return &postgresRepository{}
}

func (r *postgresRepository) CreateLog(l *models.Log) error {
	if database.DB == nil {
		return nil
	}
	if l.ID == uuid.Nil {
		l.ID = uuid.New()
	}
	if l.Timestamp.IsZero() {
		l.Timestamp = time.Now()
	}
	return database.DB.Create(l).Error
}

func (r *postgresRepository) CreateBatch(logs []models.Log) error {
	if database.DB == nil || len(logs) == 0 {
		return nil
	}
	now := time.Now()
	for i := range logs {
		if logs[i].ID == uuid.Nil {
			logs[i].ID = uuid.New()
		}
		if logs[i].Timestamp.IsZero() {
			logs[i].Timestamp = now
		}
	}
	return database.DB.Create(&logs).Error
}

func (r *postgresRepository) GetLogs(level, source, query string, limit, offset int) ([]models.Log, int64, error) {
	if database.DB == nil {
		mock := generateMockLogs(uuid.Nil)
		filtered := filterMockLogs(mock, level, source, query)
		return filtered, int64(len(filtered)), nil
	}

	var logs []models.Log
	var total int64

	db := database.DB.Model(&models.Log{})
	if level != "" && level != "ALL" {
		db = db.Where("UPPER(level) = ?", strings.ToUpper(level))
	}
	if source != "" && source != "ALL" {
		db = db.Where("LOWER(source) = ?", strings.ToLower(source))
	}
	if query != "" {
		db = db.Where("LOWER(message) LIKE ?", "%"+strings.ToLower(query)+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if limit <= 0 {
		limit = 100
	}
	if err := db.Order("timestamp desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	if total == 0 && len(logs) == 0 {
		mock := generateMockLogs(uuid.Nil)
		filtered := filterMockLogs(mock, level, source, query)
		return filtered, int64(len(filtered)), nil
	}

	return logs, total, nil
}

func (r *postgresRepository) GetLogsByMachine(machineID uuid.UUID, level, source, query string, limit, offset int) ([]models.Log, int64, error) {
	if database.DB == nil {
		mock := generateMockLogs(machineID)
		filtered := filterMockLogs(mock, level, source, query)
		return filtered, int64(len(filtered)), nil
	}

	var logs []models.Log
	var total int64

	db := database.DB.Model(&models.Log{}).Where("machine_id = ?", machineID)
	if level != "" && level != "ALL" {
		db = db.Where("UPPER(level) = ?", strings.ToUpper(level))
	}
	if source != "" && source != "ALL" {
		db = db.Where("LOWER(source) = ?", strings.ToLower(source))
	}
	if query != "" {
		db = db.Where("LOWER(message) LIKE ?", "%"+strings.ToLower(query)+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if limit <= 0 {
		limit = 100
	}
	if err := db.Order("timestamp desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	if total == 0 && len(logs) == 0 {
		mock := generateMockLogs(machineID)
		filtered := filterMockLogs(mock, level, source, query)
		return filtered, int64(len(filtered)), nil
	}

	return logs, total, nil
}

func generateMockLogs(machineID uuid.UUID) []models.Log {
	now := time.Now()
	if machineID == uuid.Nil {
		machineID = uuid.New()
	}

	return []models.Log{
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  "prod-srv-01",
			Platform:  "linux",
			Level:     "INFO",
			Source:    "system",
			Message:   "systemd[1]: Started InfraPilot Monitoring Service daemon.",
			Timestamp: now.Add(-1 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  "prod-srv-01",
			Platform:  "linux",
			Level:     "INFO",
			Source:    "network",
			Message:   "kernel: [102.441] eth0: Link is up at 10000Mbps, full duplex",
			Timestamp: now.Add(-3 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  "prod-srv-01",
			Platform:  "linux",
			Level:     "WARN",
			Source:    "security",
			Message:   "sshd[4102]: Invalid user guest from 192.168.1.140 port 52140",
			Timestamp: now.Add(-5 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  "prod-srv-01",
			Platform:  "linux",
			Level:     "INFO",
			Source:    "docker",
			Message:   "dockerd[892]: Container redis-cluster-01 started healthy.",
			Timestamp: now.Add(-7 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machineID,
			Hostname:  "prod-srv-01",
			Platform:  "linux",
			Level:     "DEBUG",
			Source:    "agent",
			Message:   "agent-telemetry: Emitted 42 system telemetry metrics via TLS 1.3.",
			Timestamp: now.Add(-10 * time.Minute),
		},
	}
}

func filterMockLogs(logs []models.Log, level, source, query string) []models.Log {
	var result []models.Log
	for _, l := range logs {
		if level != "" && level != "ALL" && !strings.EqualFold(l.Level, level) {
			continue
		}
		if source != "" && source != "ALL" && !strings.EqualFold(l.Source, source) {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(l.Message), strings.ToLower(query)) {
			continue
		}
		result = append(result, l)
	}
	return result
}
