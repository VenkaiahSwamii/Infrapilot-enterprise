package services

import (
	"testing"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

func TestAlertRuleService_EvaluateRule(t *testing.T) {
	svc := NewAlertRuleService()

	rule := &models.AlertRule{
		ID:        uuid.New(),
		Name:      "High CPU Test",
		Metric:    "cpu_usage",
		Operator:  ">",
		Threshold: 90.0,
		Value:     90.0,
		IsEnabled: true,
	}

	if !svc.EvaluateRule(rule, 95.0) {
		t.Errorf("Expected rule to evaluate true for value 95.0 > 90.0")
	}

	if svc.EvaluateRule(rule, 85.0) {
		t.Errorf("Expected rule to evaluate false for value 85.0 > 90.0")
	}

	// Disabled rule should never evaluate true
	rule.IsEnabled = false
	if svc.EvaluateRule(rule, 99.0) {
		t.Errorf("Expected disabled rule to evaluate false")
	}
}

func TestAlertRuleService_Operators(t *testing.T) {
	svc := NewAlertRuleService()

	tests := []struct {
		operator  string
		threshold float64
		value     float64
		want      bool
	}{
		{">", 80, 85, true},
		{">", 80, 80, false},
		{">=", 80, 80, true},
		{"<", 50, 40, true},
		{"<", 50, 50, false},
		{"<=", 50, 50, true},
		{"==", 100, 100, true},
		{"==", 100, 101, false},
		{"!=", 100, 101, true},
		{"!=", 100, 100, false},
	}

	for _, tt := range tests {
		rule := &models.AlertRule{
			Operator:  tt.operator,
			Threshold: tt.threshold,
			IsEnabled: true,
		}
		got := svc.EvaluateRule(rule, tt.value)
		if got != tt.want {
			t.Errorf("EvaluateRule(op=%s, threshold=%.1f, value=%.1f) = %v; want %v",
				tt.operator, tt.threshold, tt.value, got, tt.want)
		}
	}
}

func TestAlertRuleService_ValidateRuleFields(t *testing.T) {
	svc := NewAlertRuleService()

	// Valid metric and operator
	if err := svc.validateRuleFields("cpu_usage", ">", "critical"); err != nil {
		t.Errorf("Expected valid rule fields to pass, got: %v", err)
	}

	// Valid newly expanded metrics
	if err := svc.validateRuleFields("packet_loss", ">", "warning"); err != nil {
		t.Errorf("Expected packet_loss to be valid metric, got: %v", err)
	}
	if err := svc.validateRuleFields("upload_mbps", ">", "warning"); err != nil {
		t.Errorf("Expected upload_mbps to be valid metric, got: %v", err)
	}
	if err := svc.validateRuleFields("download_mbps", "<", "critical"); err != nil {
		t.Errorf("Expected download_mbps to be valid metric, got: %v", err)
	}

	// Invalid metric
	if err := svc.validateRuleFields("bogus_metric", ">", "critical"); err == nil {
		t.Errorf("Expected bogus_metric to return ErrInvalidMetric")
	}

	// Invalid operator
	if err := svc.validateRuleFields("cpu_usage", "LIKE", "critical"); err == nil {
		t.Errorf("Expected invalid operator to return ErrInvalidOperator")
	}

	// Invalid severity
	if err := svc.validateRuleFields("cpu_usage", ">", "catastrophic"); err == nil {
		t.Errorf("Expected invalid severity to return ErrInvalidSeverity")
	}
}

func TestAlertRuleService_RuleChangedCallback(t *testing.T) {
	called := false
	RegisterRuleChangedCallback(func() {
		called = true
	})

	notifyRuleChanged()
	if !called {
		t.Errorf("Expected RegisterRuleChangedCallback hook to be invoked on notifyRuleChanged()")
	}
}
