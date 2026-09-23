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

	var count int64
	var conds []string
	var vals []interface{}

	if id != uuid.Nil {
		conds = append(conds, "server_id = ?")
		vals = append(vals, id)
	}

	cleanedHost := strings.TrimSpace(hostname)
	if cleanedHost != "" {
		conds = append(conds, "LOWER(hostname) = LOWER(?)")
		vals = append(vals, cleanedHost)
	}

	cleanedIP := strings.TrimSpace(ip)
	if cleanedIP != "" && cleanedIP != "127.0.0.1" && cleanedIP != "localhost" && cleanedIP != "0.0.0.0" {
		conds = append(conds, "ip_address = ?")
		vals = append(vals, cleanedIP)
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
