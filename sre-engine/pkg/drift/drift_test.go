package drift

import (
	"testing"
	"time"

	"infrapilot/sre-engine/pkg/optimizer"
)

// Code Run 5: Configuration Drift Deep Recursive Diff Engine
func TestCodeRun5_ConfigDriftDeepDiff(t *testing.T) {
	now := time.Now()

	goldenBaseline := ConfigSnapshot{
		Host:      "192.168.1.136",
		Component: "PostgreSQL Database",
		Timestamp: now.Add(-48 * time.Hour),
		Parameters: map[string]interface{}{
			"port":            5432,
			"max_connections": 100,
			"shared_buffers":  "4GB",
			"read_replica":    "192.168.1.137",
			"ssl_mode":        "require",
		},
	}

	// Current state has:
	// - max_connections changed from 100 to 20 (MODIFIED - CRITICAL)
	// - read_replica missing (REMOVED - WARNING)
	// - unauthorized_debug_mode added (ADDED - WARNING)
	// - port: "5432" string representation (EQUAL - no false positive)
	currentState := ConfigSnapshot{
		Host:      "192.168.1.136",
		Component: "PostgreSQL Database",
		Timestamp: now,
		Parameters: map[string]interface{}{
			"port":                    "5432", // Type coercion
			"max_connections":         20,     // Reduced connection pool causing timeouts!
			"shared_buffers":          "4GB",
			"ssl_mode":                "require",
			"unauthorized_debug_mode": true,
		},
	}

	report := DeepDiff(goldenBaseline, currentState)

	if !report.HasDrift {
		t.Fatalf("Expected drift detected, got false")
	}

	if report.DriftCount != 3 {
		t.Fatalf("Expected 3 drifts (1 modified, 1 removed, 1 added), got: %d", report.DriftCount)
	}

	// Verify severity classification on max_connections
	var maxConnItem *DriftItem
	for i := range report.Drifts {
		if report.Drifts[i].Key == "max_connections" {
			maxConnItem = &report.Drifts[i]
			break
		}
	}

	if maxConnItem == nil || maxConnItem.Severity != "CRITICAL" {
		t.Fatalf("Expected max_connections to be flagged CRITICAL, got: %+v", maxConnItem)
	}

	// Identical configuration test
	cleanReport := DeepDiff(goldenBaseline, goldenBaseline)
	if cleanReport.HasDrift || cleanReport.DriftCount != 0 {
		t.Fatalf("Identical configurations produced drift: %+v", cleanReport)
	}
}

// Code Run 6: Configuration Drift Cryptographic Hashing & Root Cause Weighting
func TestCodeRun6_ConfigDriftHashAndCorrelation(t *testing.T) {
	// Deterministic hashing test: Map key insertion order independence
	mapA := map[string]interface{}{
		"alpha": "one",
		"beta":  2,
		"gamma": true,
	}
	mapB := map[string]interface{}{
		"gamma": true,
		"alpha": "one",
		"beta":  2,
	}

	hashA := ComputeHash(mapA)
	hashB := ComputeHash(mapB)

	if hashA != hashB {
		t.Fatalf("Hashes should be identical regardless of map order.\nHashA: %s\nHashB: %s", hashA, hashB)
	}

	// Correlation with diagnostic candidates
	driftRep := &DriftReport{
		Host:       "192.168.1.136",
		Component:  "PostgreSQL",
		HasDrift:   true,
		DriftCount: 2,
	}

	candidates := []*optimizer.DiagnosticCandidate{
		{
			ID:          "c-postgres",
			Title:       "Connection pool starvation on 192.168.1.136",
			Description: "Backend cannot acquire connection",
			RawScore:    100.0,
		},
		{
			ID:          "c-unrelated",
			Title:       "High CPU on frontend 192.168.1.86",
			Description: "UI rendering load",
			RawScore:    80.0,
		},
	}

	correlated := CorrelateDriftWithCandidates(driftRep, candidates)

	// c-postgres must receive 1.5x score boost (100 -> 150)
	if correlated[0].RawScore != 150.0 {
		t.Fatalf("Expected score boost to 150.0, got: %f", correlated[0].RawScore)
	}

	if correlated[0].Metadata["config_drift_detected"] != true {
		t.Fatalf("Expected config_drift_detected flag in metadata")
	}

	// c-unrelated must remain unchanged (80.0)
	if correlated[1].RawScore != 80.0 {
		t.Fatalf("Unrelated candidate score modified: %f", correlated[1].RawScore)
	}
}
