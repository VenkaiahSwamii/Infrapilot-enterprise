package parser

import (
	"testing"
	"time"
)

func TestCodeCheck1_TimeParsingAndBoundaryDefense(t *testing.T) {
	refTime := time.Date(2026, 10, 24, 14, 0, 0, 0, time.UTC)

	t.Run("Relative time: last 15m", func(t *testing.T) {
		p := Parse("show latency on 192.168.1.86 last 15m", refTime)
		diff := p.EndTime.Sub(p.StartTime)
		if diff != 15*time.Minute {
			t.Fatalf("Expected 15m span, got: %v", diff)
		}
	})

	t.Run("Relative time: last 2h", func(t *testing.T) {
		p := Parse("cpu usage last 2h", refTime)
		diff := p.EndTime.Sub(p.StartTime)
		if diff != 2*time.Hour {
			t.Fatalf("Expected 2h span, got: %v", diff)
		}
	})

	t.Run("Explicit window: 10:00 to 10:30", func(t *testing.T) {
		p := Parse("latency between 10:00 and 10:30", refTime)
		if p.StartTime.Hour() != 10 || p.StartTime.Minute() != 0 {
			t.Errorf("Expected StartTime 10:00, got: %v", p.StartTime)
		}
		if p.EndTime.Hour() != 10 || p.EndTime.Minute() != 30 {
			t.Errorf("Expected EndTime 10:30, got: %v", p.EndTime)
		}
	})

	t.Run("Inverted boundary auto-swap: 10:30 to 10:00", func(t *testing.T) {
		p := Parse("graph between 10:30 to 10:00", refTime)
		if p.StartTime.After(p.EndTime) {
			t.Fatalf("StartTime %v should not be after EndTime %v", p.StartTime, p.EndTime)
		}
		if p.StartTime.Hour() != 10 || p.StartTime.Minute() != 0 {
			t.Errorf("Expected auto-swapped StartTime 10:00, got %v", p.StartTime)
		}
	})

	t.Run("Day rollover across midnight: 11:45 pm to 12:15 am", func(t *testing.T) {
		p := Parse("latency from 11:45 pm to 12:15 am", refTime)
		if p.StartTime.After(p.EndTime) {
			t.Fatalf("Midnight rollover failed: StartTime %v after EndTime %v", p.StartTime, p.EndTime)
		}
		diff := p.EndTime.Sub(p.StartTime)
		if diff != 30*time.Minute {
			t.Fatalf("Expected 30m rollover span, got: %v", diff)
		}
	})
}

func TestCodeCheck2_TargetEntityAndPortResolution(t *testing.T) {
	refTime := time.Date(2026, 10, 24, 14, 0, 0, 0, time.UTC)
	mockCandidates := []NodeCandidate{
		{ID: "node-backend", Name: "InfraPilot Backend", Host: "192.168.1.86", Port: 8080},
		{ID: "node-db", Name: "PostgreSQL Database", Host: "192.168.1.136", Port: 5432},
		{ID: "node-gw", Name: "Local WiFi Gateway", Host: "192.168.1.1", Port: 80},
		{ID: "node-ssa", Name: "SSA (Agent Host)", Host: "192.168.1.35", Port: 0},
	}

	t.Run("Shorthand partial IP: check 86", func(t *testing.T) {
		p := ParseWithCandidates("check latency on 86", refTime, mockCandidates)
		if p.TargetHost != "192.168.1.86" {
			t.Errorf("Expected 192.168.1.86, got %s", p.TargetHost)
		}
	})

	t.Run("Shorthand DB partial IP: 136", func(t *testing.T) {
		p := ParseWithCandidates("why is 136 slow", refTime, mockCandidates)
		if p.TargetHost != "192.168.1.136" {
			t.Errorf("Expected 192.168.1.136, got %s", p.TargetHost)
		}
		if p.TargetPort != 5432 {
			t.Errorf("Expected port 5432, got %d", p.TargetPort)
		}
	})

	t.Run("Port shorthand: port 5432", func(t *testing.T) {
		p := ParseWithCandidates("check status on port 5432", refTime, mockCandidates)
		if p.TargetPort != 5432 {
			t.Errorf("Expected port 5432, got %d", p.TargetPort)
		}
		if p.TargetHost != "192.168.1.136" {
			t.Errorf("Expected auto-resolved host 192.168.1.136, got %s", p.TargetHost)
		}
	})

	t.Run("Alias: gateway", func(t *testing.T) {
		p := ParseWithCandidates("ping gateway", refTime, mockCandidates)
		if p.TargetHost != "192.168.1.1" {
			t.Errorf("Expected 192.168.1.1, got %s", p.TargetHost)
		}
	})

	t.Run("Dynamic Agent: SSA", func(t *testing.T) {
		p := ParseWithCandidates("where my agents are running", refTime, mockCandidates)
		if p.Intent != IntentAgents {
			t.Errorf("Expected IntentAgents, got %s", p.Intent)
		}
	})
}

func TestCodeCheck3_IntentClassificationAndAmbiguity(t *testing.T) {
	refTime := time.Date(2026, 10, 24, 14, 0, 0, 0, time.UTC)

	t.Run("Intent: Blast Radius", func(t *testing.T) {
		p := Parse("what is the blast radius if database crashes?", refTime)
		if p.Intent != IntentBlastRadius {
			t.Errorf("Expected IntentBlastRadius, got %s", p.Intent)
		}
	})

	t.Run("Intent: Time Travel Compare", func(t *testing.T) {
		p := Parse("compare performance today with yesterday", refTime)
		if p.Intent != IntentTimeCompare {
			t.Errorf("Expected IntentTimeCompare, got %s", p.Intent)
		}
		if p.BaselineStart == nil || p.BaselineEnd == nil {
			t.Fatalf("Expected baseline timestamps for comparison")
		}
	})

	t.Run("Intent: Root Cause Trace", func(t *testing.T) {
		p := Parse("why did port 5432 fail at 10am?", refTime)
		if p.Intent != IntentRootCauseTrace {
			t.Errorf("Expected IntentRootCauseTrace, got %s", p.Intent)
		}
	})

	t.Run("Intent: Inventory and System Count", func(t *testing.T) {
		p := Parse("how many systems are connected", refTime)
		if p.Intent != IntentInventory {
			t.Errorf("Expected IntentInventory, got %s", p.Intent)
		}
		if p.TargetHost != "" {
			t.Errorf("Expected empty TargetHost for global inventory query, got %s", p.TargetHost)
		}
	})

	t.Run("Empty or help fallback", func(t *testing.T) {
		p := Parse("help", refTime)
		if p.Intent != IntentHelp {
			t.Errorf("Expected IntentHelp, got %s", p.Intent)
		}
	})
}
