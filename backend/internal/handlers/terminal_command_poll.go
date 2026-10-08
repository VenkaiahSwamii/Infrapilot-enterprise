package handlers

import (
	"net/http"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GetPendingTerminalCommands returns pending terminal commands for a machine (agent polling)
func GetPendingTerminalCommands(c *gin.Context) {
	machineID := c.Query("machine_id")
	if machineID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "machine_id query parameter is required"})
		return
	}

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(machineID); err != nil {
		var machine models.Machine
		if database.DB.Where("id::text LIKE ? OR hostname = ?", machineID+"%", machineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	var cmds []models.TerminalCommand
	if err := database.DB.Where("machine_id = ? AND status IN ?", machineUUID, []string{"PENDING", "RUNNING"}).Order("created_at ASC").Find(&cmds).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch terminal commands"})
		return
	}

	// Mark PENDING commands as RUNNING
	now := time.Now()
	for i := range cmds {
		if cmds[i].Status == "PENDING" {
			cmds[i].Status = "RUNNING"
			cmds[i].StartedAt = &now
			database.DB.Save(&cmds[i])
		}
	}

	c.JSON(http.StatusOK, cmds)
}

// PostTerminalCommandResult receives execution result from agent and updates the TerminalCommand record
func PostTerminalCommandResult(c *gin.Context) {
	var req struct {
		CommandID string `json:"command_id" binding:"required"`
		Stdout    string `json:"stdout"`
		Stderr    string `json:"stderr"`
		Output    string `json:"output"`
		ExitCode  *int   `json:"exit_code"`
		Status    string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cmdUUID, err := uuid.Parse(req.CommandID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid command ID"})
		return
	}

	var cmd models.TerminalCommand
	if err := database.DB.First(&cmd, "id = ?", cmdUUID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "terminal command not found"})
		return
	}

	now := time.Now()
	cmd.Stdout = req.Stdout
	cmd.Stderr = req.Stderr
	if req.Output != "" {
		cmd.Output = req.Output
	}
	if req.Stdout != "" {
		cmd.Output = req.Stdout
	}
	cmd.ExitCode = req.ExitCode
	cmd.Status = req.Status
	cmd.FinishedAt = &now
	if err := database.DB.Save(&cmd).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save result"})
		return
	}

	// Broadcast completion event via WebSocket
	websocket.BroadcastToSession(cmd.SessionID, map[string]interface{}{
		"type":        "command_completed",
		"command_id":  cmd.ID.String(),
		"status":      cmd.Status,
		"stdout":      cmd.Stdout,
		"stderr":      cmd.Stderr,
		"exit_code":   cmd.ExitCode,
		"finished_at": now.Format(time.RFC3339),
	})

	if websocket.WS != nil {
		websocket.WS.BroadcastJSON(map[string]interface{}{
			"event":       "command_completed",
			"type":        "command_completed",
			"command_id":  cmd.ID.String(),
			"machine_id":  cmd.MachineID.String(),
			"command":     cmd.Command,
			"status":      cmd.Status,
			"stdout":      cmd.Stdout,
			"stderr":      cmd.Stderr,
			"exit_code":   cmd.ExitCode,
			"finished_at": now.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, cmd)
}

// ListTerminalCommands returns command history for a machine
func ListTerminalCommands(c *gin.Context) {
	machineID := c.Query("machine_id")
	if machineID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "machine_id query parameter is required"})
		return
	}

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(machineID); err != nil {
		var machine models.Machine
		if database.DB.Where("id::text LIKE ? OR hostname = ?", machineID+"%", machineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	var cmds []models.TerminalCommand
	limit := 50
	if err := database.DB.Where("machine_id = ?", machineUUID).Order("created_at DESC").Limit(limit).Find(&cmds).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch terminal commands"})
		return
	}

	c.JSON(http.StatusOK, cmds)
}
