package utils

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"infrapilot/backend/internal/models"
)

// IsHostDecommissioned checks if a machine ID, hostname, or IP address has been permanently deleted/decommissioned.
func IsHostDecommissioned(db *gorm.DB, id uuid.UUID, hostname string, ip string) bool {
	if db == nil {
		return false
	}

	cleanedHost := strings.TrimSpace(hostname)
	cleanedIP := strings.TrimSpace(ip)

	// 1. If an active server or machine record exists in the database, the host is explicitly NOT decommissioned.
	// Any active registration or redeployment automatically supersedes previous tombstones.
	if id != uuid.Nil {
		var count int64
		if db.Migrator().HasTable("servers") {
			_ = db.Table("servers").Where("id = ?", id).Count(&count).Error
			if count > 0 {
				_ = UndecommissionHost(db, id, cleanedHost, cleanedIP)
				return false
			}
		}
		if db.Migrator().HasTable("machines") {
			_ = db.Table("machines").Where("id = ?", id).Count(&count).Error
			if count > 0 {
				_ = UndecommissionHost(db, id, cleanedHost, cleanedIP)
				return false
			}
		}
	}

	if cleanedHost != "" {
		var hCount int64
		if db.Migrator().HasTable("servers") {
			_ = db.Table("servers").Where("LOWER(hostname) = LOWER(?)", cleanedHost).Count(&hCount).Error
			if hCount > 0 {
				_ = UndecommissionHost(db, id, cleanedHost, cleanedIP)
				return false
			}
		}
	}

	var count int64
	var conds []string
	var vals []interface{}

	if id != uuid.Nil {
		conds = append(conds, "server_id = ?")
		vals = append(vals, id)
	}

	// Only evaluate IP if neither specific ID nor Hostname were provided (avoids DHCP false-positive bans)
	if len(conds) == 0 {
		if cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
			conds = append(conds, "ip_address = ?")
			vals = append(vals, cleanedIP)
		}
	}

	if len(conds) == 0 {
		return false
	}

	query := strings.Join(conds, " OR ")
	if err := db.Model(&models.DecommissionedHost{}).Where(query, vals...).Count(&count).Error; err != nil {
		return false
	}

	return count > 0
}

// DecommissionHost permanently marks a machine/host as decommissioned in the database.
func DecommissionHost(db *gorm.DB, id uuid.UUID, hostname string, ip string, username string, reason string) error {
	if db == nil {
		return nil
	}

	if username == "" {
		username = "admin"
	}
	if reason == "" {
		reason = "Deleted by administrator"
	}

	record := models.DecommissionedHost{
		ID:        uuid.New(),
		ServerID:  id,
		Hostname:  strings.TrimSpace(hostname),
		IPAddress: strings.TrimSpace(ip),
		DeletedAt: time.Now().UTC(),
		DeletedBy: username,
		Reason:    reason,
	}

	return db.Create(&record).Error
}

// UndecommissionHost removes a host from the decommissioned list when an administrator explicitly re-enrolls it.
func UndecommissionHost(db *gorm.DB, id uuid.UUID, hostname string, ip string) error {
	if db == nil {
		return nil
	}

	cleanedHost := strings.TrimSpace(hostname)
	cleanedIP := strings.TrimSpace(ip)

	var conds []string
	var vals []interface{}

	if id != uuid.Nil {
		conds = append(conds, "server_id = ?")
		vals = append(vals, id)
	}
	if cleanedHost != "" {
		conds = append(conds, "LOWER(hostname) = LOWER(?)")
		vals = append(vals, cleanedHost)
	}
	if cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
		conds = append(conds, "ip_address = ?")
		vals = append(vals, cleanedIP)
	}
	if len(conds) == 0 {
		return nil
	}

	query := strings.Join(conds, " OR ")
	return db.Where(query, vals...).Delete(&models.DecommissionedHost{}).Error
}

// PurgeServerCascade performs a safe, complete cascading deletion across all existing database tables
// and establishes a permanent decommission tombstone so the host cannot auto-resurrect.
func PurgeServerCascade(db *gorm.DB, id uuid.UUID, hostname string, ip string, username string, reason string) error {
	if db == nil {
		return nil
	}

	cleanedHost := strings.TrimSpace(hostname)
	cleanedIP := strings.TrimSpace(ip)

	// 1. Establish permanent Decommission Tombstone first
	_ = DecommissionHost(db, id, cleanedHost, cleanedIP, username, reason)

	// 2. Child tables indexed by machine_id (UUID)
	if id != uuid.Nil {
		machineIdTables := []string{
			"linux_metrics", "linux_dockers", "linux_kubernetes", "linux_processes",
			"linux_services", "linux_logs", "logs", "linux_alerts", "linux_networks",
			"linux_storages", "linux_servers", "metrics", "historical_metrics",
			"audit_logs", "user_host_permissions", "terminal_commands", "terminal_sessions",
			"remediation_jobs", "workflow_executions", "incidents",
		}

		for _, tbl := range machineIdTables {
			if db.Migrator().HasTable(tbl) {
				_ = db.Exec("DELETE FROM "+tbl+" WHERE machine_id = ?", id).Error
			}
		}

		// 3. Child tables indexed by server_id (UUID)
		serverIdTables := []string{
			"docker_containers", "docker_images", "docker_volumes", "docker_networks",
			"docker_events", "docker_hosts", "kubernetes_clusters", "ai_recommendations",
			"ai_predictions", "ai_health_scores",
		}

		for _, tbl := range serverIdTables {
			if db.Migrator().HasTable(tbl) {
				_ = db.Exec("DELETE FROM "+tbl+" WHERE server_id = ?", id).Error
			}
		}
	}

	// 4. Delete from central servers table
	if db.Migrator().HasTable("servers") {
		if id != uuid.Nil {
			_ = db.Exec("DELETE FROM servers WHERE id = ?", id).Error
		}
		if cleanedHost != "" {
			_ = db.Exec("DELETE FROM servers WHERE LOWER(hostname) = LOWER(?)", cleanedHost).Error
		}
		if cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
			_ = db.Exec("DELETE FROM servers WHERE ip_address = ?", cleanedIP).Error
		}
	}

	// 5. Delete from legacy machines table if exists
	if db.Migrator().HasTable("machines") {
		if id != uuid.Nil {
			_ = db.Exec("DELETE FROM machines WHERE id = ?", id).Error
		}
		if cleanedHost != "" {
			_ = db.Exec("DELETE FROM machines WHERE LOWER(hostname) = LOWER(?)", cleanedHost).Error
		}
		if cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
			_ = db.Exec("DELETE FROM machines WHERE ip_address = ?", cleanedIP).Error
		}
	}

	return nil
}
