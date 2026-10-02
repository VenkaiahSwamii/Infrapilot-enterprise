package synthetic

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

func (h *Handler) GetAllTests(c *gin.Context) {
	tests, err := h.service.GetAllTests()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tests": tests, "total": len(tests)})
}

func (h *Handler) CreateTest(c *gin.Context) {
	var input struct {
		Name                    string  `json:"name" binding:"required"`
		URL                     string  `json:"url" binding:"required"`
		Method                  string  `json:"method"`
		Headers                 string  `json:"headers"`
		Body                    string  `json:"body"`
		ExpectedStatus          int     `json:"expected_status"`
		ResponseTimeThresholdMs float64 `json:"response_time_threshold_ms"`
		TimeoutMs               int     `json:"timeout_ms"`
		IntervalSeconds         int     `json:"interval_seconds"`
		ValidationContains      string  `json:"validation_contains"`
		Enabled                 *bool   `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ValidateURL(input.URL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	enabledVal := true
	if input.Enabled != nil {
		enabledVal = *input.Enabled
	}

	test := &models.SyntheticTest{
		ID:                      uuid.New(),
		Name:                    strings.TrimSpace(input.Name),
		URL:                     strings.TrimSpace(input.URL),
		Method:                  strings.ToUpper(strings.TrimSpace(input.Method)),
		Headers:                 input.Headers,
		Body:                    input.Body,
		ExpectedStatus:          input.ExpectedStatus,
		ResponseTimeThresholdMs: input.ResponseTimeThresholdMs,
		TimeoutMs:               input.TimeoutMs,
		IntervalSeconds:         input.IntervalSeconds,
		ValidationContains:      strings.TrimSpace(input.ValidationContains),
		Enabled:                 enabledVal,
	}

	if err := h.service.CreateTest(test); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Trigger immediate initial probe check
	go h.service.ExecuteAndRecordTest(test)

	c.JSON(http.StatusCreated, test)
}

func (h *Handler) GetTestByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid synthetic test ID UUID format"})
		return
	}

	test, err := h.service.GetTestByID(id)
	if err != nil || test == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "synthetic test not found"})
		return
	}

	c.JSON(http.StatusOK, test)
}

func (h *Handler) UpdateTest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid synthetic test ID UUID format"})
		return
	}

	existing, err := h.service.GetTestByID(id)
	if err != nil || existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "synthetic test not found"})
		return
	}

	var input struct {
		Name                    string   `json:"name"`
		URL                     string   `json:"url"`
		Method                  string   `json:"method"`
		Headers                 string   `json:"headers"`
		Body                    string   `json:"body"`
		ExpectedStatus          int      `json:"expected_status"`
		ResponseTimeThresholdMs float64  `json:"response_time_threshold_ms"`
		TimeoutMs               int      `json:"timeout_ms"`
		IntervalSeconds         int      `json:"interval_seconds"`
		ValidationContains      string   `json:"validation_contains"`
		Enabled                 *bool    `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.URL != "" {
		if err := ValidateURL(input.URL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		existing.URL = input.URL
	}

	if input.Name != "" {
		existing.Name = input.Name
	}
	if input.Method != "" {
		existing.Method = strings.ToUpper(input.Method)
	}
	if input.Headers != "" {
		existing.Headers = input.Headers
	}
	if input.Body != "" {
		existing.Body = input.Body
	}
	if input.ExpectedStatus > 0 {
		existing.ExpectedStatus = input.ExpectedStatus
	}
	if input.ResponseTimeThresholdMs > 0 {
		existing.ResponseTimeThresholdMs = input.ResponseTimeThresholdMs
	}
	if input.TimeoutMs > 0 {
		existing.TimeoutMs = input.TimeoutMs
	}
	if input.IntervalSeconds > 0 {
		existing.IntervalSeconds = input.IntervalSeconds
	}
	if input.ValidationContains != "" {
		existing.ValidationContains = input.ValidationContains
	}
	if input.Enabled != nil {
		existing.Enabled = *input.Enabled
	}

	if err := h.service.UpdateTest(existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}

func (h *Handler) DeleteTest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid synthetic test ID UUID format"})
		return
	}

	if err := h.service.DeleteTest(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "synthetic test deleted successfully"})
}

func (h *Handler) RunTestNow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid synthetic test ID UUID format"})
		return
	}

	res, err := h.service.RunTestNow(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

func (h *Handler) GetTestResults(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid synthetic test ID UUID format"})
		return
	}

	timeRange := c.Query("time_range")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	results, err := h.service.GetTestResults(id, timeRange, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"results": results, "total": len(results)})
}
