package timetravel

import (
	"math"
	"testing"
	"time"
)

// Code Run 1: Time Travel Statistical Delta, Percentiles, and Zero-Division Defense
func TestCodeRun1_StatisticalDeltaAndZeroDivision(t *testing.T) {
	now := time.Now()
	curStart := now.Add(-30 * time.Minute)
	curEnd := now
	baseStart := now.Add(-24 * time.Hour).Add(-30 * time.Minute)
	baseEnd := now.Add(-24 * time.Hour)

	// Scenario A: Latency degradation (Normal distribution)
	var curPoints []MetricDataPoint
	for i := 1; i <= 100; i++ {
		curPoints = append(curPoints, MetricDataPoint{
			Timestamp: curStart.Add(time.Duration(i*18) * time.Second),
			Value:     float64(50 + (i % 30)), // 50 to 79ms
		})
	}

	var basePoints []MetricDataPoint
	for i := 1; i <= 100; i++ {
		basePoints = append(basePoints, MetricDataPoint{
			Timestamp: baseStart.Add(time.Duration(i*18) * time.Second),
			Value:     float64(15 + (i % 10)), // 15 to 24ms
		})
	}

	delta := CompareWindows("latency_ms", curPoints, curStart, curEnd, basePoints, baseStart, baseEnd)

	if delta.Assessment != "CRITICAL_DEGRADATION" {
		t.Fatalf("Expected CRITICAL_DEGRADATION, got: %s (PctDelta: %f)", delta.Assessment, delta.PercentageDelta)
	}

	if delta.PercentageDelta <= 100.0 {
		t.Fatalf("Expected percentage delta > 100%% for latency jump, got: %f", delta.PercentageDelta)
	}

	if delta.CurrentWindow.P95 == 0 || delta.BaselineWindow.P95 == 0 {
		t.Fatalf("Expected non-zero P95 values")
	}

	// Scenario B: Zero-Division Defense (Baseline is exactly 0.0)
	var zeroBasePoints []MetricDataPoint
	for i := 0; i < 20; i++ {
		zeroBasePoints = append(zeroBasePoints, MetricDataPoint{
			Timestamp: baseStart.Add(time.Duration(i) * time.Minute),
			Value:     0.0, // 0.0% packet loss
		})
	}

	var spikeCurPoints []MetricDataPoint
	for i := 0; i < 20; i++ {
		spikeCurPoints = append(spikeCurPoints, MetricDataPoint{
			Timestamp: curStart.Add(time.Duration(i) * time.Minute),
			Value:     5.5, // 5.5% packet loss
		})
	}

	zeroDelta := CompareWindows("packet_loss_pct", spikeCurPoints, curStart, curEnd, zeroBasePoints, baseStart, baseEnd)

	// Must defend against division by zero!
	if math.IsNaN(zeroDelta.PercentageDelta) || math.IsInf(zeroDelta.PercentageDelta, 0) {
		t.Fatalf("Zero-division produced NaN or Inf: %f", zeroDelta.PercentageDelta)
	}

	if zeroDelta.PercentageDelta != 100.0 {
		t.Fatalf("Expected 100.0%% delta for 0 -> positive transition, got: %f", zeroDelta.PercentageDelta)
	}

	// Scenario C: Single data point window
	singleSummary := SummarizeWindow([]MetricDataPoint{{Timestamp: now, Value: 42.0}}, curStart, curEnd)
	if singleSummary.Count != 1 || singleSummary.Mean != 42.0 || singleSummary.P95 != 42.0 || singleSummary.P99 != 42.0 {
		t.Fatalf("Single data point summary incorrect: %+v", singleSummary)
	}
}

// Code Run 2: Time Travel Sparse / Empty Data Point Alignment & Interpolation
func TestCodeRun2_SparseDataAlignment(t *testing.T) {
	now := time.Now()
	curStart := now.Add(-15 * time.Minute)
	curEnd := now
	baseStart := now.Add(-1 * time.Hour)
	baseEnd := now.Add(-45 * time.Minute)

	// Scenario A: Empty baseline (0 data points)
	curPoints := []MetricDataPoint{
		{Timestamp: curStart.Add(1 * time.Minute), Value: 25.0},
		{Timestamp: curStart.Add(5 * time.Minute), Value: 30.0},
	}
	var emptyBasePoints []MetricDataPoint

	delta := CompareWindows("cpu_usage", curPoints, curStart, curEnd, emptyBasePoints, baseStart, baseEnd)
	if delta.BaselineWindow.Count != 0 || delta.BaselineWindow.Mean != 0.0 {
		t.Fatalf("Expected 0 baseline count and 0.0 mean, got: %+v", delta.BaselineWindow)
	}
	if math.IsNaN(delta.PercentageDelta) || math.IsInf(delta.PercentageDelta, 0) {
		t.Fatalf("Empty baseline produced NaN or Inf percentage: %f", delta.PercentageDelta)
	}

	// Scenario B: Highly mismatched counts (50 current vs 2 baseline)
	var densePoints []MetricDataPoint
	for i := 0; i < 50; i++ {
		densePoints = append(densePoints, MetricDataPoint{
			Timestamp: curStart.Add(time.Duration(i*10) * time.Second),
			Value:     10.0,
		})
	}
	sparseBase := []MetricDataPoint{
		{Timestamp: baseStart, Value: 10.0},
		{Timestamp: baseEnd, Value: 10.0},
	}

	stableDelta := CompareWindows("cpu_usage", densePoints, curStart, curEnd, sparseBase, baseStart, baseEnd)
	if stableDelta.Assessment != "STABLE" {
		t.Fatalf("Expected STABLE for matching values, got: %s (Pct: %f)", stableDelta.Assessment, stableDelta.PercentageDelta)
	}
	if stableDelta.PercentageDelta != 0.0 {
		t.Fatalf("Expected 0.0%% delta, got: %f", stableDelta.PercentageDelta)
	}
}
