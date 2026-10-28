package drift

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"infrapilot/sre-engine/pkg/optimizer"
)

type DriftType string

const (
	DriftAdded    DriftType = "ADDED"
	DriftRemoved  DriftType = "REMOVED"
	DriftModified DriftType = "MODIFIED"
)

type ConfigSnapshot struct {
	Host       string                 `json:"host"`
	Component  string                 `json:"component"`
	Timestamp  time.Time              `json:"timestamp"`
	Hash       string                 `json:"hash"`
	Parameters map[string]interface{} `json:"parameters"`
}

type DriftItem struct {
	Key           string      `json:"key"`
	Type          DriftType   `json:"type"`
	BaselineValue interface{} `json:"baseline_value,omitempty"`
	CurrentValue  interface{} `json:"current_value,omitempty"`
	Severity      string      `json:"severity"` // CRITICAL, WARNING, INFO
	Description   string      `json:"description"`
}

type DriftReport struct {
	Host         string      `json:"host"`
	Component    string      `json:"component"`
	BaselineHash string      `json:"baseline_hash"`
	CurrentHash  string      `json:"current_hash"`
	HasDrift     bool        `json:"has_drift"`
	DriftCount   int         `json:"drift_count"`
	Drifts       []DriftItem `json:"drifts"`
	Summary      string      `json:"summary"`
}

// ComputeHash generates a deterministic SHA-256 fingerprint for a configuration map
func ComputeHash(params map[string]interface{}) string {
	if len(params) == 0 {
		return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" // SHA-256 of empty
	}

	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	canonicalMap := make(map[string]interface{})
	for _, k := range keys {
		canonicalMap[k] = params[k]
	}

	data, _ := json.Marshal(canonicalMap)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// DeepDiff compares a golden baseline configuration against current state
func DeepDiff(baseline, current ConfigSnapshot) *DriftReport {
	baseHash := baseline.Hash
	if baseHash == "" {
		baseHash = ComputeHash(baseline.Parameters)
	}
	curHash := current.Hash
	if curHash == "" {
		curHash = ComputeHash(current.Parameters)
	}

	var drifts []DriftItem

	// Check for Modified and Removed keys
	for k, baseVal := range baseline.Parameters {
		curVal, exists := current.Parameters[k]
		if !exists {
			drifts = append(drifts, DriftItem{
				Key:           k,
				Type:          DriftRemoved,
				BaselineValue: baseVal,
				CurrentValue:  nil,
				Severity:      classifySeverity(k),
				Description:   fmt.Sprintf("Key '%s' was removed from current configuration (was: %v)", k, baseVal),
			})
			continue
		}

		if !valuesEqual(baseVal, curVal) {
			drifts = append(drifts, DriftItem{
				Key:           k,
				Type:          DriftModified,
				BaselineValue: baseVal,
				CurrentValue:  curVal,
				Severity:      classifySeverity(k),
				Description:   fmt.Sprintf("Key '%s' modified from %v to %v", k, baseVal, curVal),
			})
		}
	}

	// Check for Added keys
	for k, curVal := range current.Parameters {
		if _, exists := baseline.Parameters[k]; !exists {
			drifts = append(drifts, DriftItem{
				Key:           k,
				Type:          DriftAdded,
				BaselineValue: nil,
				CurrentValue:  curVal,
				Severity:      classifySeverity(k),
				Description:   fmt.Sprintf("Key '%s' was added to current configuration with value: %v", k, curVal),
			})
		}
	}

	hasDrift := len(drifts) > 0
	summary := fmt.Sprintf("Host %s (%s) configuration matches golden baseline.", current.Host, current.Component)
	if hasDrift {
		summary = fmt.Sprintf("CRITICAL CONFIG DRIFT: %d drift(s) detected on %s (%s). Current fingerprint: %s",
			len(drifts), current.Host, current.Component, curHash[:12])
	}

	return &DriftReport{
		Host:         current.Host,
		Component:    current.Component,
		BaselineHash: baseHash,
		CurrentHash:  curHash,
		HasDrift:     hasDrift,
		DriftCount:   len(drifts),
		Drifts:       drifts,
		Summary:      summary,
	}
}

// CorrelateDriftWithCandidates boosts root cause candidate ranking when config drift is detected
func CorrelateDriftWithCandidates(report *DriftReport, candidates []*optimizer.DiagnosticCandidate) []*optimizer.DiagnosticCandidate {
	if report == nil || !report.HasDrift {
		return candidates
	}

	for _, c := range candidates {
		if c == nil {
			continue
		}
		// Match candidate metadata or title with drift host/component
		match := false
		if strings.Contains(strings.ToLower(c.Title), strings.ToLower(report.Host)) ||
			strings.Contains(strings.ToLower(c.Description), strings.ToLower(report.Host)) {
			match = true
		}
		if report.Component != "" && (strings.Contains(strings.ToLower(c.Title), strings.ToLower(report.Component)) ||
			strings.Contains(strings.ToLower(c.Description), strings.ToLower(report.Component))) {
			match = true
		}

		if match {
			c.RawScore *= 1.5 // 50% boost in root cause probability
			if c.Metadata == nil {
				c.Metadata = make(map[string]interface{})
			}
			c.Metadata["config_drift_detected"] = true
			c.Metadata["drift_count"] = report.DriftCount
			c.Description = fmt.Sprintf("%s [UNAUTHORIZED CONFIG DRIFT: %d changes]", c.Description, report.DriftCount)
		}
	}

	return candidates
}

func valuesEqual(v1, v2 interface{}) bool {
	// Format comparison handles number/string type conversions cleanly
	s1 := fmt.Sprint(v1)
	s2 := fmt.Sprint(v2)
	return s1 == s2
}

func classifySeverity(key string) string {
	lower := strings.ToLower(key)
	if strings.Contains(lower, "port") || strings.Contains(lower, "max_conn") ||
		strings.Contains(lower, "auth") || strings.Contains(lower, "password") ||
		strings.Contains(lower, "ssl") || strings.Contains(lower, "listen") ||
		strings.Contains(lower, "pool") || strings.Contains(lower, "timeout") {
		return "CRITICAL"
	}
	return "WARNING"
}
