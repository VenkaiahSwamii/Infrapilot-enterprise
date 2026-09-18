package models

import (
	"time"

	"github.com/google/uuid"
)

// BackupRecord represents a stored backup database entry
type BackupRecord struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Type        string     `gorm:"type:varchar(50);index" json:"type"`   // postgresql, qdrant, kubernetes, config, grafana, full
	Status      string     `gorm:"type:varchar(50);index" json:"status"` // pending, running, completed, failed, verified
	Filename    string     `gorm:"type:varchar(255)" json:"filename"`
	Size        int64      `json:"size"`
	Checksum    string     `gorm:"type:varchar(128)" json:"checksum"`
	Compressed  bool       `json:"compressed"`
	Encrypted   bool       `json:"encrypted"`
	StorageType string     `gorm:"type:varchar(50)" json:"storage_type"` // local, s3, minio, azure, gcs, nas
	StoragePath string     `gorm:"type:varchar(500)" json:"storage_path"`
	CreatedAt   time.Time  `gorm:"index" json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	ExpiresAt   *time.Time `gorm:"index" json:"expires_at,omitempty"`
	Error       string     `gorm:"type:text" json:"error,omitempty"`
	Retention   string     `gorm:"type:varchar(50)" json:"retention"` // hourly, daily, weekly, monthly
	Version     string     `gorm:"type:varchar(20)" json:"version"`
	Signed      bool       `json:"signed"`
}

// TableName specifies table for BackupRecord
func (BackupRecord) TableName() string {
	return "backups"
}

// RestoreRecord represents a disaster recovery restore execution record
type RestoreRecord struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	BackupID    string     `gorm:"type:varchar(100);index" json:"backup_id"`
	Type        string     `gorm:"type:varchar(50)" json:"type"`
	Status      string     `gorm:"type:varchar(50);index" json:"status"` // pending, running, completed, failed
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Error       string     `gorm:"type:text" json:"error,omitempty"`
	TriggeredBy string     `gorm:"type:varchar(100)" json:"triggered_by"`
	DurationMs  int64      `json:"duration_ms"`
}

// TableName specifies table for RestoreRecord
func (RestoreRecord) TableName() string {
	return "restores"
}

// DRTestRecord represents a Disaster Recovery drill execution record
type DRTestRecord struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Status      string     `gorm:"type:varchar(50);index" json:"status"` // success, failed, degraded
	PostgresOk  bool       `json:"postgres_ok"`
	QdrantOk    bool       `json:"qdrant_ok"`
	K8sOk       bool       `json:"k8s_ok"`
	AppOk       bool       `json:"app_ok"`
	RtoSeconds  int64      `json:"rto_seconds"`
	RpoSeconds  int64      `json:"rpo_seconds"`
	Details     string     `gorm:"type:text" json:"details"`
}

// TableName specifies table for DRTestRecord
func (DRTestRecord) TableName() string {
	return "dr_tests"
}
