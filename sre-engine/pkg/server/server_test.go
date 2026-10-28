package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"infrapilot/sre-engine/pkg/drift"
	"infrapilot/sre-engine/pkg/optimizer"
	"infrapilot/sre-engine/pkg/postmortem"
	"infrapilot/sre-engine/pkg/sre"
	"infrapilot/sre-engine/pkg/timetravel"
	"infrapilot/sre-engine/pkg/topology"
)

func setupTestServer() (*Server, *topology.DependencyGraph) {
	graph := topology.NewDependencyGraph()

	// Seed real architecture nodes
	db := &topology.Node{
		ID:        "node-postgres",
		Name:      "PostgreSQL Database",
		Type:      topology.TypeDatabase,
		Host:      "192.168.1.136",
		Port:      5432,
		Status:    "CRITICAL",
		LatencyMs: 820.0,
	}
	api := &topology.Node{
		ID:        "node-backend",
		Name:      "InfraPilot Core Backend",
		Type:      topology.TypeAPI,
		Host:      "192.168.1.86",
		Port:      8080,
		Status:    "DEGRADED",
		LatencyMs: 350.0,
	}
	frontend := &topology.Node{
		ID:        "node-frontend",
		Name:      "Frontend Portal",
		Type:      topology.TypeWeb,
		Host:      "192.168.1.86",
		Port:      3000,
		Status:    "DEGRADED",
		LatencyMs: 120.0,
	}

	graph.AddNode(db)
	graph.AddNode(api)
	graph.AddNode(frontend)

	graph.AddDependency("node-frontend", "node-backend")
	graph.AddDependency("node-backend", "node-postgres")

	srv := NewServer(graph)
	return srv, graph
}

// Code Check 9: Concurrent Thread-Safety and Race Condition Defense
func TestServer_ConcurrentRaceDefense(t *testing.T) {
	srv, _ := setupTestServer()

	var wg sync.WaitGroup
	workers := 50
	iterations := 10

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				// Concurrent writes
				if workerID%2 == 0 {
					payload, _ := json.Marshal(topology.Node{
						ID:        fmt.Sprintf("worker-node-%d", workerID),
						Name:      fmt.Sprintf("Dynamic Worker %d", workerID),
						Host:      "192.168.1.86",
						Port:      9000 + workerID,
						Status:    "HEALTHY",
						LatencyMs: float64(j * 10),
					})
					req, _ := http.NewRequest("POST", "/api/v1/topology/node", bytes.NewBuffer(payload))
					req.Header.Set("Content-Type", "application/json")
					rec := httptest.NewRecorder()
					srv.Router().ServeHTTP(rec, req)
					if rec.Code != http.StatusOK {
						t.Errorf("Concurrent node upsert returned status: %d", rec.Code)
					}
				} else {
					// Concurrent query reads
					payload, _ := json.Marshal(QueryRequest{
						Query: "is postgres slow on 192.168.1.136:5432",
					})
					req, _ := http.NewRequest("POST", "/api/v1/query", bytes.NewBuffer(payload))
					req.Header.Set("Content-Type", "application/json")
					rec := httptest.NewRecorder()
					srv.Router().ServeHTTP(rec, req)
					if rec.Code != http.StatusOK {
						t.Errorf("Concurrent query returned status: %d", rec.Code)
					}
				}
			}
		}(i)
	}

	wg.Wait()
}

// Code Check 10: End-to-End API Integration & Error Recovery
func TestServer_Endpoints(t *testing.T) {
	srv, _ := setupTestServer()

	// 1. Health check
	req, _ := http.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected health 200, got %d", rec.Code)
	}

	// 2. Query endpoint: Root cause isolation across dependencies
	queryPayload, _ := json.Marshal(QueryRequest{
		Query: "why is frontend degraded on 192.168.1.86:3000?",
	})
	req, _ = http.NewRequest("POST", "/api/v1/query", bytes.NewBuffer(queryPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected query 200, got %d", rec.Code)
	}

	var qResp QueryResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &qResp); err != nil {
		t.Fatalf("Failed to unmarshal QueryResponse: %v", err)
	}

	if qResp.MatchedNode == nil || qResp.MatchedNode.ID != "node-frontend" {
		t.Fatalf("Expected matched node 'node-frontend', got: %+v", qResp.MatchedNode)
	}

	if qResp.RootCause == nil || qResp.RootCause.RootNodeID != "node-postgres" {
		t.Fatalf("Expected root cause to be isolated to 'node-postgres', got: %+v", qResp.RootCause)
	}

	// 3. Bad Payload Defense: Empty or invalid JSON
	badReq, _ := http.NewRequest("POST", "/api/v1/query", bytes.NewBuffer([]byte("{invalid-json")))
	badReq.Header.Set("Content-Type", "application/json")
	badRec := httptest.NewRecorder()
	srv.Router().ServeHTTP(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for malformed json, got %d", badRec.Code)
	}

	// 4. Rank Candidates
	now := time.Now()
	rankPayload, _ := json.Marshal(RankRequest{
		Candidates: []*optimizer.DiagnosticCandidate{
			{ID: "c1", Severity: "CRITICAL", Depth: 0, Timestamp: now, Frequency: 10},
			{ID: "c2", Severity: "WARNING", Depth: 2, Timestamp: now, Frequency: 1},
		},
	})
	req, _ = http.NewRequest("POST", "/api/v1/rank", bytes.NewBuffer(rankPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected rank 200, got %d", rec.Code)
	}

	// 5. Cluster Logs
	clusterPayload, _ := json.Marshal(ClusterRequest{
		Logs: []optimizer.LogEntry{
			{Level: "ERROR", Message: "Timeout connecting to 192.168.1.136:5432"},
			{Level: "ERROR", Message: "Timeout connecting to 192.168.1.136:5432"},
		},
	})
	req, _ = http.NewRequest("POST", "/api/v1/cluster", bytes.NewBuffer(clusterPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected cluster 200, got %d", rec.Code)
	}

	// 6. Time Travel Endpoint
	ttPayload, _ := json.Marshal(TimeTravelRequest{
		Metric: "latency_ms",
		CurrentPoints: []timetravel.MetricDataPoint{
			{Timestamp: now, Value: 80.0},
		},
		BaselinePoints: []timetravel.MetricDataPoint{
			{Timestamp: now.Add(-1 * time.Hour), Value: 20.0},
		},
	})
	req, _ = http.NewRequest("POST", "/api/v1/time-travel", bytes.NewBuffer(ttPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected time-travel 200, got %d", rec.Code)
	}

	// 7. SLO Evaluate Endpoint
	sloPayload, _ := json.Marshal(SLORequest{
		Config:        sre.SLOConfig{TargetSLO: 0.999, WindowHours: 1.0, PeriodHours: 720.0},
		TotalRequests: 10000,
		GoodRequests:  9950,
	})
	req, _ = http.NewRequest("POST", "/api/v1/slo/evaluate", bytes.NewBuffer(sloPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected slo evaluate 200, got %d", rec.Code)
	}

	// 8. Drift Compare Endpoint
	driftPayload, _ := json.Marshal(DriftRequest{
		Baseline: drift.ConfigSnapshot{Host: "192.168.1.136", Parameters: map[string]interface{}{"port": 5432}},
		Current:  drift.ConfigSnapshot{Host: "192.168.1.136", Parameters: map[string]interface{}{"port": 5433}},
	})
	req, _ = http.NewRequest("POST", "/api/v1/drift/compare", bytes.NewBuffer(driftPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected drift compare 200, got %d", rec.Code)
	}

	// 9. PostMortem Generate Endpoint
	pmPayload, _ := json.Marshal(PostMortemRequest{
		Incident: postmortem.IncidentData{
			IncidentID:  "INC-1",
			Title:       "Test Outage",
			Severity:    "P1",
			CulpritNode: "PostgreSQL Database",
		},
	})
	req, _ = http.NewRequest("POST", "/api/v1/postmortem/generate", bytes.NewBuffer(pmPayload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	srv.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected postmortem generate 200, got %d", rec.Code)
	}
}

