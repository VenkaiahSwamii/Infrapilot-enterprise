package handlers

import (
	"net/http"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AlertRuleHandler struct {
	service *services.AlertRuleService
}

func NewAlertRuleHandler() *AlertRuleHandler {
	return &AlertRuleHandler{
		service: services.NewAlertRuleService(),
	}
}

// ListRules handles GET /alert-rules or GET /organizations/:orgId/alert-rules
func (h *AlertRuleHandler) ListRules(c *gin.Context) {
	orgID := c.Param("orgId")
	rules, err := h.service.ListRules(orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load alert rules"})
		return
	}
	// If no rules found for specific org param, fallback to all rules
	if len(rules) == 0 && orgID != "" && orgID != "all" {
		fallback, fallbackErr := h.service.ListRules("")
		if fallbackErr == nil && len(fallback) > 0 {
			c.JSON(http.StatusOK, fallback)
			return
		}
	}
	c.JSON(http.StatusOK, rules)
}

// GetRule handles GET /alert-rules/:id or GET /organizations/:orgId/alert-rules/:id
func (h *AlertRuleHandler) GetRule(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		id = c.Param("ruleId")
	}

	ruleID, err := uuid.Parse(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	rule, err := h.service.GetRule(ruleID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert rule not found"})
		return
	}

	c.JSON(http.StatusOK, rule)
}

// CreateRule handles POST /alert-rules or POST /organizations/:orgId/alert-rules
func (h *AlertRuleHandler) CreateRule(c *gin.Context) {
	orgID := c.Param("orgId")

	var req services.CreateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.OrganizationID == "" {
		if orgID != "" {
			req.OrganizationID = orgID
		} else {
			req.OrganizationID = "default"
		}
	}

	if req.Threshold == 0 && req.Value != 0 {
		req.Threshold = req.Value
	}

	rule, err := h.service.CreateRule(req)
	if err != nil {
		switch err {
		case services.ErrInvalidMetric, services.ErrInvalidOperator, services.ErrInvalidSeverity:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case services.ErrDuplicateName:
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusCreated, rule)
}

// UpdateRule handles PATCH /alert-rules/:id or PATCH /organizations/:orgId/alert-rules/:id
func (h *AlertRuleHandler) UpdateRule(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		id = c.Param("ruleId")
	}

	ruleID, err := uuid.Parse(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	var req services.UpdateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Threshold == 0 && req.Value != 0 {
		req.Threshold = req.Value
	}

	rule, err := h.service.UpdateRule(ruleID, req)
	if err != nil {
		switch err {
		case services.ErrRuleNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case services.ErrInvalidMetric, services.ErrInvalidOperator, services.ErrInvalidSeverity:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case services.ErrDuplicateName:
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, rule)
}

// DeleteRule handles DELETE /alert-rules/:id or DELETE /organizations/:orgId/alert-rules/:id
func (h *AlertRuleHandler) DeleteRule(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		id = c.Param("ruleId")
	}

	ruleID, err := uuid.Parse(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	if err := h.service.DeleteRule(ruleID); err != nil {
		if err == services.ErrRuleNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "alert rule deleted successfully"})
}

// ToggleRule handles PATCH /alert-rules/:id/toggle or PATCH /organizations/:orgId/alert-rules/:id/toggle
func (h *AlertRuleHandler) ToggleRule(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		id = c.Param("ruleId")
	}

	ruleID, err := uuid.Parse(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}

	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	targetEnabled := true
	if req.Enabled != nil {
		targetEnabled = *req.Enabled
	}

	var rule *models.AlertRule
	if targetEnabled {
		rule, err = h.service.EnableRule(ruleID)
	} else {
		rule, err = h.service.DisableRule(ruleID)
	}

	if err != nil {
		if err == services.ErrRuleNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, rule)
}

// SeedPresets handles POST /alert-rules/presets or POST /organizations/:orgId/alert-rules/presets
func (h *AlertRuleHandler) SeedPresets(c *gin.Context) {
	orgID := c.Param("orgId")
	if orgID == "" {
		orgID = "default"
	}

	created, err := h.service.SeedPresets(orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to seed alert rule presets"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Alert rule presets loaded successfully",
		"created": created,
	})
}
