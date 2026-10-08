package models

import (
	"time"

	"github.com/google/uuid"
)

type DockerHost struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ServerID      uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"server_id"`
	DockerVersion string    `gorm:"size:100" json:"docker_version"`
	EngineVersion string    `gorm:"size:100" json:"engine_version"`
	APIVersion    string    `gorm:"size:100" json:"api_version"`
	HostOS        string    `gorm:"size:255" json:"host_os"`
	DockerRootDir string    `gorm:"size:500" json:"docker_root_dir"`
	Containers    int       `json:"containers"`
	Images        int       `json:"images"`
	Volumes       int       `json:"volumes"`
	Networks      int       `json:"networks"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type DockerContainer struct {
	ID           string    `gorm:"size:64;primaryKey" json:"id"`
	ServerID     uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"server_id"`
	Name         string    `gorm:"size:255;index" json:"name"`
	Image        string    `gorm:"size:255" json:"image"`
	Status       string    `gorm:"size:100" json:"status"`
	State        string    `gorm:"size:50" json:"state"`
	CPUPercent   float64   `json:"cpu_percent"`
	MemoryUsed   uint64    `json:"memory_used"`
	MemoryLimit  uint64    `json:"memory_limit"`
	MemoryPct    float64   `json:"memory_percent"`
	NetworkIn    uint64    `json:"network_in"`
	NetworkOut   uint64    `json:"network_out"`
	DiskRead     uint64    `json:"disk_read"`
	DiskWrite    uint64    `json:"disk_write"`
	PIDs         int       `json:"pids"`
	RestartCount int       `json:"restart_count"`
	Uptime       string    `gorm:"size:100" json:"uptime"`
	CreatedTime  time.Time `json:"created_time"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type DockerImage struct {
	ID          string    `gorm:"size:128;primaryKey" json:"id"`
	ServerID    uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"server_id"`
	Name        string    `gorm:"size:255;index" json:"name"`
	Tag         string    `gorm:"size:100" json:"tag"`
	Size        int64     `json:"size"`
	IsUnused    bool      `json:"is_unused"`
	CreatedTime time.Time `json:"created_time"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type DockerVolume struct {
	Name       string    `gorm:"size:255;primaryKey" json:"name"`
	ServerID   uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"server_id"`
	Driver     string    `gorm:"size:100" json:"driver"`
	MountPoint string    `gorm:"size:500" json:"mount_point"`
	UsageBytes int64     `json:"usage_bytes"`
	LimitBytes int64     `json:"limit_bytes"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type DockerNetwork struct {
	ID                  string    `gorm:"size:128;primaryKey" json:"id"`
	ServerID            uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"server_id"`
	Name                string    `gorm:"size:255;index" json:"name"`
	Driver              string    `gorm:"size:100" json:"driver"`
	Scope               string    `gorm:"size:100" json:"scope"`
	ConnectedContainers string    `gorm:"type:text" json:"connected_containers"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type DockerEvent struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ServerID  uuid.UUID `gorm:"type:uuid;index;not null" json:"server_id"`
	Time      time.Time `gorm:"index" json:"time"`
	Type      string    `gorm:"size:100" json:"type"`
	Action    string    `gorm:"size:100" json:"action"`
	ActorID   string    `gorm:"size:128" json:"actor_id"`
	ActorName string    `gorm:"size:255" json:"actor_name"`
	Message   string    `gorm:"type:text" json:"message"`
}
