package repository

import (
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm/clause"
)

type MetricRepository struct{}

func NewMetricRepository() *MetricRepository {
	return &MetricRepository{}
}

func (r *MetricRepository) Create(metric *models.Metric) error {
	return database.DB.Create(metric).Error
}

func (r *MetricRepository) FindByMachineID(machineID uuid.UUID, limit int) ([]models.Metric, error) {
	var metrics []models.Metric
	err := database.DB.Where("machine_id = ?", machineID).Order("created_at desc").Limit(limit).Find(&metrics).Error
	return metrics, err
}

func (r *MetricRepository) FindRecentByMachineID(machineID uuid.UUID, since time.Time) ([]models.Metric, error) {
	var metrics []models.Metric
	err := database.DB.Where("machine_id = ? AND created_at >= ?", machineID, since).Order("created_at asc").Find(&metrics).Error
	return metrics, err
}

// FindLatestByMachineIDs fetches one newest sample per machine in a single
// PostgreSQL query. DISTINCT ON avoids an N+1 query for machine lists.
func (r *MetricRepository) FindLatestByMachineIDs(machineIDs []uuid.UUID) (map[uuid.UUID]models.Metric, error) {
	result := make(map[uuid.UUID]models.Metric, len(machineIDs))
	if len(machineIDs) == 0 {
		return result, nil
	}

	var metrics []models.Metric
	var err error
	if database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) *
			FROM metrics
			WHERE machine_id IN ?
			ORDER BY machine_id, created_at DESC, id DESC
		`, machineIDs).Scan(&metrics).Error
	} else {
		err = database.DB.Where("machine_id IN ?", machineIDs).Order("created_at DESC, id DESC").Find(&metrics).Error
	}
	if err != nil {
		return nil, err
	}
	for _, metric := range metrics {
		if _, exists := result[metric.MachineID]; !exists {
			result[metric.MachineID] = metric
		}
	}
	return result, nil
}

func (r *MetricRepository) FindLatestRichByMachineIDs(machineIDs []uuid.UUID) (map[uuid.UUID]models.LinuxMetric, error) {
	result := make(map[uuid.UUID]models.LinuxMetric, len(machineIDs))
	if len(machineIDs) == 0 {
		return result, nil
	}
	var metrics []models.LinuxMetric
	var err error
	if database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) *
			FROM linux_metrics
			WHERE machine_id IN ?
			ORDER BY machine_id, sampled_at DESC, id DESC
		`, machineIDs).Scan(&metrics).Error
	} else {
		err = database.DB.Where("machine_id IN ?", machineIDs).Order("sampled_at DESC, id DESC").Find(&metrics).Error
	}
	if err != nil {
		return nil, err
	}
	for _, metric := range metrics {
		if _, exists := result[metric.MachineID]; !exists {
			result[metric.MachineID] = metric
		}
	}
	return result, nil
}

func (r *MetricRepository) UpsertLinuxServer(server models.LinuxServer) error {
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "machine_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"hostname", "os", "kernel", "architecture", "agent_version", "ip_address", "mac_address", "timezone", "boot_time", "last_seen_at", "updated_at"}),
	}).Create(&server).Error
}

func (r *MetricRepository) CreateLinuxMetric(metric models.LinuxMetric) error {
	return database.DB.Create(&metric).Error
}

func (r *MetricRepository) CreateLinuxProcess(process models.LinuxProcess) error {
	return database.DB.Create(&process).Error
}

func (r *MetricRepository) UpsertLinuxService(service models.LinuxService) error {
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "machine_id"}, {Name: "name"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "restart_count", "last_seen_at"}),
	}).Create(&service).Error
}

func (r *MetricRepository) CreateLinuxNetwork(network models.LinuxNetwork) error {
	return database.DB.Create(&network).Error
}

func (r *MetricRepository) CreateLinuxStorage(storage models.LinuxStorage) error {
	return database.DB.Create(&storage).Error
}

func (r *MetricRepository) CreateHistoricalMetric(metric models.HistoricalMetric) error {
	return database.DB.Create(&metric).Error
}
