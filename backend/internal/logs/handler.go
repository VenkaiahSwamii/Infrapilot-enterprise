package logs

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) IngestLogs(c *gin.Context) {
	if c.Request.Body == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty request body"})
		return
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	// 1. Try JSON Array of logs
	var batch []models.Log
	if err := json.Unmarshal(bodyBytes, &batch); err == nil && len(batch) > 0 {
		if err := h.service.IngestBatch(batch); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"message": "Logs batch ingested successfully", "count": len(batch)})
		return
	}

	// 2. Try Wrapper object {"logs": [...]}
	var wrapper struct {
		Logs []models.Log `json:"logs"`
	}
	if err := json.Unmarshal(bodyBytes, &wrapper); err == nil && len(wrapper.Logs) > 0 {
		if err := h.service.IngestBatch(wrapper.Logs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"message": "Logs batch ingested successfully", "count": len(wrapper.Logs)})
		return
	}

	// 3. Try Single log entry
	var single models.Log
	if err := json.Unmarshal(bodyBytes, &single); err == nil {
		if err := h.service.Ingest(&single); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"message": "Log ingested successfully", "log": single})
		return
	}

	c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid log payload format"})
}

func (h *Handler) GetLogs(c *gin.Context) {
	level := c.Query("level")
	source := c.Query("source")
	query := c.Query("query")
	if query == "" {
		query = c.Query("q")
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	logs, total, err := h.service.GetLogs(level, source, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs, "total": total})
}

func (h *Handler) GetMachineLogs(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		idStr = c.Query("machine_id")
	}

	machineID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid machine ID UUID format"})
		return
	}

	level := c.Query("level")
	source := c.Query("source")
	query := c.Query("query")
	if query == "" {
		query = c.Query("q")
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	logs, total, err := h.service.GetMachineLogs(machineID, level, source, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs, "total": total})
}
