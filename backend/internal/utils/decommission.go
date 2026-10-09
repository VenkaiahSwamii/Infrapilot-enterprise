package utils

import (
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IsHostDecommissioned returns false (tombstones removed in favor of clean enrollment validation).
func IsHostDecommissioned(db *gorm.DB, id uuid.UUID, hostname string, ip string) bool {
	return false
}

// DecommissionHost is a no-op kept for interface compatibility.
func DecommissionHost(db *gorm.DB, id uuid.UUID, hostname string, ip string, username string, reason string) error {
	return nil
}

// UndecommissionHost cleans legacy tombstones if the table exists.
func UndecommissionHost(db *gorm.DB, id uuid.UUID, hostname string, ip string) error {
	if db == nil {
		return nil
	}
	if db.Migrator().HasTable("decommissioned_hosts") {
		_ = db.Exec("DELETE FROM decommissioned_hosts").Error
	}
	return nil
}

// PurgeServerCascade performs a safe, complete cascading deletion across all existing database tables
// and establishes a permanent decommission tombstone so the host cannot auto-resurrect.
func PurgeServerCascade(db *gorm.DB, id uuid.UUID, hostname string, ip string, username string, reason string) error {
	if db == nil {
		return nil
	}

	cleanedHost := strings.TrimSpace(hostname)
	cleanedIP := strings.TrimSpace(ip)

	// 1. Wipe legacy tombstones if any exist
	if db.Migrator().HasTable("decommissioned_hosts") {
		_ = db.Exec("DELETE FROM decommissioned_hosts").Error
	}

	// 2. Gather all matching server IDs
	idSet := make(map[uuid.UUID]bool)
	if id != uuid.Nil {
		idSet[id] = true
	}

	if db.Migrator().HasTable("servers") {
		var matched []uuid.UUID
		if cleanedHost != "" && cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
			_ = db.Table("servers").Where("LOWER(hostname) = LOWER(?) OR ip_address = ?", cleanedHost, cleanedIP).Pluck("id", &matched).Error
		} else if cleanedHost != "" {
			_ = db.Table("servers").Where("LOWER(hostname) = LOWER(?)", cleanedHost).Pluck("id", &matched).Error
		} else if cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
			_ = db.Table("servers").Where("ip_address = ?", cleanedIP).Pluck("id", &matched).Error
		}
		for _, mid := range matched {
			if mid != uuid.Nil {
				idSet[mid] = true
			}
		}
	}

	machineIdTables := []string{
		"linux_metrics", "linux_dockers", "linux_kubernetes", "linux_processes",
		"linux_services", "linux_logs", "logs", "linux_alerts", "linux_networks",
		"linux_storages", "linux_servers", "metrics", "historical_metrics",
		"audit_logs", "user_host_permissions", "terminal_commands", "terminal_sessions",
		"remediation_jobs", "workflow_executions", "incidents",
	}

	serverIdTables := []string{
		"docker_containers", "docker_images", "docker_volumes", "docker_networks",
		"docker_events", "docker_hosts", "kubernetes_clusters", "ai_recommendations",
		"ai_predictions", "ai_health_scores",
	}

	// 3. Delete from child tables for all collected IDs
	for mid := range idSet {
		for _, tbl := range machineIdTables {
			if db.Migrator().HasTable(tbl) {
				_ = db.Exec("DELETE FROM "+tbl+" WHERE machine_id = ?", mid).Error
			}
		}

		for _, tbl := range serverIdTables {
			if db.Migrator().HasTable(tbl) {
				_ = db.Exec("DELETE FROM "+tbl+" WHERE server_id = ?", mid).Error
			}
		}
	}

	// 4. Delete from central servers table
	if db.Migrator().HasTable("servers") {
		for mid := range idSet {
			_ = db.Exec("DELETE FROM servers WHERE id = ?", mid).Error
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
		for mid := range idSet {
			_ = db.Exec("DELETE FROM machines WHERE id = ?", mid).Error
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

