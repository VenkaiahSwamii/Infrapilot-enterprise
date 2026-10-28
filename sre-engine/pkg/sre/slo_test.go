package sre

import (
	"math"
	"testing"
	"time"
)

// Code Run 3: Google SRE Multi-Window Multi-Burn-Rate Calculation
func TestCodeRun3_SLOErrorBudgetBurnRates(t *testing.T) {
	now := time.Now()

	cfg := SLOConfig{
		Name:        "API Gateway Availability",
		TargetSLO:   0.999, // 99.9% availability (Allowed error rate: 0.1% or 0.001)
		PeriodHours: 720.0, // 30 days
		WindowHours: 1.0,   // 1 hour
	}

	// 1. Critical 1-hour burn test: 10,000 total requests, 150 errors (1.5% error rate)
	// Burn rate = 0.015 / 0.001 = 15.0x (Exceeds 14.4x threshold!)
	res1h := EvaluateSLO(cfg, 10000, 9850, now)

	if res1h.BurnRate < 14.4 {
		t.Fatalf("Expected burn rate >= 14.4x for 1.5%% error rate on 99.9%% SLO, got: %f", res1h.BurnRate)
	}
	if res1h.AlertLevel != "PAGE_P1_CRITICAL" {
		t.Fatalf("Expected PAGE_P1_CRITICAL alert, got: %s", res1h.AlertLevel)
	}
	if res1h.TimeToExhaustHours <= 0 || res1h.TimeToExhaustHours > 100 {
		t.Fatalf("Expected reasonable exhaustion hours projection (e.g. ~48h), got: %f", res1h.TimeToExhaustHours)
	}

	// 2. Elevated 6-hour burn test: 60,000 total requests, 400 errors (0.667% error rate)
	// Burn rate = 0.00667 / 0.001 = 6.67x (Exceeds 6.0x threshold!)
	cfg6h := cfg
	cfg6h.WindowHours = 6.0
	res6h := EvaluateSLO(cfg6h, 60000, 59600, now)

	if res6h.BurnRate < 6.0 || res6h.BurnRate >= 14.4 {
		t.Fatalf("Expected burn rate between 6.0x and 14.4x, got: %f", res6h.BurnRate)
	}
	if res6h.AlertLevel != "PAGE_P2_HIGH" {
		t.Fatalf("Expected PAGE_P2_HIGH alert, got: %s", res6h.AlertLevel)
	}

	// 3. Healthy test: 99.95% availability (Only 5 errors in 10,000 requests)
	resHealthy := EvaluateSLO(cfg, 10000, 9995, now)
	if resHealthy.AlertLevel != "HEALTHY_P4_LOW" {
		t.Fatalf("Expected HEALTHY_P4_LOW alert, got: %s (BurnRate: %f)", resHealthy.AlertLevel, resHealthy.BurnRate)
	}
	if resHealthy.BurnRate >= 1.0 {
		t.Fatalf("Expected burn rate < 1.0, got: %f", resHealthy.BurnRate)
	}
}

// Code Run 4: Google SRE Extreme Boundaries (Zero Requests & Complete 100% Outage)
func TestCodeRun4_SLOZeroRequestsAndTotalOutage(t *testing.T) {
	now := time.Now()
	cfg := SLOConfig{
		Name:        "Database Query Latency SLO",
		TargetSLO:   0.999,
		PeriodHours: 720.0,
		WindowHours: 1.0,
	}

	// Boundary 1: Zero Requests
	zeroRes := EvaluateSLO(cfg, 0, 0, now)
	if math.IsNaN(zeroRes.BurnRate) || math.IsInf(zeroRes.BurnRate, 0) {
		t.Fatalf("Zero requests produced NaN or Inf burn rate: %f", zeroRes.BurnRate)
	}
	if zeroRes.BurnRate != 0.0 {
		t.Fatalf("Expected 0.0 burn rate for 0 requests, got: %f", zeroRes.BurnRate)
	}
	if zeroRes.BudgetConsumedPct != 0.0 {
		t.Fatalf("Expected 0.0%% budget consumed, got: %f", zeroRes.BudgetConsumedPct)
	}
	if zeroRes.RemainingBudgetPct != 100.0 {
		t.Fatalf("Expected 100.0%% remaining budget, got: %f", zeroRes.RemainingBudgetPct)
	}
	if zeroRes.AlertLevel != "HEALTHY_P4_LOW" {
		t.Fatalf("Expected HEALTHY alert for 0 requests, got: %s", zeroRes.AlertLevel)
	}

	// Boundary 2: Complete 100% Outage (5,000 requests, 0 good)
	outageRes := EvaluateSLO(cfg, 5000, 0, now)
	if outageRes.ActualErrorRate != 1.0 {
		t.Fatalf("Expected 1.0 error rate for complete outage, got: %f", outageRes.ActualErrorRate)
	}
	if outageRes.BurnRate != 1000.0 {
		t.Fatalf("Expected 1000.0x burn rate for 100%% failure on 99.9%% SLO, got: %f", outageRes.BurnRate)
	}
	if outageRes.AlertLevel != "PAGE_P1_CRITICAL" {
		t.Fatalf("Expected PAGE_P1_CRITICAL for complete outage, got: %s", outageRes.AlertLevel)
	}

	// Boundary 3: Degraded config fallback
	badCfg := SLOConfig{TargetSLO: -5.0} // Out of range
	sanitized := EvaluateSLO(badCfg, 100, 100, now)
	if sanitized.Config.TargetSLO != 0.999 {
		t.Fatalf("Expected fallback to 0.999 for invalid target SLO, got: %f", sanitized.Config.TargetSLO)
	}
}
