package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type HeartbeatRequest struct {
	MachineID string `json:"machine_id"`
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
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{
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
		_ = database.DB.Raw("SELECT COUNT(*) FROM servers WHERE (id = ? OR LOWER(hostname) = LOWER(?) OR ip_address = ?) AND (is_blocked = true OR LOWER(status) = 'blocked' OR LOWER(status) = 'stopped')", machine.ID, machine.Hostname, machine.IPAddress).Scan(&count).Error
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

	c.JSON(http.StatusOK, gin.H{
		"message":    "Heartbeat received",
		"machine_id": machine.ID.String(),
	})

	log.Printf("HEARTBEAT RECEIVED machine_id=%s hostname=%s ip=%s last_seen=%s status=ONLINE",
		machine.ID.String(), machine.Hostname, machine.IPAddress, machine.LastSeen.Format(time.RFC3339))
}
