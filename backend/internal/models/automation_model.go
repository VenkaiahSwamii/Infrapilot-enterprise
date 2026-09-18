package models

import (
	"time"

	"github.com/google/uuid"
)

// AutomationRule defines auto-remediation rules (e.g. IF CPU > 95% for 10m THEN Restart Service)
type AutomationRule struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID   string     `gorm:"index" json:"organization_id"`
	Name             string     `gorm:"not null" json:"name"`
	Description      string     `json:"description"`
	TriggerEventType string     `gorm:"index;not null" json:"trigger_event_type"` // high_cpu, low_disk, pod_crash, container_down
	ConditionJSON    string     `gorm:"type:text" json:"condition_json"`
	ActionType       string     `gorm:"not null" json:"action_type"` // restart_service, clean_disk, restart_pod, restart_container
	TargetResource   string     `json:"target_resource"`
	RunbookID        *uuid.UUID `gorm:"type:uuid;index" json:"runbook_id,omitempty"`
	RequiresApproval bool       `gorm:"default:false" json:"requires_approval"`
	Enabled          bool       `gorm:"default:true" json:"enabled"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func (AutomationRule) TableName() string {
	return "automation_rules"
}

// Runbook defines reusable operational procedures (e.g. Restart Nginx, Clear Cache, Rotate Logs)
type Runbook struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	Name           string    `gorm:"not null" json:"name"`
	Description    string    `json:"description"`
	Category       string    `json:"category"` // service, docker, kubernetes, maintenance, database
	StepsJSON      string    `gorm:"type:text" json:"steps_json"`
	Command        string    `gorm:"type:text" json:"command"`
	TargetOs       string    `gorm:"default:'linux'" json:"target_os"`
	TimeoutSec     int       `gorm:"default:60" json:"timeout_sec"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (Runbook) TableName() string {
	return "runbooks"
}

// AutomationRun tracks an execution instance of a rule or runbook
type AutomationRun struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string     `gorm:"index" json:"organization_id"`
	RuleID         *uuid.UUID `gorm:"type:uuid;index" json:"rule_id,omitempty"`
	RunbookID      *uuid.UUID `gorm:"type:uuid;index" json:"runbook_id,omitempty"`
	TriggerSource  string     `json:"trigger_source"` // alert, schedule, manual
	TriggeredBy    string     `json:"triggered_by"`   // system, admin
	TargetHost     string     `json:"target_host"`
	Status         string     `gorm:"default:'RUNNING'" json:"status"` // RUNNING, SUCCESS, FAILED, PENDING_APPROVAL, REJECTED
	Output         string     `gorm:"type:text" json:"output"`
	Error          string     `gorm:"type:text" json:"error"`
	StartedAt      time.Time  `json:"started_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	DurationMs     int64      `json:"duration_ms"`
}

func (AutomationRun) TableName() string {
	return "automation_runs"
}

// AutomationHistory maintains audit trail for completed automation executions
type AutomationHistory struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	RuleName       string    `json:"rule_name"`
	Trigger        string    `json:"trigger"`
	User           string    `json:"user"`
	Action         string    `json:"action"`
	Target         string    `json:"target"`
	StartTime      time.Time `json:"start_time"`
	EndTime        time.Time `json:"end_time"`
	Result         string    `json:"result"` // Success, Failure, Approved, Rejected
	OutputSnippet  string    `gorm:"type:text" json:"output_snippet"`
}

func (AutomationHistory) TableName() string {
	return "automation_history"
}

// ApprovalRequest manages pending approval requests for sensitive actions
type ApprovalRequest struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string     `gorm:"index" json:"organization_id"`
	RunID          uuid.UUID  `gorm:"type:uuid;index;not null" json:"run_id"`
	RuleName       string     `json:"rule_name"`
	Action         string     `json:"action"`
	TargetResource string     `json:"target_resource"`
	RequestedBy    string     `json:"requested_by"`
	Status         string     `gorm:"default:'PENDING'" json:"status"` // PENDING, APPROVED, REJECTED
	Approver       string     `json:"approver,omitempty"`
	Reason         string     `json:"reason,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	RespondedAt    *time.Time `json:"responded_at,omitempty"`
}

func (ApprovalRequest) TableName() string {
	return "approval_requests"
}

// NotificationChannel defines webhook/slack/teams/email destinations for automation alerts
type NotificationChannel struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	Name           string    `json:"name"`
	Type           string    `json:"type"` // slack, teams, discord, email, webhook
	TargetURL      string    `json:"target_url"`
	Enabled        bool      `gorm:"default:true" json:"enabled"`
	CreatedAt      time.Time `json:"created_at"`
}

func (NotificationChannel) TableName() string {
	return "notification_channels"
}
