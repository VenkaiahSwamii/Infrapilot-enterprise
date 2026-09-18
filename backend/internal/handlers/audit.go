package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

// GetAuditLogs returns audit log entries with optional pagination.
// Query parameters:
//   - limit: maximum number of records to return (default 100)
//   - offset: number of records to skip (default 0)
func GetAuditLogs(c *gin.Context) {
	// Parse pagination parameters
	limitStr := c.DefaultQuery("limit", "100")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 100
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	var logs []models.AuditLog
	result := database.DB.Order("created_at desc").Limit(limit).Offset(offset).Find(&logs)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, logs)
}

// GetEvents handles GET /api/v1/events?limit=100&search=ssh.service
func GetEvents(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "100")
	search := c.Query("search")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 100
	}

	type EventItem struct {
		ID        string `json:"id"`
		Type      string `json:"type"`
		Action    string `json:"action"`
		Machine   string `json:"machine_id"`
		Message   string `json:"message"`
		CreatedAt string `json:"created_at"`
	}

	events := make([]EventItem, 0)

	if database.DB != nil {
		var auditLogs []models.AuditLog
		query := database.DB.Order("created_at desc").Limit(limit)
		if search != "" {
			query = query.Where("action LIKE ? OR username LIKE ?", "%"+search+"%", "%"+search+"%")
		}
		if err := query.Find(&auditLogs).Error; err == nil {
			for _, a := range auditLogs {
				events = append(events, EventItem{
					ID:        a.ID.String(),
					Type:      "AUDIT_EVENT",
					Action:    a.Action,
					Machine:   a.MachineID.String(),
					Message:   a.Action,
					CreatedAt: a.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				})
			}
		}
	}

	c.JSON(http.StatusOK, events)
}

