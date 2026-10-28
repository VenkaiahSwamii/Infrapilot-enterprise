package postmortem

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// Code Run 7: Incident Post-Mortem Chronological Timeline Sequencing
func TestCodeRun7_PostMortemTimelineSequencing(t *testing.T) {
	now := time.Now()
	t0 := now.Add(-30 * time.Minute)
	t1 := now.Add(-25 * time.Minute)
	t2 := now.Add(-10 * time.Minute)
	t3 := now

	// Pass events in reverse/jumbled order
	events := []IncidentEvent{
		{
			Timestamp: t2,
			Source:    "sre-agent",
			Severity:  "INFO",
			Message:   "Connection pool limits increased to 200",
			Stage:     "T2_MITIGATE",
		},
		{
			Timestamp: t0,
			Source:    "postgres-monitor",
			Severity:  "CRITICAL",
			Message:   "Fatal: remaining connection slots are reserved for non-replication superuser",
			Stage:     "T0_TRIGGER",
		},
		{
			Timestamp: t3,
			Source:    "api-gateway",
			Severity:  "INFO",
			Message:   "All 502 Bad Gateway errors resolved",
			Stage:     "T3_RESOLVE",
		},
		{
			Timestamp: t1,
			Source:    "pagerduty",
			Severity:  "WARNING",
			Message:   "Primary SRE acknowledged incident",
			Stage:     "T1_ACKNOWLEDGE",
		},
	}

	data := IncidentData{
		IncidentID:          "INC-8092",
		Title:               "PostgreSQL Connection Pool Exhaustion Outage",
		StartTime:           t0,
		EndTime:             t3,
		Severity:            "P1_CRITICAL",
		CulpritNode:         "PostgreSQL Database (192.168.1.136:5432)",
		RootCausePath:       []string{"Frontend (192.168.1.86:3000)", "Backend (192.168.1.86:8080)", "Postgres (192.168.1.136:5432)"},
		BlastRadiusServices: []string{"InfraPilot Backend", "Core API Gateway", "Frontend Portal"},
		ErrorBudgetBurnedPct: 18.5,
		Events:              events,
	}

	report := GeneratePostMortem(data, now)

	// Timeline must be sorted chronologically
	if report.Timeline[0].Stage != "T0_TRIGGER" {
		t.Fatalf("Expected first event to be T0_TRIGGER, got: %s", report.Timeline[0].Stage)
	}
	if report.Timeline[len(report.Timeline)-1].Stage != "T3_RESOLVE" {
		t.Fatalf("Expected last event to be T3_RESOLVE, got: %s", report.Timeline[len(report.Timeline)-1].Stage)
	}

	// Duration metrics verification
	if report.DurationMinutes < 29.0 || report.DurationMinutes > 31.0 {
		t.Fatalf("Expected ~30 minutes total duration, got: %f", report.DurationMinutes)
	}
	if report.TimeToDetectMin < 4.0 || report.TimeToDetectMin > 6.0 {
		t.Fatalf("Expected ~5 minutes TTD, got: %f", report.TimeToDetectMin)
	}
	if report.TimeToMitigateMin < 19.0 || report.TimeToMitigateMin > 31.0 {
		t.Fatalf("Expected ~20-30 minutes TTM, got: %f", report.TimeToMitigateMin)
	}
}

// Code Run 8: Incident Post-Mortem Report Generation & Markdown/JSON Format Compliance
func TestCodeRun8_PostMortemReportGeneration(t *testing.T) {
	now := time.Now()
	t0 := now.Add(-15 * time.Minute)

	data := IncidentData{
		IncidentID:          "INC-9912",
		Title:               "API Gateway Latency Spike | Table test",
		StartTime:           t0,
		EndTime:             now,
		Severity:            "P2_HIGH",
		CulpritNode:         "Core API Gateway (192.168.1.86:5000)",
		RootCausePath:       []string{"Frontend", "Core API Gateway"},
		BlastRadiusServices: []string{"Frontend Web Portal"},
		ErrorBudgetBurnedPct: 4.2,
		Events: []IncidentEvent{
			{
				Timestamp: t0,
				Source:    "metrics-poller",
				Severity:  "WARNING",
				Message:   "HTTP 504 Gateway Timeout count | rate spiked to 120/sec",
				Stage:     "T0_TRIGGER",
			},
		},
	}

	report := GeneratePostMortem(data, now)

	// 1. Verify JSON serializability
	jsonData, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("Failed to marshal post-mortem report to JSON: %v", err)
	}
	if len(jsonData) == 0 {
		t.Fatalf("JSON output is empty")
	}

	// 2. Verify Markdown document elements
	md := report.MarkdownDocument
	if !strings.Contains(md, "# Incident Post-Mortem: API Gateway Latency Spike \\| Table test") {
		t.Fatalf("Markdown missing escaped title: %s", md)
	}
	if !strings.Contains(md, "Core API Gateway (192.168.1.86:5000)") {
		t.Fatalf("Markdown missing culprit node: %s", md)
	}
	if !strings.Contains(md, "HTTP 504 Gateway Timeout count \\| rate spiked to 120/sec") {
		t.Fatalf("Markdown missing pipe-escaped timeline message: %s", md)
	}
	if len(report.PreventionActionItems) == 0 {
		t.Fatalf("Expected prevention action items to be generated")
	}
}
