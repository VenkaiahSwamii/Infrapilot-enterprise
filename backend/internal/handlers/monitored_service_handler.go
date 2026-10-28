package handlers

import (
	"net/http"
	"strings"

	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type MonitoredServiceHandler struct {
	svc *services.MonitoredServiceService
}

func NewMonitoredServiceHandler(svc *services.MonitoredServiceService) *MonitoredServiceHandler {
	return &MonitoredServiceHandler{svc: svc}
}

type AddServiceRequest struct {
	ServiceName string `json:"service_name" binding:"required"`
	DisplayName string `json:"display_name"`
	AlertLevel  string `json:"alert_level"`
}

func parseServerID(c *gin.Context) (uuid.UUID, error) {
	idStr := strings.TrimSpace(c.Param("id"))
	if idStr == "" {
		idStr = strings.TrimSpace(c.Param("serverId"))
	}
	cleanID := strings.Split(idStr, "_")[0]
	return uuid.Parse(cleanID)
}

func (h *MonitoredServiceHandler) GetMonitoredServices(c *gin.Context) {
	serverID, err := parseServerID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid server ID format"})
		return
	}

	list, err := h.svc.GetMonitoredServices(serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, list)
}

func (h *MonitoredServiceHandler) AddMonitoredService(c *gin.Context) {
	serverID, err := parseServerID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid server ID format"})
		return
	}

	var req AddServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	item, err := h.svc.AddMonitoredService(serverID, req.ServiceName, req.DisplayName, req.AlertLevel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, item)
}

func (h *MonitoredServiceHandler) RemoveMonitoredService(c *gin.Context) {
	serverID, err := parseServerID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid server ID format"})
		return
	}

	serviceName := strings.TrimSpace(c.Param("serviceName"))
	if serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing service name"})
		return
	}

	if err := h.svc.RemoveMonitoredService(serverID, serviceName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted", "service_name": serviceName})
}

func (h *MonitoredServiceHandler) ToggleMonitoredService(c *gin.Context) {
	serverID, err := parseServerID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid server ID format"})
		return
	}

	serviceName := strings.TrimSpace(c.Param("serviceName"))
	if serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing service name"})
		return
	}

	item, err := h.svc.ToggleMonitoredService(serverID, serviceName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, item)
}
