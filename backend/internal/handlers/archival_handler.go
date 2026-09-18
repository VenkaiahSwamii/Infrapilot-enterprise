package handlers

import (
	"net/http"

	"infrapilot/backend/internal/archival"
	"infrapilot/backend/internal/database"

	"github.com/gin-gonic/gin"
)

// GetArchivalSettingsHandler returns the current cold storage AWS Lambda archival configuration
func GetArchivalSettingsHandler(c *gin.Context) {
	cfg := archival.LoadArchivalConfig()
	c.JSON(http.StatusOK, gin.H{
		"status":   "success",
		"archival": cfg,
	})
}

// TriggerArchivalRunHandler manually executes the cold storage upload process to AWS Lambda URL
func TriggerArchivalRunHandler(c *gin.Context) {
	if database.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	go func() {
		_ = archival.RunArchivalPipeline(database.DB)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "Cold storage archival export to AWS Lambda URL triggered asynchronously.",
		"status":  "processing",
	})
}
