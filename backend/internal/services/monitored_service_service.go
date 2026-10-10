package services

import (
	"errors"
	"strings"
	"time"

	"infrapilot/backend/internal/config"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MonitoredServiceService struct {
	db *gorm.DB
}

func NewMonitoredServiceService(db *gorm.DB) *MonitoredServiceService {
	return &MonitoredServiceService{db: db}
}

// NormalizeServiceName trims whitespace and cleans service name strings
func NormalizeServiceName(name string) string {
	name = strings.TrimSpace(name)
	return name
}

// GetMonitoredServices returns all monitored services configured for a server
func (s *MonitoredServiceService) GetMonitoredServices(serverID uuid.UUID) ([]models.MonitoredService, error) {
	var list []models.MonitoredService
	if s.db == nil {
		return list, nil
	}

	err := s.db.Where("server_id = ?", serverID).Order("created_at asc").Find(&list).Error
	return list, err
}

// GetActiveServiceNamesForServer returns a list of active service names to monitor.
// If no custom services exist in the DB, it falls back to the system defaults from config.toml.
func (s *MonitoredServiceService) GetActiveServiceNamesForServer(serverID uuid.UUID, osType string) []string {
	var names []string

	if s.db != nil && serverID != uuid.Nil {
		var list []models.MonitoredService
		if err := s.db.Where("server_id = ? AND enabled = true", serverID).Find(&list).Error; err == nil && len(list) > 0 {
			for _, item := range list {
				names = append(names, item.ServiceName)
			}
			return names
		}
	}

	// Fallback to config.toml defaults
	cfg := config.Get()
	if cfg != nil {
		isWin := strings.Contains(strings.ToLower(osType), "windows")
		if isWin && len(cfg.Agent.Services.Windows) > 0 {
			return cfg.Agent.Services.Windows
		} else if !isWin && len(cfg.Agent.Services.Linux) > 0 {
			return cfg.Agent.Services.Linux
		}
	}

	// Hard defaults if config is empty
	if strings.Contains(strings.ToLower(osType), "windows") {
		return []string{"Spooler", "WinDefend", "EventLog", "wuauserv", "W32Time"}
	}
	return []string{"ssh.service", "cron.service", "systemd-journald.service"}
}

// AddMonitoredService adds a new service to monitor for a server
func (s *MonitoredServiceService) AddMonitoredService(serverID uuid.UUID, serviceName, displayName, alertLevel string) (*models.MonitoredService, error) {
	if s.db == nil {
		return nil, errors.New("database not available")
	}

	serviceName = NormalizeServiceName(serviceName)
	if serviceName == "" {
		return nil, errors.New("service_name cannot be empty")
	}

	// Validation: prevent dangerous shell characters in service name
	if strings.ContainsAny(serviceName, ";|&$`\r\n\t") || strings.Contains(serviceName, "..") {
		return nil, errors.New("invalid characters in service_name")
	}

	alertLevel = strings.ToUpper(strings.TrimSpace(alertLevel))
	if alertLevel != "WARNING" && alertLevel != "CRITICAL" && alertLevel != "INFO" {
		alertLevel = "CRITICAL"
	}

	if displayName == "" {
		displayName = serviceName
	}

	var existing models.MonitoredService
	err := s.db.Where("server_id = ? AND LOWER(service_name) = ?", serverID, strings.ToLower(serviceName)).First(&existing).Error
	if err == nil {
		// Update existing record
		existing.DisplayName = displayName
		existing.AlertLevel = alertLevel
		existing.Enabled = true
		existing.UpdatedAt = time.Now().UTC()
		if saveErr := s.db.Save(&existing).Error; saveErr != nil {
			return nil, saveErr
		}
		return &existing, nil
	}

	item := models.MonitoredService{
		ID:          uuid.New(),
		ServerID:    serverID,
		ServiceName: serviceName,
		DisplayName: displayName,
		AlertLevel:  alertLevel,
		Enabled:     true,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	if createErr := s.db.Create(&item).Error; createErr != nil {
		return nil, createErr
	}

	return &item, nil
}

// RemoveMonitoredService deletes a monitored service for a server
func (s *MonitoredServiceService) RemoveMonitoredService(serverID uuid.UUID, serviceName string) error {
	if s.db == nil {
		return errors.New("database not available")
	}

	serviceName = NormalizeServiceName(serviceName)
	if serviceName == "" {
		return errors.New("service_name cannot be empty")
	}

	return s.db.Where("server_id = ? AND LOWER(service_name) = ?", serverID, strings.ToLower(serviceName)).Delete(&models.MonitoredService{}).Error
}

// ToggleMonitoredService toggles the enabled status of a monitored service
func (s *MonitoredServiceService) ToggleMonitoredService(serverID uuid.UUID, serviceName string) (*models.MonitoredService, error) {
	if s.db == nil {
		return nil, errors.New("database not available")
	}

	var item models.MonitoredService
	err := s.db.Where("server_id = ? AND LOWER(service_name) = ?", serverID, strings.ToLower(serviceName)).First(&item).Error
	if err != nil {
		return nil, errors.New("service not found")
	}

	item.Enabled = !item.Enabled
	item.UpdatedAt = time.Now().UTC()
	if saveErr := s.db.Save(&item).Error; saveErr != nil {
		return nil, saveErr
	}

	return &item, nil
}
