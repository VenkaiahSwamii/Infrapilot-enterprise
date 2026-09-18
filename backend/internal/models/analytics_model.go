package models

import (
	"time"

	"github.com/google/uuid"
)

// AnalyticsSnapshot stores periodic aggregated infrastructure health and metrics
type AnalyticsSnapshot struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID    string    `gorm:"index" json:"organization_id"`
	Timestamp         time.Time `gorm:"index" json:"timestamp"`
	AvgCPUPercent     float64   `json:"avg_cpu_percent"`
	AvgMemoryPercent  float64   `json:"avg_memory_percent"`
	AvgDiskPercent    float64   `json:"avg_disk_percent"`
	NetworkInBytes    int64     `json:"network_in_bytes"`
	NetworkOutBytes   int64     `json:"network_out_bytes"`
	TotalServers      int       `json:"total_servers"`
	OnlineServers     int       `json:"online_servers"`
	OfflineServers    int       `json:"offline_servers"`
	AlertsCount       int       `json:"alerts_count"`
	CriticalIncidents int       `json:"critical_incidents"`
	AvailabilityPct   float64   `json:"availability_pct"`
	CreatedAt         time.Time `json:"created_at"`
}

func (AnalyticsSnapshot) TableName() string {
	return "analytics_snapshots"
}

// CapacityPrediction holds capacity forecasting and saturation projections
type CapacityPrediction struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID    string    `gorm:"index" json:"organization_id"`
	ResourceType      string    `json:"resource_type"` // disk, cpu, memory, node
	CurrentUsagePct   float64   `json:"current_usage_pct"`
	PredictedUsagePct float64   `json:"predicted_usage_pct"`
	PredictionDays    int       `json:"prediction_days"`
	EstimatedFullDate time.Time `json:"estimated_full_date"`
	RecommendedAction string    `json:"recommended_action"`
	CreatedAt         time.Time `json:"created_at"`
}

func (CapacityPrediction) TableName() string {
	return "capacity_predictions"
}

// SLAReport records uptime, downtime, MTTR, and MTBF tracking per tenant
type SLAReport struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID    string    `gorm:"index" json:"organization_id"`
	Period            string    `json:"period"` // daily, weekly, monthly, quarterly
	AvailabilityPct   float64   `json:"availability_pct"`
	UptimeMinutes     float64   `json:"uptime_minutes"`
	DowntimeMinutes   float64   `json:"downtime_minutes"`
	MTTRMinutes       float64   `json:"mttr_minutes"`
	MTBFDays          float64   `json:"mtbf_days"`
	IncidentsCount    int       `json:"incidents_count"`
	ScoreAvailability float64   `json:"score_availability"`
	ScorePerformance  float64   `json:"score_performance"`
	ScoreSecurity     float64   `json:"score_security"`
	ScoreReliability  float64   `json:"score_reliability"`
	OverallScore      float64   `json:"overall_score"`
	CreatedAt         time.Time `json:"created_at"`
}

func (SLAReport) TableName() string {
	return "sla_reports"
}

// ScheduledReport defines recurring automated PDF/Excel/CSV report jobs
type ScheduledReport struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string     `gorm:"index" json:"organization_id"`
	Name           string     `json:"name"`
	ReportType     string     `json:"report_type"` // summary, incident, compliance, k8s, docker
	Format         string     `json:"format"`      // pdf, excel, csv
	Frequency      string     `json:"frequency"`   // daily, weekly, monthly
	Recipients     string     `json:"recipients"`  // comma-separated emails
	Enabled        bool       `gorm:"default:true" json:"enabled"`
	LastRunAt      *time.Time `json:"last_run_at,omitempty"`
	NextRunAt      time.Time  `json:"next_run_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

func (ScheduledReport) TableName() string {
	return "scheduled_reports"
}

// GeneratedReport records generated report artifacts available for download
type GeneratedReport struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	Name           string    `json:"name"`
	Type           string    `json:"type"`
	Format         string    `json:"format"`
	FilePath       string    `json:"file_path"`
	FileSize       int64     `json:"file_size"`
	GeneratedBy    string    `json:"generated_by"`
	Status         string    `gorm:"default:'completed'" json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

func (GeneratedReport) TableName() string {
	return "generated_reports"
}

// IncidentStatistic records root causes and resolution stats for incident analytics
type IncidentStatistic struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	ServerID       string    `json:"server_id"`
	ServerName     string    `json:"server_name"`
	RootCause      string    `json:"root_cause"`
	Severity       string    `json:"severity"`
	ResolutionTime int       `json:"resolution_time"` // in seconds
	OccurredAt     time.Time `json:"occurred_at"`
	ResolvedAt     time.Time `json:"resolved_at"`
}

func (IncidentStatistic) TableName() string {
	return "incident_statistics"
}

// PerformanceHistory stores continuous time-series metrics data
type PerformanceHistory struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	ServerID       string    `gorm:"index" json:"server_id"`
	Timestamp      time.Time `gorm:"index" json:"timestamp"`
	CPUUsage       float64   `json:"cpu_usage"`
	MemoryUsage    float64   `json:"memory_usage"`
	DiskUsage      float64   `json:"disk_usage"`
	NetworkIn      int64     `json:"network_in"`
	NetworkOut     int64     `json:"network_out"`
}

func (PerformanceHistory) TableName() string {
	return "performance_history"
}

// ExecutiveDashboardConfig configures tenant executive widget layouts
type ExecutiveDashboardConfig struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"uniqueIndex" json:"organization_id"`
	WidgetLayout   string    `gorm:"type:text" json:"widget_layout"`
	Theme          string    `gorm:"default:'dark'" json:"theme"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (ExecutiveDashboardConfig) TableName() string {
	return "executive_dashboards"
}
