package models

import (
	"time"

	"github.com/google/uuid"
)

// Trace represents an end-to-end distributed execution context for a request
type Trace struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	TraceID     string    `gorm:"index;size:100;not null" json:"trace_id"`
	Name        string    `gorm:"index;not null" json:"name"` // e.g. POST /api/v1/aiops/analyze
	ServiceName string    `gorm:"default:'api-server'" json:"service_name"`
	HTTPMethod  string    `gorm:"size:10" json:"http_method"`
	URLPath     string    `gorm:"size:255" json:"url_path"`
	StatusCode  int       `gorm:"default:200" json:"status_code"`
	DurationMs  int64     `gorm:"index;not null" json:"duration_ms"`
	HasError    bool      `gorm:"default:false" json:"has_error"`
	IsSlow      bool      `gorm:"default:false" json:"is_slow"` // >500ms
	Spans       []Span    `gorm:"foreignKey:TraceID;constraint:OnDelete:CASCADE" json:"spans,omitempty"`
	Timestamp   time.Time `gorm:"index;not null" json:"timestamp"`
	CreatedAt   time.Time `json:"created_at"`
}

func (Trace) TableName() string {
	return "traces"
}

// Span represents an individual unit of work or operation within a Trace
type Span struct {
	ID             uuid.UUID    `gorm:"type:uuid;primaryKey" json:"id"`
	TraceID        uuid.UUID    `gorm:"type:uuid;index;not null" json:"trace_id"`
	SpanID         string       `gorm:"index;size:100;not null" json:"span_id"`
	ParentSpanID   string       `gorm:"size:100" json:"parent_span_id,omitempty"`
	Name           string       `gorm:"not null" json:"name"`    // e.g. DB Query, AI Inference, Auth Verification
	Service        string       `gorm:"not null" json:"service"` // postgres, redis, ai-engine, auth
	DurationMs     int64        `gorm:"not null" json:"duration_ms"`
	StartTime      time.Time    `json:"start_time"`
	EndTime        time.Time    `json:"end_time"`
	AttributesJSON string       `gorm:"type:text" json:"attributes_json,omitempty"`
	Events         []TraceEvent `gorm:"foreignKey:SpanID;constraint:OnDelete:CASCADE" json:"events,omitempty"`
	CreatedAt      time.Time    `json:"created_at"`
}

func (Span) TableName() string {
	return "spans"
}

// TraceEvent represents discrete events or logs emitted within a Span
type TraceEvent struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	SpanID     uuid.UUID `gorm:"type:uuid;index;not null" json:"span_id"`
	Name       string    `gorm:"not null" json:"name"`
	FieldsJSON string    `gorm:"type:text" json:"fields_json,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
}

func (TraceEvent) TableName() string {
	return "trace_events"
}
