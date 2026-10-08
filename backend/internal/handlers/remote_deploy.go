package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"infrapilot/backend/internal/config"
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
		cfg := config.Get()
		if cfg != nil && cfg.BackendURL != "" {
			target.ServerURL = cfg.BackendURL
		} else {
			scheme := "http"
			if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
				scheme = "https"
			}
			host := c.Request.Host
			if host == "" {
				host = "localhost:8080"
			}
			target.ServerURL = scheme + "://" + host
		}
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

// ExecuteUninstall handles POST /api/v1/servers/:id/remote-uninstall
func (h *RemoteDeployHandler) ExecuteUninstall(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		idStr = c.Query("id")
	}

	var target services.RemoteUninstallTarget
	if err := c.ShouldBindJSON(&target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	target.Host = strings.TrimSpace(target.Host)
	target.Username = strings.TrimSpace(target.Username)

	// If no ID was provided in route parameter, allow host or machine ID in JSON
	if idStr == "" {
		idStr = target.Host
	}

	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Server ID or Host is required.",
		})
		return
	}

	actor := "admin"
	if u, exists := c.Get("username"); exists && u != nil {
		actor = fmt.Sprintf("%v", u)
	}

	result, err := h.deployService.RemoteUninstallAgent(c.Request.Context(), idStr, target, actor)
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
