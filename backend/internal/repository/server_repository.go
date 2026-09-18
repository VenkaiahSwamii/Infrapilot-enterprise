package repository

import (
	"errors"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ServerRepository struct{}

func NewServerRepository() *ServerRepository {
	return &ServerRepository{}
}

func (r *ServerRepository) CreateServer(server *models.Server) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Create(server).Error
}

func (r *ServerRepository) GetServerByHostname(hostname string) (*models.Server, error) {
	if database.DB == nil {
		return nil, errors.New("record not found")
	}
	var server models.Server
	err := database.DB.First(&server, "LOWER(hostname) = LOWER(?)", strings.TrimSpace(hostname)).Error
	if err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *ServerRepository) GetServer(id uuid.UUID) (*models.Server, error) {
	if database.DB == nil {
		return nil, errors.New("record not found")
	}
	var server models.Server
	err := database.DB.First(&server, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *ServerRepository) FindExistingServer(id uuid.UUID, hostname string, ipAddress string, macAddress string, osName ...string) (*models.Server, error) {
	if database.DB == nil {
		return nil, errors.New("database not available")
	}

	trimmedHost := strings.TrimSpace(hostname)
	trimmedIP := strings.TrimSpace(ipAddress)
	trimmedMAC := strings.TrimSpace(macAddress)
	osVal := ""
	if len(osName) > 0 {
		osVal = strings.TrimSpace(osName[0])
	}

	// 1. Match by ID if valid and non-nil
	if id != uuid.Nil {
		var s models.Server
		if err := database.DB.First(&s, "id = ?", id).Error; err == nil {
			if osVal == "" || s.OS == "" || strings.EqualFold(s.OS, osVal) {
				return &s, nil
			}
		}
	}

	// 2. Match by MACAddress if provided AND non-empty
	if trimmedMAC != "" {
		var s models.Server
		if err := database.DB.First(&s, "mac_address = ?", trimmedMAC).Error; err == nil {
			if osVal == "" || s.OS == "" || strings.EqualFold(s.OS, osVal) {
				return &s, nil
			}
		}
	}

	// 3. Match by Hostname AND OS if both provided
	if trimmedHost != "" && osVal != "" {
		var s models.Server
		if err := database.DB.First(&s, "LOWER(hostname) = LOWER(?) AND LOWER(os) = LOWER(?)", trimmedHost, osVal).Error; err == nil {
			return &s, nil
		}
	}

	// 4. Match by Hostname AND IP Address if both provided
	if trimmedHost != "" && trimmedIP != "" {
		var s models.Server
		if err := database.DB.First(&s, "LOWER(hostname) = LOWER(?) AND ip_address = ?", trimmedHost, trimmedIP).Error; err == nil {
			return &s, nil
		}
	}

	// 5. Match by Hostname alone only if OS is not specified or matching
	if trimmedHost != "" && osVal == "" {
		var s models.Server
		if err := database.DB.First(&s, "LOWER(hostname) = LOWER(?)", trimmedHost).Error; err == nil {
			return &s, nil
		}
	}

	return nil, errors.New("no matching server found")
}

func (r *ServerRepository) GetServerByIDOrHostname(identifier string) (*models.Server, error) {
	if database.DB == nil {
		if id, err := uuid.Parse(identifier); err == nil {
			return &models.Server{ID: id, Hostname: identifier}, nil
		}
		return &models.Server{ID: uuid.New(), Hostname: identifier}, nil
	}
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, errors.New("empty identifier")
	}

	cleanID := identifier
	targetOS := ""
	if strings.HasSuffix(identifier, "_linux") {
		cleanID = strings.TrimSuffix(identifier, "_linux")
		targetOS = "linux"
	} else if strings.HasSuffix(identifier, "_windows") {
		cleanID = strings.TrimSuffix(identifier, "_windows")
		targetOS = "windows"
	}

	var server models.Server
	if id, err := uuid.Parse(cleanID); err == nil {
		q := database.DB.Where("id = ?", id)
		if targetOS != "" {
			q = q.Where("LOWER(os) = LOWER(?)", targetOS)
		}
		if err := q.First(&server).Error; err == nil {
			return &server, nil
		}
	}

	q := database.DB.Where("LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR id::text LIKE ? OR ip_address = ?", cleanID, cleanID, cleanID+"%", cleanID)
	if targetOS != "" {
		q = q.Where("LOWER(os) = LOWER(?)", targetOS)
	}
	err := q.First(&server).Error
	if err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *ServerRepository) ListServers() ([]models.Server, error) {
	if database.DB == nil {
		return []models.Server{}, nil
	}
	var servers []models.Server
	err := database.DB.Preload("LinuxMetric").Order("hostname asc, id asc").Find(&servers).Error
	return servers, err
}

func (r *ServerRepository) UpdateServer(server *models.Server) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Save(server).Error
}

func (r *ServerRepository) DeleteServer(id uuid.UUID) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Transaction(func(tx *gorm.DB) error {
		strID := id.String()
		tx.Exec("DELETE FROM linux_metrics WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_dockers WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_kubernetes WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_processes WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_services WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_logs WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_alerts WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_networks WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_storages WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM linux_servers WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM metrics WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM historical_metrics WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM audit_logs WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM user_host_permissions WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM terminal_commands WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM terminal_sessions WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM commands WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM file_operations WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM remediation_jobs WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM workflow_executions WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM incidents WHERE machine_id = ?", id)
		tx.Exec("DELETE FROM remote_deployment_records WHERE machine_id = ?", strID)
		tx.Exec("DELETE FROM aiops_anomalies WHERE machine_id = ?", strID)
		tx.Exec("DELETE FROM aiops_predictions WHERE machine_id = ?", strID)
		tx.Exec("DELETE FROM aiops_recommendations WHERE machine_id = ?", strID)
		tx.Exec("DELETE FROM docker_containers WHERE server_id = ?", id)
		tx.Exec("DELETE FROM docker_images WHERE server_id = ?", id)
		tx.Exec("DELETE FROM docker_volumes WHERE server_id = ?", id)
		tx.Exec("DELETE FROM docker_networks WHERE server_id = ?", id)
		tx.Exec("DELETE FROM docker_events WHERE server_id = ?", id)
		tx.Exec("DELETE FROM docker_hosts WHERE server_id = ?", id)
		tx.Exec("DELETE FROM kubernetes_clusters WHERE server_id = ?", id)
		tx.Exec("DELETE FROM ai_recommendations WHERE server_id = ?", id)
		tx.Exec("DELETE FROM ai_predictions WHERE server_id = ?", id)
		tx.Exec("DELETE FROM ai_health_scores WHERE server_id = ?", id)
		return tx.Exec("DELETE FROM servers WHERE id = ?", id).Error
	})
}

func (r *ServerRepository) UpdateHeartbeat(id uuid.UUID, lastSeen time.Time) error {
	if database.DB == nil {
		return nil
	}
	if id.String() == "c762ae37-0462-457c-ab49-cd6485ae2fcb" || id.String() == "e7a110ac-e7d0-41bd-88d8-c628619fbb29" {
		return errors.New("server permanently deleted and blocked by policy")
	}
	return database.DB.Model(&models.Server{}).Where("id = ?", id).Updates(map[string]interface{}{
		"last_seen": lastSeen,
		"status":    "ONLINE",
		"online":    true,
	}).Error
}

func (r *ServerRepository) UpdateStatus(id uuid.UUID, status string, online bool) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Model(&models.Server{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status": status,
		"online": online,
	}).Error
}

func (r *ServerRepository) RotateAPIKey(id uuid.UUID, apiKey string, version int) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Model(&models.Server{}).Where("id = ?", id).Updates(map[string]interface{}{
		"api_key":         apiKey,
		"key_version":     version,
		"last_key_rotate": time.Now(),
	}).Error
}
