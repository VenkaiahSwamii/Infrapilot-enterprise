package server

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"infrapilot/sre-engine/pkg/drift"
	"infrapilot/sre-engine/pkg/optimizer"
	"infrapilot/sre-engine/pkg/parser"
	"infrapilot/sre-engine/pkg/postmortem"
	"infrapilot/sre-engine/pkg/sre"
	"infrapilot/sre-engine/pkg/timetravel"
	"infrapilot/sre-engine/pkg/topology"
)

type Server struct {
	router *gin.Engine
	graph  *topology.DependencyGraph
}

type QueryRequest struct {
	Query string `json:"query" binding:"required"`
}

type QueryResponse struct {
	OriginalQuery     string                     `json:"original_query"`
	Intent            parser.DiagnosticIntent    `json:"intent"`
	Metric            string                     `json:"metric,omitempty"`
	TargetHost        string                     `json:"target_host,omitempty"`
	TargetPort        int                        `json:"target_port,omitempty"`
	TargetAlias       string                     `json:"target_alias,omitempty"`
	StartTime         time.Time                  `json:"start_time"`
	EndTime           time.Time                  `json:"end_time"`
	BaselineStart     *time.Time                 `json:"baseline_start,omitempty"`
	BaselineEnd       *time.Time                 `json:"baseline_end,omitempty"`
	MatchedNode       *topology.Node             `json:"matched_node,omitempty"`
	RootCause         *topology.RootCauseReport  `json:"root_cause,omitempty"`
	BlastRadius       *topology.BlastRadiusResult`json:"blast_radius,omitempty"`
	Diagnostic        string                     `json:"diagnostic"`
	RecommendedVisual string                     `json:"recommended_visual"`
}

func NewServer(graph *topology.DependencyGraph) *Server {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// Simple CORS middleware for local frontend connectivity
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	s := &Server{
		router: r,
		graph:  graph,
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.GET("/health", s.handleHealth)

	api := s.router.Group("/api/v1")
	{
		api.POST("/query", s.handleQuery)
		api.GET("/topology", s.handleGetTopology)
		api.POST("/topology/node", s.handleAddNode)
		api.POST("/topology/dependency", s.handleAddDependency)
		api.POST("/rank", s.handleRankCandidates)
		api.POST("/cluster", s.handleClusterLogs)

		// Advanced SRE Modules
		api.POST("/time-travel", s.handleTimeTravel)
		api.POST("/slo/evaluate", s.handleSLOEvaluate)
		api.POST("/drift/compare", s.handleDriftCompare)
		api.POST("/postmortem/generate", s.handlePostMortemGenerate)
	}
}

func (s *Server) Router() *gin.Engine {
	return s.router
}

func (s *Server) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "infrapilot-sre-engine",
		"version": "1.0.0",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleQuery(c *gin.Context) {
	var req QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing or invalid query parameter"})
		return
	}

	// Match entity against topology graph
	allNodes := s.graph.GetAllNodes()
	candidates := make([]parser.NodeCandidate, 0, len(allNodes))
	for _, n := range allNodes {
		candidates = append(candidates, parser.NodeCandidate{
			ID:   n.ID,
			Name: n.Name,
			Host: n.Host,
			Port: n.Port,
			Type: string(n.Type),
		})
	}

	parsed := parser.ParseWithCandidates(req.Query, time.Now(), candidates)

	resp := QueryResponse{
		OriginalQuery: req.Query,
		Intent:        parsed.Intent,
		Metric:        parsed.Metric,
		TargetHost:    parsed.TargetHost,
		TargetPort:    parsed.TargetPort,
		TargetAlias:   parsed.TargetAlias,
		StartTime:     parsed.StartTime,
		EndTime:       parsed.EndTime,
		BaselineStart: parsed.BaselineStart,
		BaselineEnd:   parsed.BaselineEnd,
	}

	if parsed.Intent == parser.IntentAgents {
		var agentNodes []*topology.Node
		for _, n := range allNodes {
			if n.Type == topology.TypeHost || strings.Contains(strings.ToLower(n.Name), "agent") || strings.Contains(strings.ToLower(n.ID), "srv-") {
				agentNodes = append(agentNodes, n)
			}
		}

		if len(agentNodes) > 0 {
			var details []string
			for _, a := range agentNodes {
				details = append(details, fmt.Sprintf("• 🟢 Host **%s** (IP: `%s`, Status: %s, Latency: %0.1fms)", a.Name, a.Host, a.Status, a.LatencyMs))
			}
			resp.Diagnostic = fmt.Sprintf("You currently have %d agent host(s) actively running:\n\n%s", len(agentNodes), strings.Join(details, "\n"))
			resp.MatchedNode = agentNodes[0]
		} else {
			resp.Diagnostic = "No agent hosts are currently registered in the topology graph. Enrolled agents will appear here automatically."
		}
		resp.RecommendedVisual = "Render interactive Digital Twin DAG topology with all connected systems."
	} else if parsed.Intent == parser.IntentHelp {
		rootCausePrompt := "• 🔍 **Root Cause**: Ask *'why is database slow?'*"
		if len(allNodes) > 0 {
			rootCausePrompt = fmt.Sprintf("• 🔍 **Root Cause**: Ask *'why is %s slow?'*", strings.ToLower(allNodes[0].Name))
		}
		resp.Diagnostic = fmt.Sprintf("I didn't quite understand your query: \"%s\".\n\n"+
			"As your Zero-AI SRE Copilot, I can diagnose:\n"+
			"• 🖥️ **Agents & Systems**: Ask *'where my agents are running'* or *'all systems'*\n"+
			"• 💥 **Blast Radius**: Ask *'what is the blast radius if database fails?'*\n"+
			"%s\n"+
			"• ⏱️ **Time Comparison**: Ask *'compare latency today with yesterday'*\n\n"+
			"Could you please clarify what you would like to investigate?", req.Query, rootCausePrompt)
		resp.RecommendedVisual = "Render interactive Digital Twin DAG topology."
	} else if parsed.Intent == parser.IntentInventory || strings.Contains(strings.ToLower(req.Query), "how many") || strings.Contains(strings.ToLower(req.Query), "connected") || strings.Contains(strings.ToLower(req.Query), "inventory") || strings.Contains(strings.ToLower(req.Query), "all systems") {
		var namesWithPorts []string
		healthyCount := 0
		for _, n := range allNodes {
			namesWithPorts = append(namesWithPorts, fmt.Sprintf("%s (%d)", n.Name, n.Port))
			if n.Status == "HEALTHY" {
				healthyCount++
			}
		}
		if healthyCount == len(allNodes) {
			resp.Diagnostic = fmt.Sprintf("There are %d connected systems: %s (all %d are currently healthy).",
				len(allNodes), strings.Join(namesWithPorts, ", "), healthyCount)
		} else {
			resp.Diagnostic = fmt.Sprintf("There are %d connected systems: %s (%d healthy, %d degraded/critical).",
				len(allNodes), strings.Join(namesWithPorts, ", "), healthyCount, len(allNodes)-healthyCount)
		}
		resp.RecommendedVisual = "Render interactive Digital Twin DAG topology with all connected systems."
	} else {
		var matchedNode *topology.Node
		for _, n := range allNodes {
			if parsed.TargetHost != "" && n.Host == parsed.TargetHost {
				if parsed.TargetPort == 0 || n.Port == parsed.TargetPort {
					matchedNode = n
					break
				}
			}
			if parsed.TargetAlias != "" && (strings.EqualFold(n.Name, parsed.TargetAlias) || strings.EqualFold(n.ID, parsed.TargetAlias)) {
				matchedNode = n
				break
			}
		}

		if matchedNode != nil {
			resp.MatchedNode = matchedNode
			resp.RootCause = s.graph.TraceRootCause(matchedNode.ID)
			resp.BlastRadius = s.graph.CalculateBlastRadius(matchedNode.ID)

			switch parsed.Intent {
			case parser.IntentBlastRadius:
				if resp.BlastRadius != nil && len(resp.BlastRadius.ImpactedServices) > 0 {
					resp.Diagnostic = fmt.Sprintf("If %s fails, %d services will break: %s.",
						matchedNode.Name, resp.BlastRadius.TotalImpacted, strings.Join(resp.BlastRadius.ImpactedServices, ", "))
				} else {
					resp.Diagnostic = fmt.Sprintf("%s is a leaf service. If it fails, 0 downstream services are impacted.", matchedNode.Name)
				}
			case parser.IntentTimeCompare:
				resp.Diagnostic = fmt.Sprintf("Performance comparison for %s: current latency is %0.1fms (status: %s).",
					matchedNode.Name, matchedNode.LatencyMs, matchedNode.Status)
			case parser.IntentRootCauseTrace:
				if resp.RootCause != nil && resp.RootCause.RootNodeID != matchedNode.ID {
					resp.Diagnostic = fmt.Sprintf("Issue detected on %s: root cause is originating upstream in %s (%s:%d).",
						matchedNode.Name, resp.RootCause.RootNodeName, resp.RootCause.RootHost, resp.RootCause.RootPort)
				} else if matchedNode.Status != "HEALTHY" {
					resp.Diagnostic = fmt.Sprintf("Alert: %s is currently %s with %0.1fms latency.",
						matchedNode.Name, matchedNode.Status, matchedNode.LatencyMs)
				} else {
					resp.Diagnostic = fmt.Sprintf("All clear: %s is healthy and operating normally (%0.1fms latency).",
						matchedNode.Name, matchedNode.LatencyMs)
				}
			default:
				if matchedNode.Status == "HEALTHY" {
					resp.Diagnostic = fmt.Sprintf("All clear: %s is healthy and operating normally (%0.1fms latency).",
						matchedNode.Name, matchedNode.LatencyMs)
				} else {
					resp.Diagnostic = fmt.Sprintf("Notice: %s status is %s with %0.1fms latency.",
						matchedNode.Name, matchedNode.Status, matchedNode.LatencyMs)
				}
			}
		} else {
			if len(allNodes) > 0 {
				var activeList []string
				for _, n := range allNodes {
					activeList = append(activeList, fmt.Sprintf("• **%s** (`%s:%d`)", n.Name, n.Host, n.Port))
				}
				resp.Diagnostic = fmt.Sprintf("I couldn't identify which specific system you want to inspect in \"%s\".\n\n"+
					"Available systems in topology (%d total):\n%s\n\n"+
					"Please specify one of these systems, for example: 'why is %s slow?'",
					req.Query, len(allNodes), strings.Join(activeList, "\n"), allNodes[0].Name)
			} else {
				resp.Diagnostic = "No systems or agents are currently registered in your infrastructure. Please enroll an agent first."
			}
		}
	}

	switch parsed.Intent {
	case parser.IntentTimeCompare:
		if parsed.BaselineStart != nil && parsed.BaselineEnd != nil {
			resp.RecommendedVisual = fmt.Sprintf("Render dual-series time travel overlay comparing [%s - %s] against baseline [%s - %s].",
				parsed.StartTime.Format("15:04"), parsed.EndTime.Format("15:04"),
				parsed.BaselineStart.Format("15:04"), parsed.BaselineEnd.Format("15:04"))
		} else {
			resp.RecommendedVisual = "Render dual-series time travel overlay comparing current window against baseline."
		}
	case parser.IntentBlastRadius:
		resp.RecommendedVisual = "Render interactive Directed Acyclic Graph (DAG) with downstream blast radius impact highlighted in red."
	case parser.IntentRootCauseTrace:
		resp.RecommendedVisual = "Render dependency cascade tree leading to isolated root cause node."
	default:
		resp.RecommendedVisual = "Render standard metric timeseries chart."
	}

	c.JSON(http.StatusOK, resp)
}

func (s *Server) handleGetTopology(c *gin.Context) {
	nodes := s.graph.GetAllNodes()
	c.JSON(http.StatusOK, gin.H{
		"nodes": nodes,
		"count": len(nodes),
	})
}

func (s *Server) handleAddNode(c *gin.Context) {
	var node topology.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	s.graph.AddNode(&node)
	c.JSON(http.StatusOK, gin.H{"status": "node_upserted", "id": node.ID})
}

type DependencyRequest struct {
	ConsumerID   string `json:"consumer_id" binding:"required"`
	DependencyID string `json:"dependency_id" binding:"required"`
}

func (s *Server) handleAddDependency(c *gin.Context) {
	var req DependencyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	s.graph.AddDependency(req.ConsumerID, req.DependencyID)
	c.JSON(http.StatusOK, gin.H{"status": "dependency_added", "consumer": req.ConsumerID, "dependency": req.DependencyID})
}

type RankRequest struct {
	Candidates []*optimizer.DiagnosticCandidate `json:"candidates" binding:"required"`
}

func (s *Server) handleRankCandidates(c *gin.Context) {
	var req RankRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ranked := optimizer.RankCandidates(req.Candidates, time.Now())
	c.JSON(http.StatusOK, gin.H{
		"ranked_candidates": ranked,
		"count":             len(ranked),
	})
}

type ClusterRequest struct {
	Logs []optimizer.LogEntry `json:"logs" binding:"required"`
}

func (s *Server) handleClusterLogs(c *gin.Context) {
	var req ClusterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patterns := optimizer.ClusterLogs(req.Logs)
	c.JSON(http.StatusOK, gin.H{
		"patterns": patterns,
		"count":    len(patterns),
	})
}

// Time Travel Handler
type TimeTravelRequest struct {
	Metric         string                       `json:"metric" binding:"required"`
	CurrentPoints  []timetravel.MetricDataPoint `json:"current_points"`
	CurrentStart   time.Time                    `json:"current_start"`
	CurrentEnd     time.Time                    `json:"current_end"`
	BaselinePoints []timetravel.MetricDataPoint `json:"baseline_points"`
	BaselineStart  time.Time                    `json:"baseline_start"`
	BaselineEnd    time.Time                    `json:"baseline_end"`
}

func (s *Server) handleTimeTravel(c *gin.Context) {
	var req TimeTravelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	delta := timetravel.CompareWindows(req.Metric, req.CurrentPoints, req.CurrentStart, req.CurrentEnd,
		req.BaselinePoints, req.BaselineStart, req.BaselineEnd)
	c.JSON(http.StatusOK, delta)
}

// Google SRE SLO Handler
type SLORequest struct {
	Config        sre.SLOConfig `json:"config"`
	TotalRequests int64         `json:"total_requests"`
	GoodRequests  int64         `json:"good_requests"`
}

func (s *Server) handleSLOEvaluate(c *gin.Context) {
	var req SLORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result := sre.EvaluateSLO(req.Config, req.TotalRequests, req.GoodRequests, time.Now())
	c.JSON(http.StatusOK, result)
}

// Configuration Drift Handler
type DriftRequest struct {
	Baseline drift.ConfigSnapshot `json:"baseline" binding:"required"`
	Current  drift.ConfigSnapshot `json:"current" binding:"required"`
}

func (s *Server) handleDriftCompare(c *gin.Context) {
	var req DriftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	report := drift.DeepDiff(req.Baseline, req.Current)
	c.JSON(http.StatusOK, report)
}

// Incident Post-Mortem Handler
type PostMortemRequest struct {
	Incident postmortem.IncidentData `json:"incident" binding:"required"`
}

func (s *Server) handlePostMortemGenerate(c *gin.Context) {
	var req PostMortemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	report := postmortem.GeneratePostMortem(req.Incident, time.Now())
	c.JSON(http.StatusOK, report)
}
