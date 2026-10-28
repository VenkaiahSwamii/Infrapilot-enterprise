package optimizer

import (
	"fmt"
	"math"
	"testing"
	"time"
)

// Code Check 7: Multi-factor Mathematical Candidate Ranking Test
func TestRankCandidates(t *testing.T) {
	now := time.Now()

	candidates := []*DiagnosticCandidate{
		{
			ID:          "c1",
			Title:       "Postgres connection pool exhausted",
			Severity:    "CRITICAL",
			Timestamp:   now.Add(-5 * time.Minute),
			Depth:       0, // Root cause
			Frequency:   25,
		},
		{
			ID:          "c2",
			Title:       "API Gateway 502 Bad Gateway",
			Severity:    "ERROR",
			Timestamp:   now.Add(-4 * time.Minute),
			Depth:       1, // 1 hop downstream
			Frequency:   15,
		},
		{
			ID:          "c3",
			Title:       "Frontend slow HTTP response",
			Severity:    "WARNING",
			Timestamp:   now.Add(-2 * time.Minute),
			Depth:       2, // 2 hops downstream
			Frequency:   10,
		},
		{
			ID:          "c4",
			Title:       "Old disk space warning from last week",
			Severity:    "CRITICAL",
			Timestamp:   now.Add(-168 * time.Hour), // 7 days ago
			Depth:       0,
			Frequency:   1,
		},
	}

	ranked := RankCandidates(candidates, now)

	// Top candidate MUST be c1 (Root cause + CRITICAL + Recent)
	if ranked[0].ID != "c1" {
		t.Fatalf("Expected top candidate to be c1, got %s (Score: %f)", ranked[0].ID, ranked[0].RawScore)
	}

	// c1 normalized score must be 1.0 (highest confidence)
	if ranked[0].NormalizedScore != 1.0 {
		t.Fatalf("Expected normalized score 1.0 for top candidate, got %f", ranked[0].NormalizedScore)
	}

	// c4 (7 days old) must rank lower than c1, c2, c3 due to recency decay
	if ranked[len(ranked)-1].ID != "c4" {
		t.Fatalf("Expected lowest candidate to be c4 due to recency decay, got %s", ranked[len(ranked)-1].ID)
	}

	// Verify all normalized scores are strictly in [0.0, 1.0]
	for _, c := range ranked {
		if c.NormalizedScore < 0.0 || c.NormalizedScore > 1.0 {
			t.Fatalf("Candidate %s normalized score %f out of bounds [0.0, 1.0]", c.ID, c.NormalizedScore)
		}
		if math.IsNaN(c.RawScore) || math.IsInf(c.RawScore, 0) {
			t.Fatalf("Candidate %s has invalid score %f", c.ID, c.RawScore)
		}
	}
}

// Edge case defense test for RankCandidates
func TestRankCandidates_EdgeCases(t *testing.T) {
	now := time.Now()

	// 1. Empty slice
	empty := RankCandidates([]*DiagnosticCandidate{}, now)
	if len(empty) != 0 {
		t.Fatalf("Expected empty slice")
	}

	// 2. Future timestamp (clock drift) & negative depth
	driftCandidate := []*DiagnosticCandidate{
		{
			ID:        "future-1",
			Severity:  "CRITICAL",
			Timestamp: now.Add(2 * time.Hour), // Future clock drift
			Depth:     -5,                     // Negative depth
			Frequency: -10,                    // Negative frequency
		},
	}

	driftRanked := RankCandidates(driftCandidate, now)
	if math.IsNaN(driftRanked[0].RawScore) || math.IsInf(driftRanked[0].RawScore, 0) {
		t.Fatalf("Clock drift produced NaN or Inf score: %f", driftRanked[0].RawScore)
	}
	if driftRanked[0].NormalizedScore != 1.0 {
		t.Fatalf("Expected normalized score 1.0 for single candidate, got %f", driftRanked[0].NormalizedScore)
	}
}

// Code Check 8: High-Volume Log Deduplication & Pattern Clustering Test
func TestClusterLogs_HighVolumeDeduplication(t *testing.T) {
	var logs []LogEntry
	now := time.Now()

	// Generate 1,000 synthetic database timeout logs with dynamic IPs, ports, UUIDs, and numbers
	for i := 0; i < 1000; i++ {
		logs = append(logs, LogEntry{
			Timestamp: now.Add(time.Duration(-i) * time.Second),
			Level:     "ERROR",
			Message:   fmt.Sprintf("Connection failed to 192.168.1.%d:5432 after %d ms for query id 550e8400-e29b-41d4-a716-%012d", i%20, 2500+i, i),
			Source:    "api-gateway",
			Host:      "192.168.1.86",
		})
	}

	// Generate 50 distinct normal info logs
	for i := 0; i < 50; i++ {
		logs = append(logs, LogEntry{
			Timestamp: now.Add(time.Duration(-i) * time.Second),
			Level:     "INFO",
			Message:   fmt.Sprintf("User session %d authenticated successfully from 10.0.0.%d", i, i%5),
			Source:    "auth-service",
			Host:      "192.168.1.86",
		})
	}

	// Cluster the 1,050 logs
	clusters := ClusterLogs(logs)

	// All 1,000 ERROR logs should collapse into exactly 1 pattern!
	if len(clusters) < 2 {
		t.Fatalf("Expected at least 2 pattern clusters (ERROR and INFO), got: %d", len(clusters))
	}

	topCluster := clusters[0]
	if topCluster.Count != 1000 {
		t.Fatalf("Expected top cluster count 1000, got: %d", topCluster.Count)
	}

	// Pattern signature must mask dynamic variables
	expectedTemplate := "[ERROR] Connection failed to <IP> after <NUM> ms for query id <UUID>"
	if topCluster.PatternSignature != expectedTemplate {
		t.Fatalf("Pattern signature mismatch.\nExpected: %s\nGot:      %s", expectedTemplate, topCluster.PatternSignature)
	}

	// High frequency error spike must be flagged as Anomaly
	if !topCluster.IsAnomaly {
		t.Fatalf("Expected high-frequency error cluster to be flagged as Anomaly")
	}

	// Second cluster should be INFO logs
	infoCluster := clusters[1]
	if infoCluster.Count != 50 {
		t.Fatalf("Expected second cluster count 50, got: %d", infoCluster.Count)
	}
	if infoCluster.IsAnomaly {
		t.Fatalf("INFO cluster should not be flagged as anomaly")
	}
}
