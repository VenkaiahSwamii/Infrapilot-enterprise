package models

import (
	"time"

	"github.com/google/uuid"
)

// NetworkCheck represents a configured target to monitor for network availability, latency, or status
type NetworkCheck struct {
	ID                     uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name                   string    `gorm:"not null" json:"name"`
	Type                   string    `gorm:"not null;index" json:"type"` // PING, TCP, DNS, HTTP, UNIX_SOCKET, INTERFACE
	Target                 string    `gorm:"not null" json:"target"`     // hostname, IP, host:port, URL, socket path, interface name
	Host                   string    `json:"host,omitempty"`
	Port                   int       `json:"port,omitempty"`
	URL                    string    `json:"url,omitempty"`
	InterfaceName          string    `json:"interface_name,omitempty"`
	IntervalSeconds        int       `gorm:"default:30" json:"interval_seconds"`
	TimeoutMs              int       `gorm:"default:5000" json:"timeout_ms"`
	ThresholdLatencyMs     float64   `gorm:"default:200" json:"threshold_latency_ms"`
	ThresholdPacketLossPct float64   `gorm:"default:5" json:"threshold_packet_loss_pct"`
	Enabled                bool      `gorm:"default:true;index" json:"enabled"`
	LastStatus             string    `gorm:"default:'UNKNOWN'" json:"last_status"` // HEALTHY, DEGRADED, CRITICAL, UNKNOWN
	LastLatencyMs          float64   `json:"last_latency_ms"`
	LastPacketLossPct      float64   `json:"last_packet_loss_pct"`
	BreachCounter          int       `gorm:"default:0" json:"breach_counter"`
	LastCheckAt            *time.Time `json:"last_check_at,omitempty"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// NetworkMetric stores timestamped metric samples captured during network checks
type NetworkMetric struct {
	ID                  uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	CheckID             uuid.UUID `gorm:"type:uuid;index" json:"check_id"`
	AgentID             string    `gorm:"index" json:"agent_id,omitempty"`
	Hostname            string    `gorm:"index" json:"hostname,omitempty"`
	CheckType           string    `gorm:"index" json:"check_type"`
	Target              string    `json:"target"`
	Status              string    `json:"status"` // HEALTHY, DEGRADED, CRITICAL
	LatencyMs           float64   `json:"latency_ms"`
	PacketLossPct       float64   `json:"packet_loss_pct"`
	DNSTimeMs           float64   `json:"dns_time_ms,omitempty"`
	TCPConnectTimeMs    float64   `json:"tcp_connect_time_ms,omitempty"`
	HTTPResponseTimeMs  float64   `json:"http_response_time_ms,omitempty"`
	BytesReceived       uint64    `json:"bytes_received,omitempty"`
	BytesSent           uint64    `json:"bytes_sent,omitempty"`
	ReceiveRateMBps     float64   `json:"receive_rate_mbps,omitempty"`
	TransmitRateMBps    float64   `json:"transmit_rate_mbps,omitempty"`
	InterfaceStatus     string    `json:"interface_status,omitempty"` // UP, DOWN, UNKNOWN
	Errors              uint64    `json:"errors,omitempty"`
	Drops               uint64    `json:"drops,omitempty"`
	ErrorMessage        string    `json:"error_message,omitempty"`
	CreatedAt           time.Time `gorm:"index" json:"created_at"`
}
