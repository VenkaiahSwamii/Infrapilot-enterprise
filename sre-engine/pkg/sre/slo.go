package sre

import (
	"fmt"
	"math"
	"time"
)

type SLOConfig struct {
	Name         string        `json:"name"`
	TargetSLO    float64       `json:"target_slo"` // e.g. 0.999 for 99.9%
	PeriodHours  float64       `json:"period_hours"` // Typically 720 hours (30 days)
	WindowHours  float64       `json:"window_hours"` // Duration of evaluation window (e.g. 1h, 6h)
}

type SLIResult struct {
	Config              SLOConfig `json:"config"`
	EvaluatedAt         time.Time `json:"evaluated_at"`
	TotalRequests       int64     `json:"total_requests"`
	GoodRequests        int64     `json:"good_requests"`
	BadRequests         int64     `json:"bad_requests"`
	ActualSLI           float64   `json:"actual_sli"`
	AllowedErrorRate    float64   `json:"allowed_error_rate"`
	ActualErrorRate     float64   `json:"actual_error_rate"`
	BurnRate            float64   `json:"burn_rate"`
	BudgetConsumedPct   float64   `json:"budget_consumed_pct"`
	RemainingBudgetPct  float64   `json:"remaining_budget_pct"`
	TimeToExhaustHours  float64   `json:"time_to_exhaust_hours"` // -1 means infinite / not burning
	AlertLevel          string    `json:"alert_level"` // PAGE_P1_CRITICAL, PAGE_P2_HIGH, TICKET_P3_MEDIUM, HEALTHY_P4_LOW
	Recommendation      string    `json:"recommendation"`
}

// EvaluateSLO deterministically computes Google SRE Error Budget and Burn Rate
func EvaluateSLO(cfg SLOConfig, totalReqs, goodReqs int64, now time.Time) *SLIResult {
	if cfg.TargetSLO <= 0.0 || cfg.TargetSLO >= 1.0 {
		cfg.TargetSLO = 0.999 // Default to 99.9%
	}
	if cfg.PeriodHours <= 0 {
		cfg.PeriodHours = 720.0 // Default 30 days
	}
	if cfg.WindowHours <= 0 {
		cfg.WindowHours = 1.0 // Default 1 hour
	}

	badReqs := totalReqs - goodReqs
	if badReqs < 0 {
		badReqs = 0
	}

	allowedErrorRate := 1.0 - cfg.TargetSLO
	actualErrorRate := 0.0
	actualSLI := 1.0

	// Boundary defense: Zero total requests
	if totalReqs > 0 {
		actualErrorRate = float64(badReqs) / float64(totalReqs)
		actualSLI = float64(goodReqs) / float64(totalReqs)
	}

	// Burn Rate Calculation
	burnRate := 0.0
	if allowedErrorRate > 0 && totalReqs > 0 {
		burnRate = actualErrorRate / allowedErrorRate
	}

	// Upper bound safety clamp to avoid overflow
	if burnRate > 10000.0 {
		burnRate = 10000.0
	}

	// Budget consumed in this evaluation window
	budgetConsumedPct := 0.0
	if cfg.PeriodHours > 0 {
		budgetConsumedPct = (burnRate * cfg.WindowHours / cfg.PeriodHours) * 100.0
	}
	if budgetConsumedPct > 100.0 {
		budgetConsumedPct = 100.0
	}

	remainingBudgetPct := math.Max(0.0, 100.0-budgetConsumedPct)

	// Time to exhaustion in hours at current burn rate
	timeToExhaust := -1.0
	if burnRate > 0.001 {
		timeToExhaust = (remainingBudgetPct / 100.0) * (cfg.PeriodHours / burnRate)
	}

	// Google SRE Multi-Burn-Rate Alert Levels
	alertLevel := "HEALTHY_P4_LOW"
	recommendation := "SLO is healthy. Error budget consumption is within expected parameters."

	switch {
	case burnRate >= 14.4:
		alertLevel = "PAGE_P1_CRITICAL"
		recommendation = fmt.Sprintf("Critical 1-hour burn rate (%0.1fx). Error budget will be exhausted in %0.1f hours. Page primary SRE immediately.",
			burnRate, timeToExhaust)
	case burnRate >= 6.0:
		alertLevel = "PAGE_P2_HIGH"
		recommendation = fmt.Sprintf("Elevated 6-hour burn rate (%0.1fx). Significant budget consumption. Investigate upstream dependencies.",
			burnRate)
	case burnRate >= 1.0:
		alertLevel = "TICKET_P3_MEDIUM"
		recommendation = fmt.Sprintf("Standard burn rate (%0.1fx). File Jira/Issue ticket for next sprint maintenance.", burnRate)
	}

	return &SLIResult{
		Config:             cfg,
		EvaluatedAt:        now,
		TotalRequests:      totalReqs,
		GoodRequests:       goodReqs,
		BadRequests:        badReqs,
		ActualSLI:          round4(actualSLI),
		AllowedErrorRate:   round4(allowedErrorRate),
		ActualErrorRate:    round4(actualErrorRate),
		BurnRate:           round2(burnRate),
		BudgetConsumedPct:  round2(budgetConsumedPct),
		RemainingBudgetPct: round2(remainingBudgetPct),
		TimeToExhaustHours: round2(timeToExhaust),
		AlertLevel:         alertLevel,
		Recommendation:     recommendation,
	}
}

func round2(val float64) float64 {
	return math.Round(val*100) / 100
}

func round4(val float64) float64 {
	return math.Round(val*10000) / 10000
}
