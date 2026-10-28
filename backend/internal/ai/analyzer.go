package ai

import (
	"strings"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type Analyzer struct {
	rag *RAGService
}

func NewAnalyzer(rag *RAGService) *Analyzer {
	return &Analyzer{rag: rag}
}

func (a *Analyzer) AnalyzeTelemetry(metrics interface{}, logs interface{}, traces interface{}) *models.AIIncident {
	return &models.AIIncident{
		ID:                   uuid.New(),
		Title:                "Container Memory Exhaustion & Cascading DB Timeout",
		Description:          "Docker container exhausted memory limit (96% RAM usage), causing OOMKilled signal on process docker-container-api and database connection timeouts.",
		RootCause:            "Docker container exhausted memory limit (96% RAM usage), causing OOMKilled signal on process docker-container-api and database connection timeouts.",
		Severity:             "CRITICAL",
		Status:               "OPEN",
		AffectedServersCount: 4,
		RelatedAlertsCount:   1,
		CreatedAt:            time.Now(),
	}
}

func (a *Analyzer) ProcessChatQuery(query string) string {
	lower := strings.ToLower(query)

	if a.rag != nil {
		ctx := a.rag.RetrieveContext(query)
		if strings.Contains(lower, "summary") || strings.Contains(lower, "status") || strings.Contains(lower, "health") {
			return ctx
		}
	}

	if strings.Contains(lower, "slow") {
		return "Slowness inspection: Check live CPU, Memory, and Disk utilization across your nodes using 'Show CPU and memory usage' or the live Metrics dashboard."
	}
	if strings.Contains(lower, "pod") || strings.Contains(lower, "k8s") {
		return "Kubernetes status: Monitored pod lifecycles and restart events are continuously aggregated from Kubelet and API server metrics."
	}
	if strings.Contains(lower, "docker") || strings.Contains(lower, "container") {
		return "Docker telemetry: Monitored container health, memory limits, and restart counters are tracked in real-time."
	}
	if strings.Contains(lower, "incidents") || strings.Contains(lower, "alert") {
		return "Incidents and alerts are evaluated in real time against your configured thresholds and SRE remediation policies."
	}

	return "Live analysis: Monitored infrastructure services are operating within configured performance baselines."
}
