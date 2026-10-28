package timetravel

import (
	"fmt"
	"math"
	"sort"
	"time"
)

type MetricDataPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

type WindowSummary struct {
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
	Count     int       `json:"count"`
	Mean      float64   `json:"mean"`
	Min       float64   `json:"min"`
	Max       float64   `json:"max"`
	P95       float64   `json:"p95"`
	P99       float64   `json:"p99"`
	StdDev    float64   `json:"std_dev"`
}

type ComparisonDelta struct {
	Metric          string        `json:"metric"`
	CurrentWindow   WindowSummary `json:"current_window"`
	BaselineWindow  WindowSummary `json:"baseline_window"`
	AbsoluteDelta   float64       `json:"absolute_delta"`
	PercentageDelta float64       `json:"percentage_delta"`
	P95Delta        float64       `json:"p95_delta"`
	P99Delta        float64       `json:"p99_delta"`
	Assessment      string        `json:"assessment"` // CRITICAL_DEGRADATION, DEGRADATION, STABLE, IMPROVEMENT
	Explanation     string        `json:"explanation"`
}

// SummarizeWindow calculates statistical aggregates with zero-division and NaN defense
func SummarizeWindow(points []MetricDataPoint, start, end time.Time) WindowSummary {
	if len(points) == 0 {
		return WindowSummary{
			StartTime: start,
			EndTime:   end,
			Count:     0,
			Mean:      0.0,
			Min:       0.0,
			Max:       0.0,
			P95:       0.0,
			P99:       0.0,
			StdDev:    0.0,
		}
	}

	// Extract and sort values ascending for percentile calculation
	vals := make([]float64, 0, len(points))
	sum := 0.0
	minVal := math.MaxFloat64
	maxVal := -math.MaxFloat64

	for _, pt := range points {
		val := pt.Value
		if math.IsNaN(val) || math.IsInf(val, 0) {
			val = 0.0 // NaN defense
		}
		vals = append(vals, val)
		sum += val
		if val < minVal {
			minVal = val
		}
		if val > maxVal {
			maxVal = val
		}
	}

	sort.Float64s(vals)
	n := len(vals)
	mean := sum / float64(n)

	// Percentiles (nearest rank method)
	p95Idx := int(math.Ceil(0.95*float64(n))) - 1
	if p95Idx < 0 {
		p95Idx = 0
	} else if p95Idx >= n {
		p95Idx = n - 1
	}

	p99Idx := int(math.Ceil(0.99*float64(n))) - 1
	if p99Idx < 0 {
		p99Idx = 0
	} else if p99Idx >= n {
		p99Idx = n - 1
	}

	// Standard Deviation
	varianceSum := 0.0
	for _, v := range vals {
		diff := v - mean
		varianceSum += diff * diff
	}
	stdDev := math.Sqrt(varianceSum / float64(n))

	return WindowSummary{
		StartTime: start,
		EndTime:   end,
		Count:     n,
		Mean:      round2(mean),
		Min:       round2(minVal),
		Max:       round2(maxVal),
		P95:       round2(vals[p95Idx]),
		P99:       round2(vals[p99Idx]),
		StdDev:    round2(stdDev),
	}
}

// CompareWindows deterministically computes statistical delta between current and baseline
func CompareWindows(metric string, currentPoints []MetricDataPoint, curStart, curEnd time.Time,
	baselinePoints []MetricDataPoint, baseStart, baseEnd time.Time) *ComparisonDelta {

	curSummary := SummarizeWindow(currentPoints, curStart, curEnd)
	baseSummary := SummarizeWindow(baselinePoints, baseStart, baseEnd)

	absDelta := round2(curSummary.Mean - baseSummary.Mean)
	p95Delta := round2(curSummary.P95 - baseSummary.P95)
	p99Delta := round2(curSummary.P99 - baseSummary.P99)

	// Percentage delta with zero-division defense
	pctDelta := 0.0
	if baseSummary.Mean == 0.0 {
		if curSummary.Mean > 0.0 {
			pctDelta = 100.0 // Baseline was zero, jumped to positive value
		} else if curSummary.Mean < 0.0 {
			pctDelta = -100.0
		} else {
			pctDelta = 0.0 // Both are 0.0
		}
	} else {
		pctDelta = round2(((curSummary.Mean - baseSummary.Mean) / math.Abs(baseSummary.Mean)) * 100.0)
	}

	if math.IsNaN(pctDelta) || math.IsInf(pctDelta, 0) {
		pctDelta = 0.0
	}

	// Assess degradation
	assessment := "STABLE"
	if pctDelta >= 50.0 || (baseSummary.P95 > 0 && p95Delta >= baseSummary.P95*0.5) {
		assessment = "CRITICAL_DEGRADATION"
	} else if pctDelta >= 15.0 || p95Delta > 0.0 {
		assessment = "DEGRADATION"
	} else if pctDelta <= -15.0 {
		assessment = "IMPROVEMENT"
	}

	explanation := fmt.Sprintf("%s changed by %+0.1f%% (Mean: %0.2f -> %0.2f, P95: %0.2f -> %0.2f).",
		metric, pctDelta, baseSummary.Mean, curSummary.Mean, baseSummary.P95, curSummary.P95)

	return &ComparisonDelta{
		Metric:          metric,
		CurrentWindow:   curSummary,
		BaselineWindow:  baseSummary,
		AbsoluteDelta:   absDelta,
		PercentageDelta: pctDelta,
		P95Delta:        p95Delta,
		P99Delta:        p99Delta,
		Assessment:      assessment,
		Explanation:     explanation,
	}
}

func round2(val float64) float64 {
	return math.Round(val*100) / 100
}
