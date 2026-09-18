package models

import (
	"time"

	"github.com/google/uuid"
)

// AnomalyRecord represents a detected telemetry anomaly
type AnomalyRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	MachineID      string    `gorm:"type:varchar(100);index" json:"machine_id"`
	Hostname       string    `gorm:"type:varchar(255)" json:"hostname"`
	MetricName     string    `gorm:"type:varchar(100);index" json:"metric_name"`
	ObservedValue  float64   `json:"observed_value"`
	ExpectedValue  float64   `json:"expected_value"`
	ZScore         float64   `json:"z_score"`
	Severity       string    `gorm:"type:varchar(50)" json:"severity"`                  // warning, critical
	Status         string    `gorm:"type:varchar(50);default:'detected'" json:"status"` // detected, investigating, resolved
	Details        string    `gorm:"type:text" json:"details"`
	DetectedAt     time.Time `gorm:"index" json:"detected_at"`
}

// TableName returns table name for AnomalyRecord
func (AnomalyRecord) TableName() string {
	return "aiops_anomalies"
}

// PredictionRecord represents a predicted infrastructure failure
type PredictionRecord struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID  string    `gorm:"type:varchar(100);index" json:"organization_id"`
	MachineID       string    `gorm:"type:varchar(100);index" json:"machine_id"`
	Hostname        string    `gorm:"type:varchar(255)" json:"hostname"`
	FailureType     string    `gorm:"type:varchar(100)" json:"failure_type"` // disk_full, memory_exhaustion, db_capacity
	PredictedTime   time.Time `json:"predicted_time"`
	TimeWindowHours int       `json:"time_window_hours"`
	ConfidenceScore int       `json:"confidence_score"` // 0-100%
	Severity        string    `gorm:"type:varchar(50)" json:"severity"`
	Details         string    `gorm:"type:text" json:"details"`
	CreatedAt       time.Time `json:"created_at"`
}

// TableName returns table name for PredictionRecord
func (PredictionRecord) TableName() string {
	return "aiops_predictions"
}

// CapacityForecastRecord stores resource capacity projections
type CapacityForecastRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	ResourceType   string    `gorm:"type:varchar(100);index" json:"resource_type"` // cpu, ram, storage, network, k8s_nodes
	CurrentUsage   float64   `json:"current_usage"`
	Forecast7D     float64   `json:"forecast_7d"`
	Forecast30D    float64   `json:"forecast_30d"`
	Forecast90D    float64   `json:"forecast_90d"`
	Recommendation string    `gorm:"type:text" json:"recommendation"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns table name for CapacityForecastRecord
func (CapacityForecastRecord) TableName() string {
	return "aiops_forecasts"
}

// RootCauseRecord stores root cause analysis causality graphs
type RootCauseRecord struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID  string    `gorm:"type:varchar(100);index" json:"organization_id"`
	IncidentID      string    `gorm:"type:varchar(100);index" json:"incident_id"`
	RootCause       string    `gorm:"type:varchar(255)" json:"root_cause"`
	CausalChainJSON string    `gorm:"type:text" json:"causal_chain_json"`
	Confidence      int       `json:"confidence"`
	CreatedAt       time.Time `json:"created_at"`
}

// TableName returns table name for RootCauseRecord
func (RootCauseRecord) TableName() string {
	return "aiops_root_causes"
}

// AIRecommendationRecord stores actionable remediation suggestions
type AIRecommendationRecord struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID   string    `gorm:"type:varchar(100);index" json:"organization_id"`
	MachineID        string    `gorm:"type:varchar(100);index" json:"machine_id"`
	Hostname         string    `gorm:"type:varchar(255)" json:"hostname"`
	Title            string    `gorm:"type:varchar(255)" json:"title"`
	Description      string    `gorm:"type:text" json:"description"`
	Priority         string    `gorm:"type:varchar(50)" json:"priority"`   // low, medium, high, critical
	RiskLevel        string    `gorm:"type:varchar(50)" json:"risk_level"` // low, medium, high
	EstimatedImpact  string    `gorm:"type:varchar(255)" json:"estimated_impact"`
	SuggestedCommand string    `gorm:"type:text" json:"suggested_command"`
	Status           string    `gorm:"type:varchar(50);default:'pending'" json:"status"` // pending, approved, executed, dismissed
	CreatedAt        time.Time `json:"created_at"`
}

// TableName returns table name for AIRecommendationRecord
func (AIRecommendationRecord) TableName() string {
	return "aiops_recommendations"
}

// SLARecord stores availability and SLA metrics
type SLARecord struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID  string    `gorm:"type:varchar(100);index" json:"organization_id"`
	Period          string    `gorm:"type:varchar(50);index" json:"period"` // daily, monthly
	AvailabilityPct float64   `json:"availability_pct"`
	AvgResponseMs   float64   `json:"avg_response_ms"`
	MTTRSeconds     int64     `json:"mttr_seconds"`
	MTBFSeconds     int64     `json:"mtbf_seconds"`
	IncidentsCount  int       `json:"incidents_count"`
	CreatedAt       time.Time `json:"created_at"`
}

// TableName returns table name for SLARecord
func (SLARecord) TableName() string {
	return "aiops_sla_records"
}

// SecurityAnalyticRecord stores security threat intelligence events
type SecurityAnalyticRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	EventType      string    `gorm:"type:varchar(100);index" json:"event_type"` // brute_force, unauthorized_login, suspicious_process, privilege_escalation
	Severity       string    `gorm:"type:varchar(50)" json:"severity"`
	SourceIP       string    `gorm:"type:varchar(50)" json:"source_ip"`
	Hostname       string    `gorm:"type:varchar(255)" json:"hostname"`
	Details        string    `gorm:"type:text" json:"details"`
	DetectedAt     time.Time `json:"detected_at"`
}

// TableName returns table name for SecurityAnalyticRecord
func (SecurityAnalyticRecord) TableName() string {
	return "aiops_security_records"
}

// CostOptimizationRecord stores cloud/infra cost reduction recommendations
type CostOptimizationRecord struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID   string    `gorm:"type:varchar(100);index" json:"organization_id"`
	ResourceName     string    `gorm:"type:varchar(255)" json:"resource_name"`
	ResourceType     string    `gorm:"type:varchar(100)" json:"resource_type"` // vm, k8s_node, pvc, docker_container
	Issue            string    `gorm:"type:varchar(255)" json:"issue"`         // underutilized, idle, oversized, unused
	SuggestedAction  string    `gorm:"type:text" json:"suggested_action"`
	EstimatedSavings float64   `json:"estimated_savings"` // in local currency
	CreatedAt        time.Time `json:"created_at"`
}

// TableName returns table name for CostOptimizationRecord
func (CostOptimizationRecord) TableName() string {
	return "aiops_cost_records"
}
