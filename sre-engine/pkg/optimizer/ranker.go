package optimizer

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
)

type DiagnosticCandidate struct {
	ID              string                 `json:"id"`
	Title           string                 `json:"title"`
	Description     string                 `json:"description"`
	Severity        string                 `json:"severity"` // "CRITICAL", "ERROR", "WARNING", "INFO"
	Timestamp       time.Time              `json:"timestamp"`
	Depth           int                    `json:"depth"` // 0 is root cause, higher is downstream
	Frequency       int                    `json:"frequency"`
	RawScore        float64                `json:"raw_score"`
	NormalizedScore float64                `json:"normalized_score"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
}

type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Source    string    `json:"source"`
	Host      string    `json:"host"`
}

type ClusteredLogPattern struct {
	PatternSignature string    `json:"pattern_signature"`
	SampleMessage    string    `json:"sample_message"`
	Count            int       `json:"count"`
	FirstSeen        time.Time `json:"first_seen"`
	LastSeen         time.Time `json:"last_seen"`
	Sources          []string  `json:"sources"`
	Severity         string    `json:"severity"`
	IsAnomaly        bool      `json:"is_anomaly"`
}

var (
	tsRegex   = regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?\b`)
	ipRegex   = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b`)
	uuidRegex = regexp.MustCompile(`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b`)
	hexRegex  = regexp.MustCompile(`\b0x[0-9a-fA-F]+\b|\b[0-9a-fA-F]{16,64}\b`)
	numRegex  = regexp.MustCompile(`\b\d+\b`)
)

// RankCandidates applies multi-factor mathematical scoring (Code Check 7)
// Score = SeverityWeight * RecencyDecay * DepthWeight * FrequencyFactor
// Defends strictly against NaN, +Inf, -Inf, and division by zero.
func RankCandidates(candidates []*DiagnosticCandidate, now time.Time) []*DiagnosticCandidate {
	if len(candidates) == 0 {
		return candidates
	}

	maxScore := 0.0

	for _, c := range candidates {
		if c == nil {
			continue
		}

		// 1. Severity Weight
		sevWeight := 20.0
		switch strings.ToUpper(c.Severity) {
		case "CRITICAL":
			sevWeight = 100.0
		case "ERROR":
			sevWeight = 75.0
		case "WARNING":
			sevWeight = 40.0
		case "INFO":
			sevWeight = 10.0
		}

		// 2. Recency Decay: e^(-lambda * deltaHours)
		deltaHours := 0.0
		if !c.Timestamp.IsZero() && now.After(c.Timestamp) {
			deltaHours = now.Sub(c.Timestamp).Hours()
		}
		if deltaHours < 0.0 {
			deltaHours = 0.0 // Clock drift defense
		}
		// Half-life ~ 6 hours (lambda = 0.115)
		recencyDecay := math.Exp(-0.115 * deltaHours)
		if recencyDecay < 0.01 {
			recencyDecay = 0.01 // Lower bound floor
		}

		// 3. Dependency Depth: Root cause (depth 0) is prioritized
		depth := c.Depth
		if depth < 0 {
			depth = 0
		}
		depthWeight := 1.0 / (1.0 + 0.6*float64(depth))

		// 4. Frequency Factor: Logarithmic scaling
		freq := c.Frequency
		if freq < 1 {
			freq = 1
		}
		freqFactor := 1.0 + 0.2*math.Log10(float64(freq))

		// Multi-factor calculation
		score := sevWeight * recencyDecay * depthWeight * freqFactor

		// Division by zero and NaN / Inf sanitization
		if math.IsNaN(score) || math.IsInf(score, 0) {
			score = 0.0
		}

		c.RawScore = math.Round(score*100) / 100
		if c.RawScore > maxScore {
			maxScore = c.RawScore
		}
	}

	// Sort descending by raw score
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].RawScore > candidates[j].RawScore
	})

	// Normalize scores into [0.0, 1.0]
	for _, c := range candidates {
		if maxScore > 0.0 {
			c.NormalizedScore = math.Round((c.RawScore/maxScore)*1000) / 1000
		} else {
			c.NormalizedScore = 0.0
		}
	}

	return candidates
}

// ExtractPatternTemplate masks dynamic tokens into standardized slots (Code Check 8)
func ExtractPatternTemplate(msg string) string {
	cleaned := tsRegex.ReplaceAllString(msg, "<TS>")
	cleaned = ipRegex.ReplaceAllString(cleaned, "<IP>")
	cleaned = uuidRegex.ReplaceAllString(cleaned, "<UUID>")
	cleaned = hexRegex.ReplaceAllString(cleaned, "<HEX>")
	cleaned = numRegex.ReplaceAllString(cleaned, "<NUM>")
	return strings.TrimSpace(cleaned)
}

// ClusterLogs aggregates high-volume logs into signature patterns (Code Check 8)
func ClusterLogs(logs []LogEntry) []*ClusteredLogPattern {
	if len(logs) == 0 {
		return []*ClusteredLogPattern{}
	}

	groups := make(map[string]*ClusteredLogPattern)

	for _, l := range logs {
		pattern := ExtractPatternTemplate(l.Message)
		sig := fmt.Sprintf("[%s] %s", strings.ToUpper(l.Level), pattern)

		cluster, exists := groups[sig]
		if !exists {
			cluster = &ClusteredLogPattern{
				PatternSignature: sig,
				SampleMessage:    l.Message,
				Count:            0,
				FirstSeen:        l.Timestamp,
				LastSeen:         l.Timestamp,
				Sources:          []string{},
				Severity:         strings.ToUpper(l.Level),
				IsAnomaly:        false,
			}
			groups[sig] = cluster
		}

		cluster.Count++
		if l.Timestamp.Before(cluster.FirstSeen) || cluster.FirstSeen.IsZero() {
			cluster.FirstSeen = l.Timestamp
		}
		if l.Timestamp.After(cluster.LastSeen) {
			cluster.LastSeen = l.Timestamp
		}
		if l.Source != "" && !containsStr(cluster.Sources, l.Source) {
			cluster.Sources = append(cluster.Sources, l.Source)
		}
	}

	totalLogs := len(logs)
	results := make([]*ClusteredLogPattern, 0, len(groups))

	for _, c := range groups {
		// Anomaly detection: if an error pattern accounts for >20% of high volume logs or occurs > 50 times
		if (c.Severity == "ERROR" || c.Severity == "CRITICAL") && (c.Count > 50 || (totalLogs > 10 && float64(c.Count)/float64(totalLogs) > 0.25)) {
			c.IsAnomaly = true
		}
		results = append(results, c)
	}

	// Sort patterns descending by count
	sort.Slice(results, func(i, j int) bool {
		return results[i].Count > results[j].Count
	})

	return results
}

func containsStr(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
