package handlers

import (
	"net/http"
	"strings"

	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
)

type RemoteDeployHandler struct {
	deployService *services.RemoteDeployService
}

func NewRemoteDeployHandler(deployService *services.RemoteDeployService) *RemoteDeployHandler {
	return &RemoteDeployHandler{
		deployService: deployService,
	}
}

// TestConnection handles POST /api/v1/agent/remote-deploy/test
func (h *RemoteDeployHandler) TestConnection(c *gin.Context) {
	var target services.RemoteDeployTarget
	if err := c.ShouldBindJSON(&target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
			"message": "Host and Username are required.",
		})
		return
	}

	target.Host = strings.TrimSpace(target.Host)
	target.Username = strings.TrimSpace(target.Username)

	if target.Host == "" || target.Username == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Target host IP and Username are required.",
		})
		return
	}

	res, err := h.deployService.TestConnection(c.Request.Context(), target)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, res)
}

// ExecuteDeploy handles POST /api/v1/agent/remote-deploy/execute
func (h *RemoteDeployHandler) ExecuteDeploy(c *gin.Context) {
	var target services.RemoteDeployTarget
	if err := c.ShouldBindJSON(&target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	target.Host = strings.TrimSpace(target.Host)
	target.Username = strings.TrimSpace(target.Username)

	if target.Host == "" || target.Username == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Target host IP and Username are required.",
		})
		return
	}

	// Default server URL if omitted in request
	if target.ServerURL == "" {
		scheme := "http"
		if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		host := c.Request.Host
		if host == "" {
			host = "192.168.1.2:8080"
		}
		target.ServerURL = scheme + "://" + host
	}

	result, err := h.deployService.DeployAgent(c.Request.Context(), target)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	status := http.StatusOK
	if !result.Success {
		status = http.StatusUnprocessableEntity
	}

	c.JSON(status, result)
}

// GetHistory handles GET /api/v1/agent/remote-deploy/history
func (h *RemoteDeployHandler) GetHistory(c *gin.Context) {
	history := h.deployService.GetDeploymentHistory()
	c.JSON(http.StatusOK, gin.H{
		"deployments": history,
		"count":       len(history),
	})
}

// GetDeployment handles GET /api/v1/agent/remote-deploy/:id
func (h *RemoteDeployHandler) GetDeployment(c *gin.Context) {
	id := c.Param("id")
	item := h.deployService.GetDeployment(id)
	if item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Deployment record not found"})
		return
	}
	c.JSON(http.StatusOK, item)
}
