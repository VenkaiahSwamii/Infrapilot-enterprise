package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"

	"github.com/google/uuid"
)

var (
	ErrRuleNotFound    = errors.New("alert rule not found")
	ErrInvalidMetric   = errors.New("invalid metric")
	ErrInvalidOperator = errors.New("invalid operator")
	ErrInvalidSeverity = errors.New("invalid severity")
	ErrDuplicateName   = errors.New("alert rule with same name already exists")
)

var ruleChangedCallbacks []func()

// RegisterRuleChangedCallback allows alert engine components to hook into rule changes for immediate cache refresh.
func RegisterRuleChangedCallback(fn func()) {
	if fn != nil {
		ruleChangedCallbacks = append(ruleChangedCallbacks, fn)
	}
}

func notifyRuleChanged() {
	for _, fn := range ruleChangedCallbacks {
		if fn != nil {
			fn()
		}
	}
}

type AlertRuleService struct {
	repo *repository.AlertRuleRepository
}

func NewAlertRuleService() *AlertRuleService {
	return &AlertRuleService{
		repo: repository.NewAlertRuleRepository(),
	}
}

var allowedMetrics = map[string]bool{
	"cpu_usage":       true,
	"cpu":             true,
	"memory_percent":  true,
	"memory_usage":    true,
	"memory":          true,
	"disk_percent":    true,
	"disk_usage":      true,
	"disk":            true,
	"latency_ms":      true,
	"latency":         true,
	"cpu_temperature": true,
	"temperature":     true,
	"packet_loss":     true,
	"disk_read_bps":   true,
	"disk_write_bps":  true,
	"upload_mbps":     true,
	"download_mbps":   true,
}

var allowedOperators = map[string]bool{
	">":  true,
	">=": true,
	"<":  true,
	"<=": true,
	"==": true,
	"!=": true,
}

var allowedSeverities = map[string]bool{
	"critical": true,
	"major":    true,
	"warning":  true,
	"info":     true,
}

type CreateRuleRequest struct {
	OrganizationID      string  `json:"organization_id"`
	Name                string  `json:"name" binding:"required"`
	Metric              string  `json:"metric" binding:"required"`
	Operator            string  `json:"operator" binding:"required"`
	Threshold           float64 `json:"threshold"`
	Value               float64 `json:"value"`
	Severity            string  `json:"severity" binding:"required"`
	Enabled             bool    `json:"enabled"`
	TargetScope         string  `json:"target_scope"`
	TargetMachineID     string  `json:"target_machine_id"`
	TargetOS            string  `json:"target_os"`
	ConsecutiveBreaches int     `json:"consecutive_breaches"`
}

type UpdateRuleRequest struct {
	Name                string  `json:"name"`
	Metric              string  `json:"metric"`
	Operator            string  `json:"operator"`
	Threshold           float64 `json:"threshold"`
	Value               float64 `json:"value"`
	Severity            string  `json:"severity"`
	Enabled             *bool   `json:"enabled"`
	TargetScope         string  `json:"target_scope"`
	TargetMachineID     *string `json:"target_machine_id"`
	TargetOS            string  `json:"target_os"`
	ConsecutiveBreaches int     `json:"consecutive_breaches"`
}

func (s *AlertRuleService) validateRuleFields(metric, operator, severity string) error {
	if !allowedMetrics[strings.ToLower(metric)] {
		return ErrInvalidMetric
	}
	if !allowedOperators[operator] {
		return ErrInvalidOperator
	}
	sev := strings.ToLower(severity)
	if sev == "major" {
		sev = "warning"
	}
	if !allowedSeverities[sev] {
		return ErrInvalidSeverity
	}
	return nil
}

func (s *AlertRuleService) CreateRule(req CreateRuleRequest) (*models.AlertRule, error) {
	threshold := req.Threshold
	if threshold == 0 && req.Value != 0 {
		threshold = req.Value
	}
	req.Threshold = threshold

	if err := s.validateRuleFields(req.Metric, req.Operator, req.Severity); err != nil {
		return nil, err
	}

	if req.OrganizationID == "" {
		req.OrganizationID = "default"
	}

	existing, _ := s.repo.GetAll(req.OrganizationID)
	for _, r := range existing {
		if strings.EqualFold(r.Name, req.Name) {
			return nil, ErrDuplicateName
		}
	}

	sev := strings.ToLower(req.Severity)
	if sev == "major" {
		sev = "warning"
	}

	scope := strings.ToLower(strings.TrimSpace(req.TargetScope))
	if scope == "" {
		scope = "all"
	}

	breaches := req.ConsecutiveBreaches
	if breaches <= 0 {
		breaches = 2
	}

	var targetMachineUUID *uuid.UUID
	if req.TargetMachineID != "" && req.TargetMachineID != "null" {
		if u, err := uuid.Parse(req.TargetMachineID); err == nil && u != uuid.Nil {
			targetMachineUUID = &u
		}
	}

	rule := &models.AlertRule{
		ID:                  uuid.New(),
		OrganizationID:      req.OrganizationID,
		Name:                req.Name,
		Metric:              strings.ToLower(req.Metric),
		Operator:            req.Operator,
		Threshold:           threshold,
		Value:               threshold,
		Severity:            sev,
		IsEnabled:           req.Enabled,
		TargetScope:         scope,
		TargetMachineID:     targetMachineUUID,
		TargetOS:            strings.ToLower(strings.TrimSpace(req.TargetOS)),
		ConsecutiveBreaches: breaches,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	if err := s.repo.Create(rule); err != nil {
		return nil, err
	}

	notifyRuleChanged()
	return rule, nil
}

func (s *AlertRuleService) GetRule(id uuid.UUID) (*models.AlertRule, error) {
	return s.repo.GetByID(id)
}

func (s *AlertRuleService) UpdateRule(id uuid.UUID, req UpdateRuleRequest) (*models.AlertRule, error) {
	rule, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrRuleNotFound
	}

	if req.Name != "" {
		existing, _ := s.repo.GetAll(rule.OrganizationID)
		for _, r := range existing {
			if r.ID != id && strings.EqualFold(r.Name, req.Name) {
				return nil, ErrDuplicateName
			}
		}
		rule.Name = req.Name
	}

	if req.Metric != "" {
		rule.Metric = strings.ToLower(req.Metric)
	}
	if req.Operator != "" {
		rule.Operator = req.Operator
	}
	if req.Severity != "" {
		sev := strings.ToLower(req.Severity)
		if sev == "major" {
			sev = "warning"
		}
		rule.Severity = sev
	}
	if req.Enabled != nil {
		rule.IsEnabled = *req.Enabled
	}
	if req.Threshold != 0 {
		rule.Threshold = req.Threshold
		rule.Value = req.Threshold
	} else if req.Value != 0 {
		rule.Threshold = req.Value
		rule.Value = req.Value
	}
	if req.TargetScope != "" {
		rule.TargetScope = strings.ToLower(strings.TrimSpace(req.TargetScope))
	}
	if req.TargetMachineID != nil {
		idStr := *req.TargetMachineID
		if idStr != "" && idStr != "null" {
			if u, err := uuid.Parse(idStr); err == nil && u != uuid.Nil {
				rule.TargetMachineID = &u
			}
		} else {
			rule.TargetMachineID = nil
		}
	}
	if req.TargetOS != "" {
		rule.TargetOS = strings.ToLower(strings.TrimSpace(req.TargetOS))
	}
	if req.ConsecutiveBreaches > 0 {
		rule.ConsecutiveBreaches = req.ConsecutiveBreaches
	}

	if err := s.validateRuleFields(rule.Metric, rule.Operator, rule.Severity); err != nil {
		return nil, err
	}

	rule.UpdatedAt = time.Now()
	if err := s.repo.Update(rule); err != nil {
		return nil, err
	}

	notifyRuleChanged()
	return rule, nil
}

func (s *AlertRuleService) DeleteRule(id uuid.UUID) error {
	_, err := s.repo.GetByID(id)
	if err != nil {
		return ErrRuleNotFound
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	notifyRuleChanged()
	return nil
}

func (s *AlertRuleService) EnableRule(id uuid.UUID) (*models.AlertRule, error) {
	rule, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrRuleNotFound
	}

	if rule.IsEnabled {
		return rule, nil
	}

	rule.IsEnabled = true
	rule.UpdatedAt = time.Now()
	if err := s.repo.Update(rule); err != nil {
		return nil, err
	}
	notifyRuleChanged()
	return rule, nil
}

func (s *AlertRuleService) DisableRule(id uuid.UUID) (*models.AlertRule, error) {
	rule, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrRuleNotFound
	}

	if !rule.IsEnabled {
		return rule, nil
	}

	rule.IsEnabled = false
	rule.UpdatedAt = time.Now()
	if err := s.repo.Update(rule); err != nil {
		return nil, err
	}
	notifyRuleChanged()
	return rule, nil
}

func (s *AlertRuleService) ListRules(org string) ([]models.AlertRule, error) {
	rules, err := s.repo.GetAll(org)
	if err != nil {
		return nil, err
	}
	return rules, nil
}

// SeedPresets provisions standard enterprise alert rules idempotently.
func (s *AlertRuleService) SeedPresets(org string) ([]models.AlertRule, error) {
	if org == "" {
		org = "default"
	}

	presets := []CreateRuleRequest{
		{
			OrganizationID:      org,
			Name:                "Critical CPU Overload",
			Metric:              "cpu_usage",
			Operator:            ">",
			Threshold:           90.0,
			Severity:            "critical",
			Enabled:             true,
			TargetScope:         "all",
			ConsecutiveBreaches: 2,
		},
		{
			OrganizationID:      org,
			Name:                "High Memory Usage",
			Metric:              "memory_percent",
			Operator:            ">",
			Threshold:           85.0,
			Severity:            "warning",
			Enabled:             true,
			TargetScope:         "all",
			ConsecutiveBreaches: 2,
		},
		{
			OrganizationID:      org,
			Name:                "Disk Space Exhaustion",
			Metric:              "disk_percent",
			Operator:            ">",
			Threshold:           90.0,
			Severity:            "critical",
			Enabled:             true,
			TargetScope:         "all",
			ConsecutiveBreaches: 2,
		},
		{
			OrganizationID:      org,
			Name:                "Network Latency Degradation",
			Metric:              "latency_ms",
			Operator:            ">",
			Threshold:           200.0,
			Severity:            "warning",
			Enabled:             true,
			TargetScope:         "all",
			ConsecutiveBreaches: 2,
		},
		{
			OrganizationID:      org,
			Name:                "Severe Packet Loss",
			Metric:              "packet_loss",
			Operator:            ">",
			Threshold:           15.0,
			Severity:            "critical",
			Enabled:             true,
			TargetScope:         "all",
			ConsecutiveBreaches: 2,
		},
	}

	existing, _ := s.repo.GetAll(org)
	existingNames := make(map[string]bool)
	for _, r := range existing {
		existingNames[strings.ToLower(r.Name)] = true
	}

	var created []models.AlertRule
	for _, p := range presets {
		if existingNames[strings.ToLower(p.Name)] {
			continue
		}
		rule, err := s.CreateRule(p)
		if err == nil && rule != nil {
			created = append(created, *rule)
		}
	}

	return created, nil
}

func (s *AlertRuleService) EvaluateRule(rule *models.AlertRule, value float64) bool {
	if !rule.IsEnabled {
		return false
	}

	threshold := rule.Threshold
	if threshold == 0 && rule.Value != 0 {
		threshold = rule.Value
	}

	switch rule.Operator {
	case ">":
		return value > threshold
	case ">=":
		return value >= threshold
	case "<":
		return value < threshold
	case "<=":
		return value <= threshold
	case "==":
		return value == threshold
	case "!=":
		return value != threshold
	default:
		return false
	}
}

func (s *AlertRuleService) CheckAlerts(machineID uuid.UUID, metrics map[string]float64) {
	var rules []models.AlertRule
	var err error
	if database.DB != nil {
		var m models.Machine
		if err := database.DB.Select("organization").Where("id = ?", machineID).First(&m).Error; err == nil && m.Organization != "" {
			rules, _ = s.repo.GetEnabledRules(m.Organization)
		}
	}
	if len(rules) == 0 {
		rules, err = s.repo.GetAllEnabledRules()
	}
	if err != nil || len(rules) == 0 {
		return
	}

	for _, rule := range rules {
		// Filter by target machine if rule is machine-scoped
		scope := strings.ToLower(strings.TrimSpace(rule.TargetScope))
		if (scope == "machine" || scope == "server") && rule.TargetMachineID != nil && *rule.TargetMachineID != machineID {
			continue
		}

		value, ok := metrics[rule.Metric]
		if !ok {
			continue
		}

		if s.EvaluateRule(&rule, value) {
			threshold := rule.Threshold
			if threshold == 0 && rule.Value != 0 {
				threshold = rule.Value
			}

			if database.DB != nil {
				var existing models.LinuxAlert
				if err := database.DB.Where("machine_id = ? AND (rule_id = ? OR title = ?) AND (status = 'ACTIVE' OR status = 'OPEN')", machineID, rule.ID, rule.Name).First(&existing).Error; err == nil {
					// Update existing alert timestamp and metric value without creating duplicates
					database.DB.Model(&models.LinuxAlert{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
						"metric_value": value,
						"updated_at":   time.Now(),
					})
					continue
				}
			}

			alert := models.LinuxAlert{
				ID:          uuid.New(),
				MachineID:   machineID,
				Type:        rule.Name,
				Title:       rule.Name,
				Category:    rule.Metric,
				Severity:    rule.Severity,
				Priority:    models.MapSeverityToPriority(rule.Severity),
				Message:     fmt.Sprintf("%s breached threshold: %.2f", rule.Name, value),
				Status:      "ACTIVE",
				RuleID:      rule.ID,
				MetricValue: value,
				Threshold:   threshold,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}

			if database.DB != nil {
				database.DB.Create(&alert)
			}
			SendAlert(alert)
		}
	}
}
