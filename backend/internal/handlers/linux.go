package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func resolveLinuxMachineID(c *gin.Context) (uuid.UUID, error) {
	idStr := c.Param("machineId")
	if idStr == "" {
		idStr = c.Param("id")
	}
	idStr = strings.TrimSpace(idStr)
	if idStr == "" {
		return uuid.Nil, errors.New("missing machine id")
	}

	if parsed, err := uuid.Parse(idStr); err == nil {
		return parsed, nil
	}

	if database.DB != nil {
		var server models.Server
		if err := database.DB.First(&server, "LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR id::text LIKE ? OR ip_address = ?", idStr, idStr, idStr+"%", idStr).Error; err == nil {
			return server.ID, nil
		}
	}

	return uuid.Nil, errors.New("machine not found")
}

func ListLinuxServers(c *gin.Context) {
	var servers []models.LinuxServer
	if err := database.DB.Order("last_seen_at desc").Find(&servers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list linux servers"})
		return
	}
	c.JSON(http.StatusOK, servers)
}

func GetLinuxServer(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "linux server not found"})
		return
	}

	var server models.LinuxServer
	if err := database.DB.Where("machine_id = ?", machineID).First(&server).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "linux server not found"})
		return
	}

	c.JSON(http.StatusOK, server)
}

func GetLinuxMetrics(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	since := time.Now().Add(-1 * time.Hour)
	switch c.Query("range") {
	case "24h":
		since = time.Now().Add(-24 * time.Hour)
	case "7d":
		since = time.Now().Add(-7 * 24 * time.Hour)
	}

	var metrics []models.LinuxMetric
	if err := database.DB.Where("machine_id = ? AND sampled_at >= ?", machineID, since).Order("sampled_at asc").Find(&metrics).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load linux metrics"})
		return
	}
	c.JSON(http.StatusOK, metrics)
}

func GetLinuxProcesses(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var processes []models.LinuxProcess
	if err := database.DB.Where("machine_id = ?", machineID).Order("sampled_at desc, cpu_percent desc").Limit(50).Find(&processes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load linux processes"})
		return
	}
	c.JSON(http.StatusOK, processes)
}

func GetLinuxServices(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var services []models.LinuxService
	if err := database.DB.Where("machine_id = ?", machineID).Order("status asc, name asc").Find(&services).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load linux services"})
		return
	}
	c.JSON(http.StatusOK, services)
}

func GetLinuxNetwork(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var rows []models.LinuxNetwork
	if err := database.DB.Where("machine_id = ?", machineID).Order("sampled_at desc").Limit(60).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load linux network"})
		return
	}
	c.JSON(http.StatusOK, rows)
}

func GetLinuxStorage(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var rows []models.LinuxStorage
	if err := database.DB.Where("machine_id = ?", machineID).Order("sampled_at desc").Limit(60).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load linux storage"})
		return
	}
	c.JSON(http.StatusOK, rows)
}

type AgentLogsBatchRequest struct {
	Logs []struct {
		Timestamp string `json:"timestamp"`
		Source    string `json:"source"`
		Level     string `json:"level"`
		Message   string `json:"message"`
	} `json:"logs"`
}

func ReceiveAgentLogs(c *gin.Context) {
	// 1. Resolve Machine ID contextually
	var machineUUID uuid.UUID
	if machineVal, exists := c.Get("machine"); exists {
		if m, ok := machineVal.(*models.Machine); ok {
			machineUUID = m.ID
		}
	}
	if machineUUID == uuid.Nil {
		if serverVal, exists := c.Get("server"); exists {
			if s, ok := serverVal.(*models.Server); ok {
				machineUUID = s.ID
			}
		}
	}

	if machineUUID == uuid.Nil {
		machineIDStr := c.GetString("machineId")
		if machineIDStr == "" {
			machineIDStr = c.Query("machine_id")
		}
		if machineIDStr != "" {
			if id, err := uuid.Parse(machineIDStr); err == nil {
				machineUUID = id
			}
		}
	}

	// 2. Read raw request body to handle both array and object formats
	var rawBody []byte
	var err error
	if c.Request.Body != nil {
		rawBody, err = io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
			return
		}
	}

	type LogItem struct {
		Timestamp string    `json:"timestamp"`
		Source    string    `json:"source"`
		Level     string    `json:"level"`
		Message   string    `json:"message"`
		MachineID uuid.UUID `json:"machine_id"`
	}

	var logsList []LogItem
	trimmedBody := bytes.TrimSpace(rawBody)

	if len(trimmedBody) > 0 && trimmedBody[0] == '[' {
		// Parse JSON Array: []LogItem
		if err := json.Unmarshal(rawBody, &logsList); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		// Parse JSON Object: {"logs": [...] }
		var batchReq AgentLogsBatchRequest
		if err := json.Unmarshal(rawBody, &batchReq); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		for _, l := range batchReq.Logs {
			logsList = append(logsList, LogItem{
				Timestamp: l.Timestamp,
				Source:    l.Source,
				Level:     l.Level,
				Message:   l.Message,
			})
		}
	}

	// Fallback to extract machine UUID from log items if still not resolved
	if machineUUID == uuid.Nil {
		for _, l := range logsList {
			if l.MachineID != uuid.Nil {
				machineUUID = l.MachineID
				break
			}
		}
	}

	if machineUUID == uuid.Nil {
		machineUUID = uuid.New()
	}

	tx := database.DB.Begin()
	for _, l := range logsList {
		parsedTime, parseErr := time.Parse(time.RFC3339, l.Timestamp)
		if parseErr != nil {
			parsedTime = time.Now()
		}

		dbLog := models.LinuxLog{
			ID:        uuid.New(),
			MachineID: machineUUID,
			Timestamp: parsedTime,
			Source:    l.Source,
			Level:     l.Level,
			Message:   l.Message,
		}

		if err := tx.Create(&dbLog).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist log batch"})
			return
		}
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "Logs successfully delivered"})
}

func GetLinuxDocker(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.LinuxDocker{})
		return
	}

	var rows []models.LinuxDocker
	if err := database.DB.Where("machine_id = ?", machineID).Order("sampled_at desc").Limit(10).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load docker info"})
		return
	}

	c.JSON(http.StatusOK, rows)
}

func GetLinuxLogs(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.LinuxLog{})
		return
	}

	var logs []models.LinuxLog
	if err := database.DB.Where("machine_id = ?", machineID).Order("timestamp desc").Limit(100).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load machine logs"})
		return
	}

	c.JSON(http.StatusOK, logs)
}

func GetLinuxFilesystems(c *gin.Context) {
	machineID, err := resolveLinuxMachineID(c)
	if err != nil {
		c.JSON(http.StatusOK, []gin.H{})
		return
	}

	var storage models.LinuxStorage
	if err := database.DB.Where("machine_id = ?", machineID).Order("sampled_at desc").First(&storage).Error; err != nil {
		c.JSON(http.StatusOK, []gin.H{})
		return
	}

	c.JSON(http.StatusOK, storage)
}
