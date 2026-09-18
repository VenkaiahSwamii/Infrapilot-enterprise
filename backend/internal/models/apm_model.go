package models

import (
	"time"

	"github.com/google/uuid"
)

// APIRequest records every individual HTTP request passing through APM middleware
type APIRequest struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	TraceID      uuid.UUID `gorm:"type:uuid;index" json:"trace_id,omitempty"`
	Method       string    `gorm:"size:10;not null;index" json:"method"`
	Endpoint     string    `gorm:"size:255;not null;index" json:"endpoint"`
	StatusCode   int       `gorm:"not null;index" json:"status_code"`
	DurationMs   float64   `gorm:"not null;index" json:"duration_ms"`
	RequestSize  int64     `json:"request_size"`
	ResponseSize int64     `json:"response_size"`
	ClientIP     string    `gorm:"size:45" json:"client_ip"`
	IsSlow       bool      `gorm:"default:false;index" json:"is_slow"`  // >500ms
	IsError      bool      `gorm:"default:false;index" json:"is_error"` // >=400
	CreatedAt    time.Time `gorm:"index;not null" json:"created_at"`
}

func (APIRequest) TableName() string {
	return "api_requests"
}

// ServiceMetric holds aggregated APM metrics per microservice
type ServiceMetric struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ServiceName  string    `gorm:"size:100;not null;index" json:"service_name"`
	AvgLatencyMs float64   `gorm:"not null" json:"avg_latency_ms"`
	P95LatencyMs float64   `gorm:"default:0" json:"p95_latency_ms"`
	RequestCount int64     `gorm:"not null" json:"request_count"`
	ErrorCount   int64     `gorm:"not null" json:"error_count"`
	Throughput   float64   `gorm:"not null" json:"throughput"` // requests/min
	ErrorRate    float64   `gorm:"not null" json:"error_rate"` // percentage
	CreatedAt    time.Time `gorm:"index;not null" json:"created_at"`
}

func (ServiceMetric) TableName() string {
	return "service_metrics"
}
