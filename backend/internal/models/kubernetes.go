package models

import (
	"time"

	"github.com/google/uuid"
)

type KubernetesCluster struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ServerID           uuid.UUID `gorm:"type:uuid;index;not null" json:"server_id"`
	Name               string    `gorm:"size:255" json:"name"`
	Version            string    `gorm:"size:100" json:"version"`
	APIVersion         string    `gorm:"size:100" json:"api_version"`
	Provider           string    `gorm:"size:100" json:"provider"`
	Status             string    `gorm:"size:100" json:"status"`
	ClusterID          string    `gorm:"size:255;uniqueIndex" json:"cluster_id"`
	ControlPlaneStatus string    `gorm:"size:100" json:"control_plane_status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type KubernetesNode struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID        uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name             string    `gorm:"size:255;index" json:"name"`
	Role             string    `gorm:"size:100" json:"role"`
	InternalIP       string    `gorm:"size:100" json:"internal_ip"`
	Version          string    `gorm:"size:100" json:"version"`
	CPU              float64   `json:"cpu"`
	Memory           float64   `json:"memory"`
	Disk             float64   `json:"disk"`
	OS               string    `gorm:"size:255" json:"os"`
	Kernel           string    `gorm:"size:255" json:"kernel"`
	ContainerRuntime string    `gorm:"size:255" json:"container_runtime"`
	Status           string    `gorm:"size:100" json:"status"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type KubernetesPod struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID    uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name         string    `gorm:"size:255;index" json:"name"`
	Namespace    string    `gorm:"size:255;index" json:"namespace"`
	Node         string    `gorm:"size:255" json:"node"`
	IP           string    `gorm:"size:100" json:"ip"`
	Status       string    `gorm:"size:100" json:"status"`
	Phase        string    `gorm:"size:100" json:"phase"`
	Reason       string    `gorm:"size:255" json:"reason"`
	CPU          float64   `json:"cpu"`
	Memory       float64   `json:"memory"`
	RestartCount int       `json:"restart_count"`
	Age          string    `gorm:"size:100" json:"age"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type KubernetesDeployment struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID         uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name              string    `gorm:"size:255;index" json:"name"`
	Namespace         string    `gorm:"size:255;index" json:"namespace"`
	DesiredReplicas   int       `json:"desired_replicas"`
	AvailableReplicas int       `json:"available_replicas"`
	UpdatedReplicas   int       `json:"updated_replicas"`
	ReadyReplicas     int       `json:"ready_replicas"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type KubernetesStatefulSet struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID       uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name            string    `gorm:"size:255;index" json:"name"`
	Namespace       string    `gorm:"size:255;index" json:"namespace"`
	DesiredReplicas int       `json:"desired_replicas"`
	ReadyReplicas   int       `json:"ready_replicas"`
	CurrentRevision string    `gorm:"size:255" json:"current_revision"`
	UpdateRevision  string    `gorm:"size:255" json:"update_revision"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type KubernetesDaemonSet struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID       uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name            string    `gorm:"size:255;index" json:"name"`
	Namespace       string    `gorm:"size:255;index" json:"namespace"`
	DesiredReplicas int       `json:"desired_replicas"`
	ReadyReplicas   int       `json:"ready_replicas"`
	Available       int       `json:"available"`
	Misscheduled    int       `json:"misscheduled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type KubernetesService struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID  uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name       string    `gorm:"size:255;index" json:"name"`
	Namespace  string    `gorm:"size:255;index" json:"namespace"`
	Type       string    `gorm:"size:100" json:"type"`
	ClusterIP  string    `gorm:"size:100" json:"cluster_ip"`
	ExternalIP string    `gorm:"size:255" json:"external_ip"`
	Ports      string    `gorm:"size:255" json:"ports"`
	Endpoints  string    `gorm:"size:255" json:"endpoints"`
	Status     string    `gorm:"size:100" json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type KubernetesNamespace struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID   uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Name        string    `gorm:"size:255;index" json:"name"`
	Status      string    `gorm:"size:100" json:"status"`
	PodCount    int       `json:"pod_count"`
	CPUUsage    float64   `json:"cpu_usage"`
	MemoryUsage float64   `json:"memory_usage"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type KubernetesStorage struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID     uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Type          string    `gorm:"size:50" json:"type"` // "PV" or "PVC"
	Name          string    `gorm:"size:255;index" json:"name"`
	Namespace     string    `gorm:"size:255;index" json:"namespace"`
	Capacity      string    `gorm:"size:100" json:"capacity"`
	StorageClass  string    `gorm:"size:255" json:"storage_class"`
	Status        string    `gorm:"size:100" json:"status"`
	ReclaimPolicy string    `gorm:"size:100" json:"reclaim_policy"`
	Requested     string    `gorm:"size:100" json:"requested"`
	Used          string    `gorm:"size:100" json:"used"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type KubernetesEvent struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ClusterID      uuid.UUID `gorm:"type:uuid;index;not null" json:"cluster_id"`
	Namespace      string    `gorm:"size:255;index" json:"namespace"`
	Time           time.Time `gorm:"index" json:"time"`
	Type           string    `gorm:"size:100" json:"type"`
	Reason         string    `gorm:"size:255" json:"reason"`
	Message        string    `gorm:"type:text" json:"message"`
	Source         string    `gorm:"size:255" json:"source"`
	InvolvedObject string    `gorm:"size:255" json:"involved_object"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
