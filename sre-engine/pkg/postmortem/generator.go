package postmortem

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

type IncidentEvent struct {
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source"`
	Severity  string    `json:"severity"`
	Message   string    `json:"message"`
	Stage     string    `json:"stage"` // T0_TRIGGER, T1_ACKNOWLEDGE, T2_MITIGATE, T3_RESOLVE
}

type IncidentData struct {
	IncidentID          string          `json:"incident_id"`
	Title               string          `json:"title"`
	StartTime           time.Time       `json:"start_time"`
	EndTime             time.Time       `json:"end_time"`
	Severity            string          `json:"severity"`
	CulpritNode         string          `json:"culprit_node"`
	RootCausePath       []string        `json:"root_cause_path"`
	BlastRadiusServices []string        `json:"blast_radius_services"`
	ErrorBudgetBurnedPct float64        `json:"error_budget_burned_pct"`
	Events              []IncidentEvent `json:"events"`
}

type PostMortemReport struct {
	IncidentID            string          `json:"incident_id"`
	GeneratedAt           time.Time       `json:"generated_at"`
	Title                 string          `json:"title"`
	Severity              string          `json:"severity"`
	DurationMinutes       float64         `json:"duration_minutes"`
	TimeToDetectMin       float64         `json:"time_to_detect_min"`
	TimeToMitigateMin     float64         `json:"time_to_mitigate_min"`
	Timeline              []IncidentEvent `json:"timeline"`
	PreventionActionItems []string        `json:"prevention_action_items"`
	MarkdownDocument      string          `json:"markdown_document"`
}

// GeneratePostMortem builds deterministic chronological post-mortem analysis and markdown report
func GeneratePostMortem(data IncidentData, now time.Time) *PostMortemReport {
	// 1. Sort timeline events strictly by timestamp ascending
	sortedEvents := make([]IncidentEvent, len(data.Events))
	copy(sortedEvents, data.Events)

	sort.Slice(sortedEvents, func(i, j int) bool {
		return sortedEvents[i].Timestamp.Before(sortedEvents[j].Timestamp)
	})

	// 2. Compute timeline durations
	t0 := data.StartTime
	if len(sortedEvents) > 0 && (t0.IsZero() || sortedEvents[0].Timestamp.Before(t0)) {
		t0 = sortedEvents[0].Timestamp
	}

	tEnd := data.EndTime
	if len(sortedEvents) > 0 && (tEnd.IsZero() || sortedEvents[len(sortedEvents)-1].Timestamp.After(tEnd)) {
		tEnd = sortedEvents[len(sortedEvents)-1].Timestamp
	}

	durationMin := tEnd.Sub(t0).Minutes()
	if durationMin < 0 {
		durationMin = 0
	}

	ttdMin := 0.0
	ttmMin := durationMin

	for _, e := range sortedEvents {
		if e.Stage == "T1_ACKNOWLEDGE" && !t0.IsZero() {
			ttdMin = e.Timestamp.Sub(t0).Minutes()
		}
		if (e.Stage == "T2_MITIGATE" || e.Stage == "T3_RESOLVE") && !t0.IsZero() {
			ttmMin = e.Timestamp.Sub(t0).Minutes()
		}
	}

	if ttdMin < 0 {
		ttdMin = 0
	}
	if ttmMin < 0 {
		ttmMin = 0
	}

	// 3. Deterministic Prevention Items based on failure signature
	actionItems := generateActionItems(data)

	// 4. Build Markdown Document
	mdDoc := formatMarkdown(data, sortedEvents, durationMin, ttdMin, ttmMin, actionItems, now)

	return &PostMortemReport{
		IncidentID:            data.IncidentID,
		GeneratedAt:           now,
		Title:                 data.Title,
		Severity:              data.Severity,
		DurationMinutes:       round1(durationMin),
		TimeToDetectMin:       round1(ttdMin),
		TimeToMitigateMin:     round1(ttmMin),
		Timeline:              sortedEvents,
		PreventionActionItems: actionItems,
		MarkdownDocument:      mdDoc,
	}
}

func generateActionItems(data IncidentData) []string {
	var items []string
	culpritLower := strings.ToLower(data.CulpritNode)

	if strings.Contains(culpritLower, "postgres") || strings.Contains(culpritLower, "db") || strings.Contains(culpritLower, "database") {
		items = append(items, "Configure PgBouncer / Connection Pool size alerts to prevent thread starvation.")
		items = append(items, "Implement automated read-replica fallback routing for read-heavy API traffic.")
	} else if strings.Contains(culpritLower, "gateway") || strings.Contains(culpritLower, "router") {
		items = append(items, "Enable synthetic health probes with sub-second ICMP ping and packet loss thresholds.")
	} else {
		items = append(items, "Tune rate-limiting thresholds and add circuit breakers on upstream HTTP handlers.")
	}

	items = append(items, "Audit configuration snapshot drifts via automated CI/CD deployment checks.")
	items = append(items, fmt.Sprintf("Review error budget consumption (%0.1f%% burned) in next SRE sprint retro.", data.ErrorBudgetBurnedPct))
	return items
}

func formatMarkdown(data IncidentData, events []IncidentEvent, dur, ttd, ttm float64, actions []string, now time.Time) string {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("# Incident Post-Mortem: %s\n\n", escapeMd(data.Title)))
	b.WriteString(fmt.Sprintf("**Incident ID:** `%s` | **Severity:** `%s` | **Generated:** `%s`\n\n",
		data.IncidentID, data.Severity, now.UTC().Format(time.RFC3339)))

	b.WriteString("## Executive Summary\n")
	b.WriteString(fmt.Sprintf("- **Total Incident Duration:** %0.1f minutes\n", dur))
	b.WriteString(fmt.Sprintf("- **Time-to-Detect (TTD):** %0.1f minutes\n", ttd))
	b.WriteString(fmt.Sprintf("- **Time-to-Mitigate (TTM):** %0.1f minutes\n", ttm))
	b.WriteString(fmt.Sprintf("- **Error Budget Burned:** %0.1f%%\n", data.ErrorBudgetBurnedPct))
	b.WriteString(fmt.Sprintf("- **Isolated Root Cause:** %s\n\n", escapeMd(data.CulpritNode)))

	b.WriteString("## Root Cause & Blast Radius\n")
	if len(data.RootCausePath) > 0 {
		b.WriteString(fmt.Sprintf("- **Propagation Path:** %s\n", strings.Join(data.RootCausePath, " -> ")))
	}
	if len(data.BlastRadiusServices) > 0 {
		b.WriteString(fmt.Sprintf("- **Impacted Services (%d):**\n", len(data.BlastRadiusServices)))
		for _, s := range data.BlastRadiusServices {
			b.WriteString(fmt.Sprintf("  - %s\n", escapeMd(s)))
		}
	}
	b.WriteString("\n")

	b.WriteString("## Chronological Timeline\n\n")
	b.WriteString("| Timestamp (UTC) | Stage | Source | Severity | Description |\n")
	b.WriteString("| :--- | :--- | :--- | :--- | :--- |\n")
	for _, e := range events {
		stage := e.Stage
		if stage == "" {
			stage = "EVENT"
		}
		b.WriteString(fmt.Sprintf("| %s | `%s` | %s | `%s` | %s |\n",
			e.Timestamp.UTC().Format("15:04:05"), stage, escapeMd(e.Source), e.Severity, escapeMd(e.Message)))
	}
	b.WriteString("\n")

	b.WriteString("## Actionable Prevention Checklist\n")
	for i, act := range actions {
		b.WriteString(fmt.Sprintf("%d. [ ] %s\n", i+1, escapeMd(act)))
	}

	return b.String()
}

func escapeMd(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	return strings.TrimSpace(s)
}

func round1(val float64) float64 {
	return float64(int(val*10)) / 10
}
