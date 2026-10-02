package models

import (
	"time"

	"github.com/google/uuid"
)

// SyntheticTest defines an automated synthetic HTTP/API probe test configuration
type SyntheticTest struct {
	ID                      uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Name                    string     `gorm:"size:255;not null" json:"name"`
	URL                     string     `gorm:"size:1024;not null" json:"url"`
	Method                  string     `gorm:"size:20;default:'GET'" json:"method"`
	Headers                 string     `gorm:"type:text" json:"headers,omitempty"` // JSON serialized map
	Body                    string     `gorm:"type:text" json:"body,omitempty"`
	ExpectedStatus          int        `gorm:"default:200" json:"expected_status"`
	ResponseTimeThresholdMs float64    `gorm:"default:200" json:"response_time_threshold_ms"`
	TimeoutMs               int        `gorm:"default:5000" json:"timeout_ms"`
	IntervalSeconds         int        `gorm:"default:30" json:"interval_seconds"`
	ValidationContains      string     `gorm:"size:512" json:"validation_contains,omitempty"`
	Enabled                 bool       `gorm:"default:true" json:"enabled"`
	LastStatus              string     `gorm:"size:20;default:'UNKNOWN'" json:"last_status"`
	LastResponseTimeMs      float64    `json:"last_response_time_ms"`
	LastCheckedAt           *time.Time `json:"last_checked_at,omitempty"`
	AvailabilityPct         float64    `gorm:"default:100.0" json:"availability_pct"`
	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at"`
}

func (SyntheticTest) TableName() string {
	return "synthetic_tests"
}

// SyntheticTestResult records a single execution result of a synthetic probe
type SyntheticTestResult struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	TestID             uuid.UUID `gorm:"type:uuid;index;not null" json:"test_id"`
	Timestamp          time.Time `gorm:"index;not null" json:"timestamp"`
	Status             string    `gorm:"size:20;index;not null" json:"status"` // PASS, DEGRADED, FAIL, TIMEOUT, ERROR
	HTTPStatus         int       `json:"http_status"`
	ResponseTimeMs     float64   `json:"response_time_ms"`
	DNSTimeMs          float64   `json:"dns_time_ms"`
	TLSTimeMs          float64   `json:"tls_time_ms"`
	TTFBMs             float64   `json:"ttfb_ms"`
	ErrorMessage       string    `gorm:"type:text" json:"error_message,omitempty"`
	ValidationPassed   bool      `json:"validation_passed"`
	ResponseSizeBytes  int64     `json:"response_size_bytes"`
	TargetURL          string    `gorm:"size:1024" json:"target_url"`
	Method             string    `gorm:"size:20" json:"method"`
}

func (SyntheticTestResult) TableName() string {
	return "synthetic_test_results"
}
