package handlers

import (
	"net/http"

	"infrapilot/backend/internal/config"

	"github.com/gin-gonic/gin"
)

type ConfigHandler struct{}

func NewConfigHandler() *ConfigHandler {
	return &ConfigHandler{}
}

// GetPublicConfig returns the dynamically loaded server configuration (backend_url, ports)
func (h *ConfigHandler) GetPublicConfig(c *gin.Context) {
	cfg := config.Get()
	
	backendURL := cfg.BackendURL
	if backendURL == "" {
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		backendURL = scheme + "://" + c.Request.Host
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"backend_url": backendURL,
		"server_port": cfg.ServerPort,
	})
}
