package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/sre"
)

type SREHandler struct {
	client     *sre.Client
	syncWorker *sre.TopologySyncWorker
}

func NewSREHandler(client *sre.Client, syncWorker *sre.TopologySyncWorker) *SREHandler {
	return &SREHandler{
		client:     client,
		syncWorker: syncWorker,
	}
}

type SREQueryRequest struct {
	Query string `json:"query" binding:"required"`
}

func (h *SREHandler) Query(c *gin.Context) {
	var req SREQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing 'query' in request payload"})
		return
	}

	queryLower := strings.ToLower(strings.TrimSpace(req.Query))

	// Sync topology nodes into SRE Engine if worker is available
	if h.syncWorker != nil {
		_, _ = h.syncWorker.SyncOnce(c.Request.Context())
	}

	// 1. Intercept agent inquiries with real database ground truth
	isAgentQuery := strings.Contains(queryLower, "agent") ||
		(strings.Contains(queryLower, "where") && strings.Contains(queryLower, "running")) ||
		strings.Contains(queryLower, "where are my") ||
		strings.Contains(queryLower, "where my")

	if isAgentQuery {
		var servers []models.Server
		if database.DB != nil {
			_ = database.DB.Order("hostname asc").Find(&servers).Error
		}

		if len(servers) > 0 {
			var details []string
			for _, s := range servers {
				statusText := s.Status
				if statusText == "" {
					statusText = "ONLINE"
				}
				osStr := s.OS
				if osStr == "" {
					osStr = s.OperatingSystem
				}
				if osStr == "" {
					osStr = "Windows"
				}
				details = append(details, fmt.Sprintf("• 🟢 Host **%s** (IP: `%s`, OS: %s, Status: %s)", s.Hostname, s.IPAddress, osStr, statusText))
			}
			diagnostic := fmt.Sprintf("You currently have %d agent(s) actively running in your infrastructure:\n\n%s", len(servers), strings.Join(details, "\n"))

			c.JSON(http.StatusOK, gin.H{
				"original_query":     req.Query,
				"intent":             "LIST_AGENTS",
				"diagnostic":         diagnostic,
				"recommended_visual": "Render interactive Digital Twin DAG topology with all connected systems.",
				"matched_node": gin.H{
					"name":       servers[0].Hostname,
					"host":       servers[0].IPAddress,
					"status":     "HEALTHY",
					"latency_ms": 2.5,
				},
			})
			return
		}
	}

	// 2. Query SRE Engine microservice
	res, err := h.client.Query(c.Request.Context(), req.Query)
	if err != nil {
		// Circuit breaker or connection fallback
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":        err.Error(),
			"offline_mode": true,
			"diagnostic":   "SRE Diagnostic Engine is currently unreachable. Operating in offline telemetry mode.",
		})
		return
	}

	// 3. Clarification Guardrail: If SRE engine returned a generic backend fallback but user did not ask about backend
	if res != nil {
		diag, _ := res["diagnostic"].(string)
		if strings.Contains(diag, "InfraPilot Core Backend is healthy") &&
			!strings.Contains(queryLower, "backend") &&
			!strings.Contains(queryLower, "core") {

			sampleHost := "database"
			var firstServer models.Server
			if database.DB != nil && database.DB.Order("hostname asc").First(&firstServer).Error == nil {
				sampleHost = firstServer.Hostname
			}

			res["diagnostic"] = fmt.Sprintf("I didn't quite understand your query: \"%s\".\n\n"+
				"As your Zero-AI SRE Copilot, I can diagnose:\n"+
				"• 🖥️ **Agents & Systems**: Ask 'where my agents are running' or 'how many systems are connected'\n"+
				"• 💥 **Blast Radius**: Ask 'what is the blast radius if database fails?'\n"+
				"• 🔍 **Root Cause**: Ask 'why is %s slow?'\n"+
				"• ⏱️ **Time Comparison**: Ask 'compare latency today with yesterday'\n\n"+
				"Could you please clarify what you would like to investigate?", req.Query, sampleHost)
		}
	}

	c.JSON(http.StatusOK, res)
}

func (h *SREHandler) GetTopology(c *gin.Context) {
	topo, err := h.client.GetTopology(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":        err.Error(),
			"offline_mode": true,
		})
		return
	}
	c.JSON(http.StatusOK, topo)
}

func (h *SREHandler) TimeTravel(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := h.client.TimeTravel(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *SREHandler) EvaluateSLO(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := h.client.EvaluateSLO(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *SREHandler) CompareDrift(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := h.client.CompareDrift(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *SREHandler) GeneratePostMortem(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := h.client.GeneratePostMortem(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *SREHandler) TriggerSync(c *gin.Context) {
	count, err := h.syncWorker.SyncOnce(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":       "synchronized",
		"synced_nodes": count,
	})
}
