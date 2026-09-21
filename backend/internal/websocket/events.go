package websocket

import (
	"strings"
	"time"
)

// ServerOrgLookup is a callback used to resolve a server's organization ID from other packages
var ServerOrgLookup func(serverID string) (string, error)

type Event struct {
	Event    string      `json:"event"`
	ServerID string      `json:"server_id,omitempty"`
	Room     string      `json:"room,omitempty"`
	Payload  interface{} `json:"payload"`
}

const (
	EventMetricUpdated = "metric.updated"
	EventServerOnline  = "server.online"
	EventServerOffline = "server.offline"
	EventAlertCreated  = "alert.created"
	EventAlertResolved = "alert.resolved"
	EventDockerUpdated = "docker.updated"
	EventK8sUpdated    = "kubernetes.updated"
	EventHeartbeatRecv = "heartbeat.received"
)

// MetricUpdatedPayload defines the strongly-typed payload for metric.updated events
type MetricUpdatedPayload struct {
	Type         string    `json:"type"`
	MachineID    string    `json:"machine_id"`
	Hostname     string    `json:"hostname"`
	OS           string    `json:"os,omitempty"`
	Platform     string    `json:"platform,omitempty"`
	IPAddress    string    `json:"ip_address,omitempty"`
	LatencyMs    float64   `json:"latency_ms,omitempty"`
	CPU          float64   `json:"cpu"`
	CPUUsage     float64   `json:"cpu_usage"`
	Memory       float64   `json:"memory"`
	MemoryUsage  float64   `json:"memory_usage"`
	Disk         float64   `json:"disk"`
	DiskUsage    float64   `json:"disk_usage"`
	Upload       float64   `json:"upload"`
	UploadMbps   float64   `json:"upload_mbps"`
	Download     float64   `json:"download"`
	DownloadMbps float64   `json:"download_mbps"`
	MemoryTotal  uint64    `json:"memory_total,omitempty"`
	MemoryUsed   uint64    `json:"memory_used,omitempty"`
	DiskTotal    uint64    `json:"disk_total,omitempty"`
	DiskUsed     uint64    `json:"disk_used,omitempty"`
	CPUCores     int       `json:"cpu_cores,omitempty"`
	Time         time.Time `json:"time"`
}

// ServerStatusPayload defines the strongly-typed payload for server.online / server.offline events
type ServerStatusPayload struct {
	MachineID string    `json:"machine_id"`
	Hostname  string    `json:"hostname"`
	Status    string    `json:"status"`
	LastSeen  time.Time `json:"last_seen"`
}

// DockerEventPayload defines the strongly-typed payload for docker.event events
type DockerEventPayload struct {
	Time      time.Time `json:"time"`
	Type      string    `json:"type"`
	Action    string    `json:"action"`
	ActorName string    `json:"actor_name"`
	Message   string    `json:"message"`
}

// Enterprise Roles (Sprint 10.2 / RoadMap Priority 4)
const (
	RoleAdmin    = "admin"
	RoleOperator = "operator"
	RoleViewer   = "viewer"
	RoleGuest    = "guest"
	RoleReadOnly = "read-only"
)

// Permission represents specific access privileges in the WS hub
type Permission string

const (
	PermissionViewMetrics     Permission = "view_metrics"
	PermissionViewAlerts      Permission = "view_alerts"
	PermissionDockerEvents    Permission = "docker_events"
	PermissionTerminalAccess  Permission = "terminal_access"
	PermissionExecuteCommands Permission = "execute_commands"
	PermissionOrchestration   Permission = "orchestration"
)

// RolePermissions maps roles to their authorized capabilities (matrix)
var RolePermissions = map[string]map[Permission]bool{
	RoleAdmin: {
		PermissionViewMetrics:     true,
		PermissionViewAlerts:      true,
		PermissionDockerEvents:    true,
		PermissionTerminalAccess:  true,
		PermissionExecuteCommands: true,
		PermissionOrchestration:   true,
	},
	RoleOperator: {
		PermissionViewMetrics:     true,
		PermissionViewAlerts:      true,
		PermissionDockerEvents:    true,
		PermissionTerminalAccess:  true,
		PermissionExecuteCommands: true,
		PermissionOrchestration:   true,
	},
	RoleViewer: {
		PermissionViewMetrics:  true,
		PermissionViewAlerts:   true,
		PermissionDockerEvents: true,
	},
	RoleReadOnly: {
		PermissionViewMetrics: true,
		PermissionViewAlerts:  true,
	},
	RoleGuest: {
		PermissionViewMetrics: true,
	},
}

// HasPermission checks if the client is authorized for a specific capability
func (c *Client) HasPermission(p Permission) bool {
	role := strings.ToLower(c.Role)
	// Admins automatically get all permissions
	if role == RoleAdmin {
		return true
	}
	perms, ok := RolePermissions[role]
	if !ok {
		return false
	}
	return perms[p]
}
