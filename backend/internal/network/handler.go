package network

import (
	"net/http"
	"strconv"
	"strings"

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

func (h *Handler) GetOverviewStats(c *gin.Context) {
	stats, err := h.service.GetOverviewStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *Handler) GetAllChecks(c *gin.Context) {
	checks, err := h.service.GetAllChecks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"checks": checks, "total": len(checks)})
}

func (h *Handler) CreateCheck(c *gin.Context) {
	var input struct {
		Name                   string  `json:"name" binding:"required"`
		Type                   string  `json:"type" binding:"required"`
		Target                 string  `json:"target" binding:"required"`
		Host                   string  `json:"host"`
		Port                   int     `json:"port"`
		URL                    string  `json:"url"`
		InterfaceName          string  `json:"interface_name"`
		IntervalSeconds        int     `json:"interval_seconds"`
		TimeoutMs              int     `json:"timeout_ms"`
		ThresholdLatencyMs     float64 `json:"threshold_latency_ms"`
		ThresholdPacketLossPct float64 `json:"threshold_packet_loss_pct"`
		Enabled                *bool   `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	enabledVal := true
	if input.Enabled != nil {
		enabledVal = *input.Enabled
	}

	check := &models.NetworkCheck{
		ID:                     uuid.New(),
		Name:                   strings.TrimSpace(input.Name),
		Type:                   strings.ToUpper(strings.TrimSpace(input.Type)),
		Target:                 strings.TrimSpace(input.Target),
		Host:                   strings.TrimSpace(input.Host),
		Port:                   input.Port,
		URL:                    strings.TrimSpace(input.URL),
		InterfaceName:          strings.TrimSpace(input.InterfaceName),
		IntervalSeconds:        input.IntervalSeconds,
		TimeoutMs:              input.TimeoutMs,
		ThresholdLatencyMs:     input.ThresholdLatencyMs,
		ThresholdPacketLossPct: input.ThresholdPacketLossPct,
		Enabled:                enabledVal,
		LastStatus:             "UNKNOWN",
	}

	if err := h.service.CreateCheck(check); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Trigger immediate initial execution
	go h.service.ExecuteAndRecordCheck(check)

	c.JSON(http.StatusCreated, check)
}

func (h *Handler) GetCheckByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network check ID UUID format"})
		return
	}

	check, err := h.service.GetCheckByID(id)
	if err != nil || check == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network check not found"})
		return
	}

	c.JSON(http.StatusOK, check)
}

func (h *Handler) UpdateCheck(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network check ID UUID format"})
		return
	}

	existing, err := h.service.GetCheckByID(id)
	if err != nil || existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "network check not found"})
		return
	}

	var input struct {
		Name                   string   `json:"name"`
		Type                   string   `json:"type"`
		Target                 string   `json:"target"`
		Host                   string   `json:"host"`
		Port                   int      `json:"port"`
		URL                    string   `json:"url"`
		InterfaceName          string   `json:"interface_name"`
		IntervalSeconds        int      `json:"interval_seconds"`
		TimeoutMs              int      `json:"timeout_ms"`
		ThresholdLatencyMs     float64  `json:"threshold_latency_ms"`
		ThresholdPacketLossPct float64  `json:"threshold_packet_loss_pct"`
		Enabled                *bool    `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.Name != "" {
		existing.Name = strings.TrimSpace(input.Name)
	}
	if input.Type != "" {
		existing.Type = strings.ToUpper(strings.TrimSpace(input.Type))
	}
	if input.Target != "" {
		existing.Target = strings.TrimSpace(input.Target)
	}
	if input.Host != "" {
		existing.Host = strings.TrimSpace(input.Host)
	}
	if input.Port > 0 {
		existing.Port = input.Port
	}
	if input.URL != "" {
		existing.URL = strings.TrimSpace(input.URL)
	}
	if input.InterfaceName != "" {
		existing.InterfaceName = strings.TrimSpace(input.InterfaceName)
	}
	if input.IntervalSeconds > 0 {
		existing.IntervalSeconds = input.IntervalSeconds
	}
	if input.TimeoutMs > 0 {
		existing.TimeoutMs = input.TimeoutMs
	}
	if input.ThresholdLatencyMs > 0 {
		existing.ThresholdLatencyMs = input.ThresholdLatencyMs
	}
	if input.ThresholdPacketLossPct >= 0 {
		existing.ThresholdPacketLossPct = input.ThresholdPacketLossPct
	}
	if input.Enabled != nil {
		existing.Enabled = *input.Enabled
	}

	if err := h.service.UpdateCheck(existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}

func (h *Handler) DeleteCheck(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network check ID UUID format"})
		return
	}

	if err := h.service.DeleteCheck(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "network check deleted successfully"})
}

func (h *Handler) RunCheckNow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network check ID UUID format"})
		return
	}

	metric, err := h.service.RunCheckNow(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, metric)
}

func (h *Handler) GetCheckMetrics(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network check ID UUID format"})
		return
	}

	timeRange := c.Query("time_range")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	metrics, err := h.service.GetCheckMetrics(id, timeRange, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"metrics": metrics, "total": len(metrics)})
}

func (h *Handler) GetHostNetworkViews(c *gin.Context) {
	views, err := h.service.GetHostNetworkViews()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hosts": views, "total": len(views)})
}
