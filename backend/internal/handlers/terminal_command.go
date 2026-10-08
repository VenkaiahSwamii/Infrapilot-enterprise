package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"
	"infrapilot/backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TerminalCommandRequest struct {
	MachineID string `json:"machine_id"`
	SessionID string `json:"session_id"`
	Command   string `json:"command"`
}

// isCommandBlocked checks if a command matches any blocked patterns
func isCommandBlocked(command string) (bool, string, string) {
	var blocked []models.BlockedCommand
	if err := database.DB.Where("organization = ?", "Default Organization").Find(&blocked).Error; err != nil {
		return false, "", ""
	}

	cmdLower := strings.ToLower(strings.TrimSpace(command))

	for _, b := range blocked {
		if strings.Contains(cmdLower, strings.ToLower(b.Pattern)) {
			return true, b.Pattern, b.Severity
		}
	}

	return false, "", ""
}

func ExecuteTerminalCommand(c *gin.Context) {
	var req TerminalCommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(req.Command) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "command cannot be empty"})
		return
	}

	// Security check: validate command is not blocked
	if blocked, pattern, severity := isCommandBlocked(req.Command); blocked {
		if severity == "BLOCKED" {
			c.JSON(http.StatusForbidden, gin.H{
				"error":           fmt.Sprintf("Command blocked by security policy: %s", pattern),
				"blocked_pattern": pattern,
			})
			return
		}
	}

	machineID, _ := uuid.Parse(req.MachineID)
	if machineID == uuid.Nil && strings.TrimSpace(req.MachineID) != "" && database.DB != nil {
		var server models.Server
		if err := database.DB.Where("LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR id::text LIKE ?", req.MachineID, req.MachineID, req.MachineID+"%").First(&server).Error; err == nil {
			machineID = server.ID
		}
	}

	if machineID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A valid target machine_id is required to execute commands"})
		return
	}

	sessionID, _ := uuid.Parse(req.SessionID)

	now := time.Now()
	cmd := models.TerminalCommand{
		ID:        uuid.New(),
		SessionID: sessionID,
		MachineID: machineID,
		Command:   req.Command,
		Status:    "PENDING",
		CreatedAt: now,
	}

	if err := database.DB.Create(&cmd).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create command"})
		return
	}

	// Audit log: record terminal command execution
	actor := c.GetString("username")
	utils.LogAudit(actor, machineID, fmt.Sprintf("Terminal command: %s", req.Command), "Queued")

	// Broadcast command queued event via WebSocket
	websocket.BroadcastToSession(sessionID, map[string]interface{}{
		"type":       "command_queued",
		"command_id": cmd.ID.String(),
		"command":    req.Command,
		"status":     "PENDING",
		"timestamp":  now.Format(time.RFC3339),
	})

	c.JSON(http.StatusOK, gin.H{
		"message": "Command queued",
		"id":      cmd.ID.String(),
		"status":  "PENDING",
	})
}
