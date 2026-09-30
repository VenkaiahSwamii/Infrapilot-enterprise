package alerts

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"
	"infrapilot/backend/internal/services"

	"github.com/google/uuid"
)

// RuleCache implements Phase 12: In-Memory Rule Cache with 1-minute TTL refresh.
type RuleCache struct {
	mu          sync.RWMutex
	rules       []models.AlertRule
	lastUpdated time.Time
	ttl         time.Duration
	ruleRepo    *repository.AlertRuleRepository
}

var globalRuleCache = &RuleCache{
	ttl:      1 * time.Minute,
	ruleRepo: repository.NewAlertRuleRepository(),
}

// DefaultRules provides fallback rules if no alert rules exist in PostgreSQL DB.
var DefaultRules = []models.AlertRule{
	{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Name:      "High CPU Usage",
		Metric:    "cpu_usage",
		Operator:  ">",
		Value:     90.0,
		Severity:  "Critical",
		IsEnabled: true,
	},
	{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		Name:      "High Memory Usage",
		Metric:    "memory_percent",
		Operator:  ">",
		Value:     85.0,
		Severity:  "Warning",
		IsEnabled: true,
	},
	{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000003"),
		Name:      "Disk Almost Full",
		Metric:    "disk_percent",
		Operator:  ">",
		Value:     95.0,
		Severity:  "Critical",
		IsEnabled: true,
	},
	{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000004"),
		Name:      "High Network Latency",
		Metric:    "latency_ms",
		Operator:  ">",
		Value:     200.0,
		Severity:  "Warning",
		IsEnabled: true,
	},
}

// GetEnabledRules loads enabled rules from cache or PostgreSQL database.
func (c *RuleCache) GetEnabledRules() []models.AlertRule {
	c.mu.RLock()
	if time.Since(c.lastUpdated) < c.ttl && c.rules != nil {
		defer c.mu.RUnlock()
		return c.rules
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	if time.Since(c.lastUpdated) < c.ttl && c.rules != nil {
		return c.rules
	}

	var rules []models.AlertRule
	if database.DB != nil {
		var err error
		rules, err = c.ruleRepo.GetAllEnabledRules()
		if err != nil {
			log.Printf("[Alert Engine] Error querying enabled alert rules: %v", err)
		}
	}

	if len(rules) == 0 {
		rules = DefaultRules
	}

	c.rules = rules
	c.lastUpdated = time.Now()
	return c.rules
}

// InvalidateCache resets the rule cache to force immediate reload on next evaluation.
func (c *RuleCache) InvalidateCache() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastUpdated = time.Time{}
}

// SelectMetricValue converts rule metric names to actual float64 metric values.
func SelectMetricValue(metric models.Metric, metricName string) (float64, bool) {
	name := strings.ToLower(strings.TrimSpace(metricName))
	switch name {
	case "cpu_usage", "cpu":
		return metric.CPUUsage, true
	case "memory_percent", "memory_usage", "memory", "ram":
		if metric.MemoryPercent != 0 {
			return metric.MemoryPercent, true
		}
		return metric.MemoryUsage, true
	case "disk_percent", "disk_usage", "disk":
		if metric.DiskPercent != 0 {
			return metric.DiskPercent, true
		}
		return metric.DiskUsage, true
	case "latency_ms", "latency":
		return metric.LatencyMs, true
	case "cpu_temperature", "temperature":
		return metric.CPUTemperature, true
	default:
		return 0, false
	}
}

// EvaluateMetrics evaluates incoming telemetry for a given machine against enabled alert rules and intelligent health checkers,
// with automated auto-resolution and deduplication.
func EvaluateMetrics(machine models.Machine, metric models.Metric, optionalInput ...services.SaveMetricInput) error {
	hostname := machine.Hostname
	if hostname == "" {
		hostname = machine.ID.String()
	}

	// 1. Evaluate Dynamic Alert Rules
	rules := globalRuleCache.GetEnabledRules()
	for _, rule := range rules {
		if !rule.IsEnabled {
			continue
		}

		val, ok := SelectMetricValue(metric, rule.Metric)
		if !ok {
			continue
		}

		threshold := rule.Value
		if threshold == 0 {
			threshold = rule.Threshold
		}

		isAlerting := Compare(val, rule.Operator, threshold)

		ruleCopy := rule
		ruleCopy.Value = threshold
		ruleCopy.Threshold = threshold

		if err := ProcessAlertCondition(machine, ruleCopy, val, isAlerting); err != nil {
			log.Printf("[Alert Engine] Error processing alert condition for rule %s: %v", rule.Name, err)
		}
	}

	// 2. Intelligent Linux Health Checkers & Domain Analysis
	var input services.SaveMetricInput
	if len(optionalInput) > 0 {
		input = optionalInput[0]
	} else {
		input = services.SaveMetricInput{
			CPUUsage:       metric.CPUUsage,
			MemoryPercent:  metric.MemoryPercent,
			DiskPercent:    metric.DiskPercent,
			LatencyMs:      metric.LatencyMs,
			CPUTemperature: metric.CPUTemperature,
			CPUCores:       metric.CPUCores,
		}
	}

	generatedAlerts := GenerateLinuxAlerts(machine, metric, input)
	activeGeneratedKeys := make(map[string]bool)

	for i := range generatedAlerts {
		key := fmt.Sprintf("%s:%s:%s",
			strings.ToLower(generatedAlerts[i].Category),
			strings.ToLower(generatedAlerts[i].Type),
			strings.ToLower(generatedAlerts[i].Component),
		)
		activeGeneratedKeys[key] = true

		if err := ProcessGeneratedAlert(machine, &generatedAlerts[i]); err != nil {
			log.Printf("[Alert Engine] Error processing generated alert '%s': %v", generatedAlerts[i].Title, err)
		}
	}

	// 3. Automated Auto-Resolution for Cleared Domain Health Checkers
	if database.DB != nil {
		var activeDomainAlerts []models.LinuxAlert
		// Query active alerts for this machine that originate from health checkers (not user rules)
		nilUUID := uuid.Nil
		database.DB.Where(
			"machine_id = ? AND (rule_id = ? OR rule_id IS NULL) AND LOWER(status) IN ('open', 'active')",
			machine.ID, nilUUID,
		).Find(&activeDomainAlerts)

		now := time.Now()
		for _, activeAlert := range activeDomainAlerts {
			key := fmt.Sprintf("%s:%s:%s",
				strings.ToLower(activeAlert.Category),
				strings.ToLower(activeAlert.Type),
				strings.ToLower(activeAlert.Component),
			)

			// If the alert is no longer generated, metric has normalized -> Auto-resolve!
			if !activeGeneratedKeys[key] {
				resolutionNote := fmt.Sprintf("Auto-resolved: %s telemetry normalized to safe baseline", activeAlert.Category)
				database.DB.Model(&models.LinuxAlert{}).Where("id = ?", activeAlert.ID).Updates(map[string]interface{}{
					"status":          "RESOLVED",
					"resolution_note": resolutionNote,
					"resolved_by":     "System (Auto-Resolved)",
					"resolved_at":     &now,
					"updated_at":      now,
				})

				activeAlert.Status = "RESOLVED"
				activeAlert.ResolutionNote = resolutionNote
				activeAlert.ResolvedBy = "System (Auto-Resolved)"
				activeAlert.ResolvedAt = &now
				activeAlert.UpdatedAt = now

				log.Printf("[Alert Engine] Machine %s Category %s Alert '%s' Result AUTO RESOLVED (Metric Normalized)",
					hostname, activeAlert.Category, activeAlert.Title)

				resolvedAlert := activeAlert
				resolvedAlert.Title = fmt.Sprintf("[RESOLVED] %s", activeAlert.Title)
				resolvedAlert.Description = fmt.Sprintf("Issue resolved on %s: %s telemetry normalized to safe baseline", hostname, activeAlert.Category)
				go services.SendAlert(resolvedAlert)

				// Re-arm email cooldown so any subsequent failure immediately notifies developers
				services.ResetAlertEmailCooldown(activeAlert.MachineID, activeAlert.Category, activeAlert.Title)

				BroadcastAlertPayload(activeAlert, hostname, true)
			}
		}
	}

	return nil
}
