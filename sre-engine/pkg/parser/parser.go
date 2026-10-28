package parser

import (
	"net"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type DiagnosticIntent string

const (
	IntentGetMetricGraph DiagnosticIntent = "GET_METRIC_GRAPH"
	IntentOverviewScore  DiagnosticIntent = "GET_OVERVIEW_SCORE"
	IntentRootCauseTrace DiagnosticIntent = "TRACE_ROOT_CAUSE"
	IntentBlastRadius    DiagnosticIntent = "GET_BLAST_RADIUS"
	IntentTimeCompare    DiagnosticIntent = "TIME_TRAVEL_COMPARE"
	IntentExportReport   DiagnosticIntent = "EXPORT_POSTMORTEM"
	IntentHelp           DiagnosticIntent = "HELP_GUIDANCE"
	IntentInventory      DiagnosticIntent = "LIST_INVENTORY"
	IntentAgents         DiagnosticIntent = "LIST_AGENTS"
)

type ParsedQuery struct {
	OriginalQuery string            `json:"original_query"`
	Intent        DiagnosticIntent  `json:"intent"`
	TargetHost    string            `json:"target_host,omitempty"`
	TargetPort    int               `json:"target_port,omitempty"`
	TargetAlias   string            `json:"target_alias,omitempty"`
	Metric        string            `json:"metric,omitempty"` // cpu, ram, disk, latency_ms, packet_loss_pct, all
	StartTime     time.Time         `json:"start_time"`
	EndTime       time.Time         `json:"end_time"`
	BaselineStart *time.Time        `json:"baseline_start,omitempty"`
	BaselineEnd   *time.Time        `json:"baseline_end,omitempty"`
	Confidence    float64           `json:"confidence"`
	RawEntities   map[string]string `json:"raw_entities"`
}

// NodeCandidate represents a dynamically discovered infrastructure node in the topology graph.
type NodeCandidate struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Host string `json:"host"`
	Port int    `json:"port"`
	Type string `json:"type"`
}

// Regex patterns
var (
	reIP       = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	rePort     = regexp.MustCompile(`(?::|\bport\s+)(\d{2,5})\b`)
	reRelTime  = regexp.MustCompile(`(?i)\blast\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b`)
	reTimeSpan = regexp.MustCompile(`(?i)(?:between|from)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:and|to|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)`)
)

// Parse deterministic natural language diagnostic query without external candidates.
func Parse(raw string, now time.Time) *ParsedQuery {
	return ParseWithCandidates(raw, now, nil)
}

// ParseWithCandidates parses queries and resolves targets dynamically against active topology nodes.
func ParseWithCandidates(raw string, now time.Time, candidates []NodeCandidate) *ParsedQuery {
	trimmed := strings.TrimSpace(raw)
	lower := strings.ToLower(trimmed)

	res := &ParsedQuery{
		OriginalQuery: trimmed,
		Intent:        IntentHelp,
		Confidence:    0.85,
		RawEntities:   make(map[string]string),
	}

	// 1. Detect Intent
	switch {
	case strings.Contains(lower, "agent") || (strings.Contains(lower, "where") && strings.Contains(lower, "running")) || strings.Contains(lower, "where are my") || strings.Contains(lower, "where my"):
		res.Intent = IntentAgents
		res.Confidence = 0.99
	case strings.Contains(lower, "how many") || strings.Contains(lower, "connected") || strings.Contains(lower, "list systems") || strings.Contains(lower, "list servers") || strings.Contains(lower, "list nodes") || strings.Contains(lower, "what is connected") || strings.Contains(lower, "inventory") || strings.Contains(lower, "all systems") || strings.Contains(lower, "all servers") || strings.Contains(lower, "all nodes") || lower == "systems" || lower == "system" || lower == "servers" || lower == "machines":
		res.Intent = IntentInventory
		res.Confidence = 0.99
	case strings.Contains(lower, "blast radius") || strings.Contains(lower, "impact") || strings.Contains(lower, "break") || strings.Contains(lower, "breaks") || strings.Contains(lower, "depend") || strings.Contains(lower, "depends"):
		res.Intent = IntentBlastRadius
		res.Confidence = 0.98
	case strings.Contains(lower, "compare") || strings.Contains(lower, "difference") || strings.Contains(lower, "delta"):
		res.Intent = IntentTimeCompare
		res.Confidence = 0.95
	case strings.Contains(lower, "postmortem") || strings.Contains(lower, "post mortem") || strings.Contains(lower, "report") || strings.Contains(lower, "export"):
		res.Intent = IntentExportReport
		res.Confidence = 0.98
	case strings.Contains(lower, "why") || strings.Contains(lower, "root cause") || strings.Contains(lower, "fail") || strings.Contains(lower, "down") || strings.Contains(lower, "crash") || strings.Contains(lower, "slow"):
		res.Intent = IntentRootCauseTrace
		res.Confidence = 0.92
	case strings.Contains(lower, "graph") || strings.Contains(lower, "chart") || strings.Contains(lower, "plot") || strings.Contains(lower, "trend"):
		res.Intent = IntentGetMetricGraph
		res.Confidence = 0.95
	case strings.Contains(lower, "latency") || strings.Contains(lower, "cpu") || strings.Contains(lower, "ram") || strings.Contains(lower, "memory") || strings.Contains(lower, "disk") || strings.Contains(lower, "loss"):
		res.Intent = IntentGetMetricGraph
		res.Confidence = 0.90
	case trimmed == "" || strings.Contains(lower, "help") || strings.Contains(lower, "what can you do"):
		res.Intent = IntentHelp
		res.Confidence = 1.0
		return res
	default:
		res.Intent = IntentHelp
		res.Confidence = 0.80
	}

	// 2. Metric Extraction
	switch {
	case strings.Contains(lower, "latency") || strings.Contains(lower, "rtt") || strings.Contains(lower, "ping") || strings.Contains(lower, "delay"):
		res.Metric = "latency_ms"
	case strings.Contains(lower, "packet loss") || strings.Contains(lower, "loss") || strings.Contains(lower, "drop"):
		res.Metric = "packet_loss_pct"
	case strings.Contains(lower, "cpu") || strings.Contains(lower, "processor"):
		res.Metric = "cpu_percent"
	case strings.Contains(lower, "ram") || strings.Contains(lower, "memory"):
		res.Metric = "memory_percent"
	case strings.Contains(lower, "disk") || strings.Contains(lower, "storage") || strings.Contains(lower, "drive"):
		res.Metric = "disk_percent"
	default:
		res.Metric = "all"
	}

	// 3. Dynamic Target Entity Resolution (Zero Hardcoding)
	// 3a. Extract explicit IP literal if specified
	if match := reIP.FindString(raw); match != "" {
		if net.ParseIP(match) != nil {
			res.TargetHost = match
			res.RawEntities["ip"] = match
		}
	}

	// 3b. Extract explicit port if specified
	if matches := rePort.FindStringSubmatch(raw); len(matches) > 1 {
		if p, err := strconv.Atoi(matches[1]); err == nil && p > 0 && p <= 65535 {
			res.TargetPort = p
			res.RawEntities["port"] = matches[1]
		}
	}

	// 3c. Match against dynamically provided node candidates
	var bestCandidate *NodeCandidate
	bestScore := 0

	for i := range candidates {
		c := &candidates[i]
		candNameLower := strings.ToLower(c.Name)
		candIDLower := strings.ToLower(c.ID)
		candTypeLower := strings.ToLower(c.Type)
		score := 0

		// Check name match: either exact or word-level (e.g. "gateway", "frontend", "postgres", "database", "backend")
		nameMatched := false
		if candNameLower != "" && strings.Contains(lower, candNameLower) {
			score += 100
			nameMatched = true
		} else {
			words := strings.Fields(candNameLower)
			for _, w := range words {
				wClean := strings.Trim(w, "(),.-")
				if len(wClean) >= 3 && strings.Contains(lower, wClean) {
					score += 50
					nameMatched = true
					break
				}
			}
		}

		if !nameMatched && candIDLower != "" && strings.Contains(lower, candIDLower) {
			score += 80
		}
		if !nameMatched && candTypeLower != "" && strings.Contains(lower, candTypeLower) {
			score += 30
		}

		// Check port match: reward exact port, penalize mismatch when port specified
		if res.TargetPort > 0 && c.Port > 0 {
			if res.TargetPort == c.Port {
				score += 60
			} else {
				score -= 100
			}
		}

		// Check IP match
		if c.Host != "" {
			if res.TargetHost != "" {
				if res.TargetHost == c.Host {
					score += 150
				} else {
					score -= 50
				}
			} else if strings.Contains(lower, c.Host) {
				score += 40
			} else {
				// Exact token matching for last octet only (e.g., "server on 86" or "ping 86")
				parts := strings.Split(c.Host, ".")
				if len(parts) == 4 {
					lastOctet := parts[3]
					for _, token := range strings.Fields(lower) {
						cleanToken := strings.Trim(token, "():,.-")
						if cleanToken == lastOctet {
							score += 25
							break
						}
					}
				}
			}
		}

		if score > bestScore {
			bestScore = score
			bestCandidate = c
		}
	}

	if bestCandidate != nil && bestScore > 0 {
		res.TargetHost = bestCandidate.Host
		if bestCandidate.Port > 0 && res.TargetPort == 0 {
			res.TargetPort = bestCandidate.Port
		}
		res.TargetAlias = bestCandidate.Name
		res.RawEntities["matched_node_id"] = bestCandidate.ID
		res.RawEntities["matched_alias"] = bestCandidate.Name
	}

	// 4. Time Window Resolution (Check 1: Time parsing & boundary defense)
	startTime, endTime, baselineStart, baselineEnd := parseTimeWindow(lower, now)
	res.StartTime = startTime
	res.EndTime = endTime
	res.BaselineStart = baselineStart
	res.BaselineEnd = baselineEnd

	return res
}

func parseTimeWindow(lower string, now time.Time) (time.Time, time.Time, *time.Time, *time.Time) {
	// Default: Last 30 minutes
	defaultEnd := now.UTC()
	defaultStart := defaultEnd.Add(-30 * time.Minute)

	// Check Relative Time: "last 15m", "last 2h"
	if matches := reRelTime.FindStringSubmatch(lower); len(matches) > 2 {
		amount, err := strconv.Atoi(matches[1])
		if err == nil && amount > 0 {
			unit := strings.ToLower(matches[2])
			var d time.Duration
			switch {
			case strings.HasPrefix(unit, "m"):
				d = time.Duration(amount) * time.Minute
			case strings.HasPrefix(unit, "h"):
				d = time.Duration(amount) * time.Hour
			case strings.HasPrefix(unit, "d"):
				d = time.Duration(amount) * 24 * time.Hour
			}
			start := defaultEnd.Add(-d)
			return start, defaultEnd, nil, nil
		}
	}

	// Check Explicit Time Span: "between 10:00 and 10:30", "10am to 11am"
	if matches := reTimeSpan.FindStringSubmatch(lower); len(matches) > 2 {
		t1Str := strings.TrimSpace(matches[1])
		t2Str := strings.TrimSpace(matches[2])

		t1, ok1 := parseClockTime(t1Str, now)
		t2, ok2 := parseClockTime(t2Str, now)

		if ok1 && ok2 {
			// Inverted boundary check: auto-swap if start > end
			if t1.After(t2) {
				// Handle midnight day-rollover: if t1 is late evening and t2 is early morning
				if t1.Hour() >= 18 && t2.Hour() <= 6 {
					t2 = t2.Add(24 * time.Hour)
				} else {
					t1, t2 = t2, t1
				}
			}
			return t1.UTC(), t2.UTC(), nil, nil
		}
	}

	// Check comparison query: "yesterday" baseline comparison
	if strings.Contains(lower, "yesterday") {
		bStart := defaultStart.Add(-24 * time.Hour)
		bEnd := defaultEnd.Add(-24 * time.Hour)
		return defaultStart, defaultEnd, &bStart, &bEnd
	}

	// Check "since morning" / "today"
	if strings.Contains(lower, "since morning") || strings.Contains(lower, "today") {
		morning := time.Date(now.Year(), now.Month(), now.Day(), 8, 0, 0, 0, now.Location())
		if morning.After(now) {
			morning = morning.Add(-24 * time.Hour)
		}
		return morning.UTC(), defaultEnd, nil, nil
	}

	return defaultStart, defaultEnd, nil, nil
}

func parseClockTime(str string, refDate time.Time) (time.Time, bool) {
	str = strings.TrimSpace(strings.ToLower(str))
	isPM := strings.HasSuffix(str, "pm")
	isAM := strings.HasSuffix(str, "am")
	clean := strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(str, "pm"), "am"))

	var hour, min int
	if strings.Contains(clean, ":") {
		parts := strings.Split(clean, ":")
		h, errH := strconv.Atoi(parts[0])
		m, errM := strconv.Atoi(parts[1])
		if errH != nil || errM != nil {
			return time.Time{}, false
		}
		hour = h
		min = m
	} else {
		h, err := strconv.Atoi(clean)
		if err != nil {
			return time.Time{}, false
		}
		hour = h
		min = 0
	}

	if isPM && hour < 12 {
		hour += 12
	}
	if isAM && hour == 12 {
		hour = 0
	}

	if hour < 0 || hour > 23 || min < 0 || min > 59 {
		return time.Time{}, false
	}

	t := time.Date(refDate.Year(), refDate.Month(), refDate.Day(), hour, min, 0, 0, refDate.Location())
	return t, true
}
