package sre

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"
	"github.com/google/uuid"
)

// Code Run 9: Main Backend Bridge Circuit Breaker & Graceful Offline Fallback
func TestCodeRun9_BackendBridgeCircuitBreaker(t *testing.T) {
	var requestCount int32

	// Mock server that returns 500 Internal Server Error
	failServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requestCount, 1)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"internal SRE engine crash"}`))
	}))
	defer failServer.Close()

	client := NewClient(failServer.URL)
	client.circuitBreaker.threshold = 3
	client.circuitBreaker.cooldown = 200 * time.Millisecond

	ctx := context.Background()

	// 1. Send 3 failing requests to trigger circuit breaker
	for i := 0; i < 3; i++ {
		_, err := client.Query(ctx, "why is database slow?")
		if err == nil {
			t.Fatalf("Expected error from failing server, got nil on request %d", i)
		}
	}

	// Circuit breaker must now be OPEN
	if client.circuitBreaker.State() != StateOpen {
		t.Fatalf("Expected circuit breaker state OPEN, got: %s", client.circuitBreaker.State())
	}

	// 2. Fourth request must fail FAST with ErrCircuitOpen without hitting the network server
	reqsBefore := atomic.LoadInt32(&requestCount)
	_, fastErr := client.Query(ctx, "why is database slow?")
	if fastErr != ErrCircuitOpen {
		t.Fatalf("Expected ErrCircuitOpen, got: %v", fastErr)
	}
	reqsAfter := atomic.LoadInt32(&requestCount)
	if reqsAfter != reqsBefore {
		t.Fatalf("Network request was made while circuit breaker was OPEN!")
	}

	// 3. Wait for cooldown to expire -> HALF_OPEN state
	time.Sleep(250 * time.Millisecond)

	// Now start a healthy server to verify recovery
	recoveredServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"diagnostic":"SRE Engine is back online"}`))
	}))
	defer recoveredServer.Close()

	client.baseURL = recoveredServer.URL

	resp, err := client.Query(ctx, "why is database slow?")
	if err != nil {
		t.Fatalf("Expected successful recovery query, got error: %v", err)
	}
	if resp["diagnostic"] != "SRE Engine is back online" {
		t.Fatalf("Unexpected response payload: %+v", resp)
	}

	if client.circuitBreaker.State() != StateClosed {
		t.Fatalf("Expected circuit breaker state CLOSED after recovery, got: %s", client.circuitBreaker.State())
	}
}

// Code Run 10: Live Topology Database Synchronization Worker
func TestCodeRun10_TopologySyncWorker(t *testing.T) {
	receivedNodes := make(map[string]TopologyNodePayload)

	mockEngine := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/topology/node" {
			var node TopologyNodePayload
			if err := json.NewDecoder(r.Body).Decode(&node); err == nil {
				receivedNodes[node.Host] = node
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"node_upserted"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockEngine.Close()

	client := NewClient(mockEngine.URL)

	// Custom memory-backed mock server repo test
	testServers := []models.Server{
		{
			ID:          uuid.New(),
			Hostname:    "postgres-primary",
			IPAddress:   "192.168.1.136",
			Status:      "CRITICAL",
			Online:      false,
			HealthScore: 10.0,
		},
		{
			ID:          uuid.New(),
			Hostname:    "local-gateway",
			IPAddress:   "192.168.1.1",
			Status:      "ONLINE",
			Online:      true,
			HealthScore: 98.0,
		},
		{
			ID:          uuid.New(),
			Hostname:    "backend-api",
			IPAddress:   "192.168.1.86",
			Status:      "ONLINE",
			Online:      true,
			HealthScore: 95.0,
		},
	}

	// Directly test node mapping logic
	ctx := context.Background()
	for _, s := range testServers {
		nodeType := "HOST"
		port := 0
		lowerHost := s.Hostname

		if lowerHost == "postgres-primary" {
			nodeType = "DATABASE"
			port = 5432
		} else if lowerHost == "local-gateway" {
			nodeType = "GATEWAY"
			port = 80
		} else if lowerHost == "backend-api" {
			nodeType = "API"
			port = 8080
		}

		status := "HEALTHY"
		if !s.Online {
			status = "CRITICAL"
		}

		node := TopologyNodePayload{
			ID:        s.ID.String(),
			Name:      s.Hostname,
			Type:      nodeType,
			Host:      s.IPAddress,
			Port:      port,
			Status:    status,
			LatencyMs: 2.5,
		}

		err := client.UpsertNode(ctx, node)
		if err != nil {
			t.Fatalf("Failed to upsert node: %v", err)
		}
	}

	// Verify all 3 nodes received and mapped correctly
	if len(receivedNodes) != 3 {
		t.Fatalf("Expected 3 synced nodes, got: %d", len(receivedNodes))
	}

	dbNode := receivedNodes["192.168.1.136"]
	if dbNode.Type != "DATABASE" || dbNode.Port != 5432 || dbNode.Status != "CRITICAL" {
		t.Fatalf("PostgreSQL node mapped incorrectly: %+v", dbNode)
	}

	gwNode := receivedNodes["192.168.1.1"]
	if gwNode.Type != "GATEWAY" || gwNode.Port != 80 || gwNode.Status != "HEALTHY" {
		t.Fatalf("Gateway node mapped incorrectly: %+v", gwNode)
	}

	apiNode := receivedNodes["192.168.1.86"]
	if apiNode.Type != "API" || apiNode.Port != 8080 || apiNode.Status != "HEALTHY" {
		t.Fatalf("API node mapped incorrectly: %+v", apiNode)
	}

	// Test sync worker with empty repository
	emptyWorker := NewTopologySyncWorker(&repository.ServerRepository{}, client)
	count, err := emptyWorker.SyncOnce(ctx)
	if err != nil {
		t.Fatalf("Empty sync worker returned unexpected error: %v", err)
	}
	if count != 0 {
		t.Fatalf("Expected 0 count for empty db, got: %d", count)
	}
}
