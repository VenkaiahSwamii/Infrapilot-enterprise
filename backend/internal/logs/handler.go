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
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	query := c.Query("query")
	if query == "" {
		query = c.Query("q")
	}

	filter := LogFilter{
		MachineID:     c.Query("machine_id"),
		Hostname:      c.Query("hostname"),
		Platform:      c.Query("platform"),
		OS:            c.Query("os"),
		Level:         c.Query("level"),
		Source:        c.Query("source"),
		Service:       c.Query("service"),
		ContainerName: c.Query("container_name"),
		PodName:       c.Query("pod_name"),
		Namespace:     c.Query("namespace"),
		ClusterName:   c.Query("cluster_name"),
		TimeRange:     c.Query("time_range"),
		Query:         query,
		Limit:         limit,
		Offset:        offset,
	}

	logs, total, err := h.service.GetLogs(filter)
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

func (h *Handler) GetLogStats(c *gin.Context) {
	filter := LogFilter{
		MachineID: c.Query("machine_id"),
		TimeRange: c.Query("time_range"),
	}

	stats, err := h.service.GetLogStats(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (h *Handler) GetLogPatterns(c *gin.Context) {
	filter := LogFilter{
		MachineID: c.Query("machine_id"),
		TimeRange: c.Query("time_range"),
		Level:     c.Query("level"),
	}

	patterns, err := h.service.GetLogPatterns(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"patterns": patterns, "total": len(patterns)})
}

func (h *Handler) GetLogCorrelations(c *gin.Context) {
	idStr := c.Param("id")
	logID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid log ID UUID format"})
		return
	}

	correlations, err := h.service.GetLogCorrelations(logID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, correlations)
}

// Pillar 2: Dynamic Extraction Rules
func (h *Handler) GetExtractionRules(c *gin.Context) {
	rules, err := h.service.GetExtractionRules()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rules": rules, "total": len(rules)})
}

func (h *Handler) CreateExtractionRule(c *gin.Context) {
	var rule models.ExtractionRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if rule.Name == "" || rule.RuleType == "" || rule.Pattern == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, rule_type, and pattern are required fields"})
		return
	}

	if err := h.service.CreateExtractionRule(&rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Extraction rule created successfully", "rule": rule})
}

func (h *Handler) UpdateExtractionRule(c *gin.Context) {
	idStr := c.Param("id")
	ruleID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID format"})
		return
	}

	var rule models.ExtractionRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule.ID = ruleID
	if err := h.service.UpdateExtractionRule(&rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Extraction rule updated successfully", "rule": rule})
}

func (h *Handler) DeleteExtractionRule(c *gin.Context) {
	idStr := c.Param("id")
	ruleID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID format"})
		return
	}

	if err := h.service.DeleteExtractionRule(ruleID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Extraction rule deleted successfully"})
}

func (h *Handler) ToggleExtractionRule(c *gin.Context) {
	idStr := c.Param("id")
	ruleID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID format"})
		return
	}

	rule, err := h.service.ToggleExtractionRule(ruleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Extraction rule toggled successfully", "rule": rule})
}

