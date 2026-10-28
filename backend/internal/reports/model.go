package reports

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ReportType string

const (
	ReportTypeInfrastructureSummary ReportType = "infrastructure_summary"
	ReportTypeMachineHealth         ReportType = "machine_health"
	ReportTypeCPUUsage              ReportType = "cpu_usage"
	ReportTypeMemoryUsage           ReportType = "memory_usage"
	ReportTypeDiskUsage             ReportType = "disk_usage"
	ReportTypeDockerStatus          ReportType = "docker_status"
	ReportTypeKubernetesStatus      ReportType = "kubernetes_status"
	ReportTypeAlerts                ReportType = "alerts"
	ReportTypeSecurityEvents        ReportType = "security_events"
	ReportTypeInventory             ReportType = "inventory"
)

type ReportStatus string

const (
	ReportStatusPending    ReportStatus = "pending"
	ReportStatusGenerating ReportStatus = "generating"
	ReportStatusCompleted  ReportStatus = "completed"
	ReportStatusFailed     ReportStatus = "failed"
)

type ReportSchedule string

const (
	ReportScheduleNone    ReportSchedule = "none"
	ReportScheduleDaily   ReportSchedule = "daily"
	ReportScheduleWeekly  ReportSchedule = "weekly"
	ReportScheduleMonthly ReportSchedule = "monthly"
)

type Report struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	Name        string         `gorm:"not null" json:"name"`
	Type        ReportType     `gorm:"not null" json:"type"`
	GeneratedBy uuid.UUID      `gorm:"type:uuid;not null" json:"generated_by"`
	GeneratedAt time.Time      `gorm:"not null" json:"generated_at"`
	FilePath    string         `gorm:"not null" json:"file_path"`
	Status      ReportStatus   `gorm:"not null;default:'pending'" json:"status"`
	Format      string         `gorm:"not null" json:"format"` // pdf, excel, csv
	Schedule    ReportSchedule `gorm:"not null;default:'none'" json:"schedule"`
	FileSize    string         `gorm:"type:varchar" json:"file_size"`
	RowCount    int64          `gorm:"type:bigint" json:"row_count"`
	Scope       string         `gorm:"type:varchar" json:"scope"`
	DateFrom    *time.Time     `json:"date_from"`
	DateTo      *time.Time     `json:"date_to"`
	MachineIDs  []byte         `gorm:"type:jsonb" json:"machine_ids"` // JSON array of UUIDs
	Filters     []byte         `gorm:"type:jsonb" json:"filters"`     // JSON object of filters
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (r *Report) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

type ReportFilter struct {
	MachineIDs []uuid.UUID `json:"machine_ids,omitempty"`
	DateFrom   *time.Time  `json:"date_from,omitempty"`
	DateTo     *time.Time  `json:"date_to,omitempty"`
	Severity   string      `json:"severity,omitempty"`
	Status     string      `json:"status,omitempty"`
	Category   string      `json:"category,omitempty"`
}

type GenerateReportRequest struct {
	Name       string         `json:"name" binding:"required"`
	Type       ReportType     `json:"type" binding:"required"`
	Format     string         `json:"format" binding:"required,oneof=pdf excel csv xlsx PDF EXCEL CSV XLSX"`
	Schedule   ReportSchedule `json:"schedule"`
	Scope      string         `json:"scope"`
	DateFrom   *time.Time     `json:"date_from"`
	DateTo     *time.Time     `json:"date_to"`
	MachineIDs []uuid.UUID    `json:"machine_ids"`
	Filters    *ReportFilter  `json:"filters"`
}

type ScheduleReportRequest struct {
	Name       string         `json:"name" binding:"required"`
	Type       ReportType     `json:"type" binding:"required"`
	Format     string         `json:"format" binding:"required,oneof=pdf excel csv xlsx PDF EXCEL CSV XLSX"`
	Schedule   ReportSchedule `json:"schedule" binding:"required,oneof=daily weekly monthly DAILY WEEKLY MONTHLY"`
	Scope      string         `json:"scope"`
	DateFrom   *time.Time     `json:"date_from"`
	DateTo     *time.Time     `json:"date_to"`
	MachineIDs []uuid.UUID    `json:"machine_ids"`
	Filters    *ReportFilter  `json:"filters"`
}
