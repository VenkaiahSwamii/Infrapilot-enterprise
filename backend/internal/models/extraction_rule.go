package models

import (
	"time"

	"github.com/google/uuid"
)

// ExtractionRule represents a saved Schema-on-Read dynamic log parser rule
type ExtractionRule struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	Description string    `gorm:"size:500" json:"description"`
	Category    string    `gorm:"size:100;default:'Custom'" json:"category"`
	Source      string    `gorm:"size:100;default:'all'" json:"source"`   // e.g. "nginx", "docker", "auth", "all"
	Service     string    `gorm:"size:100;default:'all'" json:"service"`  // e.g. "nginx", "sshd", "all"
	RuleType    string    `gorm:"size:50;not null" json:"rule_type"`      // "regex", "json", "kv", "delimited", "eval"
	Pattern     string    `gorm:"type:text;not null" json:"pattern"`      // regex pattern, delimiter, or expression
	FieldNames  string    `gorm:"type:text" json:"field_names"`           // comma-separated field names
	SampleLog   string    `gorm:"type:text" json:"sample_log,omitempty"`  // reference log line for validation
	IsEnabled   bool      `gorm:"default:true" json:"is_enabled"`
	IsBuiltin   bool      `gorm:"default:false" json:"is_builtin"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (ExtractionRule) TableName() string {
	return "log_extraction_rules"
}
