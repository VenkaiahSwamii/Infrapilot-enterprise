package topology

import (
	"testing"
)

// Code Check 4: Dynamic Graph Synchronization Test
func TestDependencyGraph_AddAndSync(t *testing.T) {
	g := NewDependencyGraph()

	db := &Node{
		ID:        "db-1",
		Name:      "PostgreSQL Primary",
		Type:      TypeDatabase,
		Host:      "192.168.1.136",
		Port:      5432,
		Status:    "HEALTHY",
		LatencyMs: 1.2,
	}
	api := &Node{
		ID:        "api-1",
		Name:      "Core API Gateway",
		Type:      TypeAPI,
		Host:      "192.168.1.86",
		Port:      5000,
		Status:    "HEALTHY",
		LatencyMs: 4.5,
	}

	g.AddNode(db)
	g.AddNode(api)
	g.AddDependency("api-1", "db-1") // api depends on db

	retrievedDb := g.GetNode("db-1")
	if retrievedDb == nil || retrievedDb.Name != "PostgreSQL Primary" {
		t.Fatalf("Failed to retrieve node db-1: %+v", retrievedDb)
	}

	retrievedApi := g.GetNode("api-1")
	if len(retrievedApi.Upstream) != 1 || retrievedApi.Upstream[0] != "db-1" {
		t.Fatalf("Expected api-1 upstream to contain db-1, got: %v", retrievedApi.Upstream)
	}

	if len(retrievedDb.Downstream) != 1 || retrievedDb.Downstream[0] != "api-1" {
		t.Fatalf("Expected db-1 downstream to contain api-1, got: %v", retrievedDb.Downstream)
	}

	// Update node status & latency (Sync test)
	g.AddNode(&Node{
		ID:        "db-1",
		Status:    "CRITICAL",
		LatencyMs: 980.5,
	})

	updatedDb := g.GetNode("db-1")
	if updatedDb.Status != "CRITICAL" || updatedDb.LatencyMs != 980.5 {
		t.Fatalf("Failed to update status dynamically: %+v", updatedDb)
	}
}

// Code Check 5: Circular Dependency Loop Defense (A -> B -> C -> A)
func TestDependencyGraph_CircularLoopDefense(t *testing.T) {
	g := NewDependencyGraph()

	nodeA := &Node{ID: "node-A", Name: "Service A", Status: "CRITICAL", Host: "192.168.1.10", Port: 8001}
	nodeB := &Node{ID: "node-B", Name: "Service B", Status: "CRITICAL", Host: "192.168.1.11", Port: 8002}
	nodeC := &Node{ID: "node-C", Name: "Service C", Status: "CRITICAL", Host: "192.168.1.12", Port: 8003}

	g.AddNode(nodeA)
	g.AddNode(nodeB)
	g.AddNode(nodeC)

	// Create circular ring: A depends on B, B depends on C, C depends on A
	g.AddDependency("node-A", "node-B")
	g.AddDependency("node-B", "node-C")
	g.AddDependency("node-C", "node-A")

	// Must terminate cleanly without infinite loop or stack overflow
	report := g.TraceRootCause("node-A")
	if report == nil {
		t.Fatalf("Expected report, got nil")
	}

	if report.HopDistance > 10 {
		t.Fatalf("Hop distance exceeded safe limit of 10: got %d", report.HopDistance)
	}

	if len(report.Path) == 0 {
		t.Fatalf("Expected non-empty path")
	}
}

// Code Check 6: Upstream vs Downstream Root Cause Isolation & Blast Radius Cascade
func TestDependencyGraph_RootCauseAndBlastRadius(t *testing.T) {
	g := NewDependencyGraph()

	// Topology:
	// db (CRITICAL) <- api (DEGRADED) <- web (DEGRADED)
	// db also <- analytics (DEGRADED)
	db := &Node{ID: "db", Name: "Postgres DB", Type: TypeDatabase, Host: "192.168.1.136", Port: 5432, Status: "CRITICAL"}
	api := &Node{ID: "api", Name: "API Gateway", Type: TypeAPI, Host: "192.168.1.86", Port: 5000, Status: "DEGRADED"}
	web := &Node{ID: "web", Name: "Frontend Web", Type: TypeWeb, Host: "192.168.1.86", Port: 3000, Status: "DEGRADED"}
	analytics := &Node{ID: "analytics", Name: "Analytics Worker", Type: TypeAPI, Host: "192.168.1.86", Port: 9000, Status: "DEGRADED"}

	g.AddNode(db)
	g.AddNode(api)
	g.AddNode(web)
	g.AddNode(analytics)

	g.AddDependency("web", "api")
	g.AddDependency("api", "db")
	g.AddDependency("analytics", "db")

	// 1. Trace Root Cause from 'web'
	rc := g.TraceRootCause("web")
	if rc == nil {
		t.Fatalf("Expected root cause report")
	}
	if rc.RootNodeID != "db" {
		t.Fatalf("Expected root cause to be 'db', got: %s", rc.RootNodeID)
	}
	if rc.HopDistance != 2 {
		t.Fatalf("Expected hop distance 2 (web -> api -> db), got: %d", rc.HopDistance)
	}

	// 2. Blast Radius from 'db'
	br := g.CalculateBlastRadius("db")
	if br == nil {
		t.Fatalf("Expected blast radius result")
	}
	if br.TotalImpacted != 3 {
		t.Fatalf("Expected 3 impacted services (api, web, analytics), got: %d (%v)", br.TotalImpacted, br.ImpactedServices)
	}
	if br.Severity != "CRITICAL" {
		t.Fatalf("Expected CRITICAL severity for >=2 impacted, got: %s", br.Severity)
	}

	// 3. Blast Radius for leaf 'web'
	brWeb := g.CalculateBlastRadius("web")
	if brWeb.TotalImpacted != 0 {
		t.Fatalf("Expected 0 impacted downstream for leaf 'web', got: %d", brWeb.TotalImpacted)
	}
}
