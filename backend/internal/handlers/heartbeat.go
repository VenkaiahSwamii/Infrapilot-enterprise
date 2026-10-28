package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type HeartbeatRequest struct {
	MachineID string `json:"machine_id"`
	Hostname  string `json:"hostname"`
}

func Heartbeat(c *gin.Context) {
	var req HeartbeatRequest
	_ = c.ShouldBindJSON(&req)

	machineIDStr := req.MachineID
	if machineIDStr == "" {
		machineIDStr = c.Query("machine_id")
	}
	if machineIDStr == "" {
		machineIDStr = c.Param("id")
	}

	var machineID uuid.UUID
	if machineIDStr != "" {
		machineID, _ = uuid.Parse(machineIDStr)
	}

	var machine models.Machine
	found := false

	if machineID != uuid.Nil && database.DB != nil {
		if err := database.DB.First(&machine, "id = ?", machineID).Error; err == nil {
			found = true
		}
	}

	if !found && database.DB != nil {
		if serverVal, exists := c.Get("server"); exists {
			if s, ok := serverVal.(*models.Server); ok {
				machine = *s
				found = true
			}
		}
		if !found && strings.TrimSpace(req.Hostname) != "" {
			if err := database.DB.Where("LOWER(hostname) = LOWER(?)", strings.TrimSpace(req.Hostname)).First(&machine).Error; err == nil {
				found = true
			}
		}
	}

	if !found {
		c.JSON(http.StatusGone, gin.H{
			"error":  "Machine is deleted or not connected. Please connect the machine manually.",
			"status": "unregistered",
		})
		return
	}

	if machine.IsBlocked || strings.EqualFold(machine.Status, "BLOCKED") || strings.EqualFold(machine.Status, "STOPPED") {
		c.JSON(http.StatusForbidden, gin.H{
			"error":  "Machine is stopped or blocked by administrator.",
			"status": "blocked",
		})
		return
	}

	if database.DB != nil && machine.ID != uuid.Nil {
		var count int64
		_ = database.DB.Raw("SELECT COUNT(*) FROM servers WHERE (id = ? OR LOWER(hostname) = LOWER(?) OR ip_address = ?) AND (is_blocked = true OR LOWER(status) = 'blocked')", machine.ID, machine.Hostname, machine.IPAddress).Scan(&count).Error
		if count > 0 {
			c.JSON(http.StatusForbidden, gin.H{
				"error":  "Machine is stopped or blocked by administrator.",
				"status": "blocked",
			})
			return
		}
	}

	now := time.Now().UTC()
	machine.LastSeen = now
	machine.Status = "ONLINE"
	machine.Online = true
	machine.RetryCount = 0
	if database.DB != nil {
		database.DB.Save(&machine)
	}

	monitoredSvc := services.NewMonitoredServiceService(database.DB)
	monitoredServices := monitoredSvc.GetActiveServiceNamesForServer(machine.ID, machine.OS)

	servicePolicies := make(map[string]string)
	if database.DB != nil {
		var activePolicies []models.SREActionPolicy
		if err := database.DB.Where("enabled = ?", true).Find(&activePolicies).Error; err == nil {
			// 1. Process category-level defaults first
			for _, p := range activePolicies {
				cat := strings.ToLower(strings.TrimSpace(p.Category))
				mode := strings.ToUpper(strings.TrimSpace(p.Mode))
				if cat != "" && mode != "" {
					servicePolicies[cat] = mode
					if cat == "storage" {
						servicePolicies["disk"] = mode
					}
				}
			}

			// 2. Process component-level specific overrides (takes precedence over category)
			for _, p := range activePolicies {
				comp := strings.ToLower(strings.TrimSpace(p.Component))
				mode := strings.ToUpper(strings.TrimSpace(p.Mode))
				if comp == "" || mode == "" {
					continue
				}
				servicePolicies[comp] = mode
				servicePolicies[strings.TrimSuffix(comp, ".service")] = mode
				servicePolicies[comp+".service"] = mode

				// Map specific storage components to known mount points
				if comp == "root_disk" {
					servicePolicies["/"] = mode
					servicePolicies["c:"] = mode
					servicePolicies["c"] = mode
				} else if comp == "var_log_disk" {
					servicePolicies["/var/log"] = mode
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "Heartbeat received",
		"status":             "success",
		"machine_id":         machine.ID.String(),
		"monitored_services": monitoredServices,
		"service_policies":   servicePolicies,
	})

	log.Printf("HEARTBEAT RECEIVED machine_id=%s hostname=%s ip=%s last_seen=%s status=ONLINE",
		machine.ID.String(), machine.Hostname, machine.IPAddress, machine.LastSeen.Format(time.RFC3339))
}
