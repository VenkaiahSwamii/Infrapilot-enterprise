package models

import (
	"time"

	"github.com/google/uuid"
)

// CloudAccount manages connected AWS, Azure, and GCP enterprise cloud accounts
type CloudAccount struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	Provider       string    `gorm:"index;not null" json:"provider"`   // aws, azure, gcp
	AccountID      string    `gorm:"index;not null" json:"account_id"` // AWS Account ID, Azure Subscription ID, GCP Project ID
	AccountName    string    `json:"account_name"`
	Regions        string    `json:"regions"` // comma-separated regions
	Status         string    `gorm:"default:'connected'" json:"status"`
	TotalVMs       int       `json:"total_vms"`
	TotalClusters  int       `json:"total_clusters"`
	MonthlyCost    float64   `json:"monthly_cost"`
	LastSyncedAt   time.Time `json:"last_synced_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (CloudAccount) TableName() string {
	return "cloud_accounts"
}

// CloudCredential holds encrypted access tokens/keys for cloud APIs
type CloudCredential struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AccountID    uuid.UUID `gorm:"type:uuid;index;not null" json:"account_id"`
	Provider     string    `json:"provider"`
	AccessKeyEnc string    `json:"-"`
	SecretKeyEnc string    `json:"-"`
	RoleARN      string    `json:"role_arn,omitempty"`
	TenantID     string    `json:"tenant_id,omitempty"`
	ClientID     string    `json:"client_id,omitempty"`
	GCPJSONEnc   string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (CloudCredential) TableName() string {
	return "cloud_credentials"
}

// AWSResource stores discovered AWS infrastructure (EC2, EKS, RDS, Lambda, S3, etc.)
type AWSResource struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AccountID      uuid.UUID `gorm:"type:uuid;index" json:"account_id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	ResourceID     string    `gorm:"uniqueIndex" json:"resource_id"`
	ResourceType   string    `gorm:"index" json:"resource_type"` // ec2, ebs, vpc, elb, ecs, eks, rds, lambda, s3
	Name           string    `json:"name"`
	Region         string    `json:"region"`
	State          string    `json:"state"`
	DetailsJSON    string    `gorm:"type:text" json:"details_json"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (AWSResource) TableName() string {
	return "aws_resources"
}

// AzureResource stores discovered Azure infrastructure (VMs, AKS, Azure SQL, Storage, App Service)
type AzureResource struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AccountID      uuid.UUID `gorm:"type:uuid;index" json:"account_id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	ResourceID     string    `gorm:"uniqueIndex" json:"resource_id"`
	ResourceType   string    `gorm:"index" json:"resource_type"` // vm, aks, sql, storage, app_service, vnet
	Name           string    `json:"name"`
	ResourceGroup  string    `json:"resource_group"`
	Region         string    `json:"region"`
	State          string    `json:"state"`
	DetailsJSON    string    `gorm:"type:text" json:"details_json"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (AzureResource) TableName() string {
	return "azure_resources"
}

// GCPResource stores discovered Google Cloud infrastructure (Compute Engine, GKE, Cloud SQL, Storage, Functions)
type GCPResource struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AccountID      uuid.UUID `gorm:"type:uuid;index" json:"account_id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	ResourceID     string    `gorm:"uniqueIndex" json:"resource_id"`
	ResourceType   string    `gorm:"index" json:"resource_type"` // compute, gke, sql, storage, functions, vpc
	Name           string    `json:"name"`
	ProjectID      string    `json:"project_id"`
	Zone           string    `json:"zone"`
	State          string    `json:"state"`
	DetailsJSON    string    `gorm:"type:text" json:"details_json"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (GCPResource) TableName() string {
	return "gcp_resources"
}

// CloudCost tracks monthly cost breakdown by provider and category
type CloudCost struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID  string    `gorm:"index" json:"organization_id"`
	Provider        string    `gorm:"index" json:"provider"` // aws, azure, gcp
	Category        string    `json:"category"`              // compute, storage, network, database
	MonthlySpend    float64   `json:"monthly_spend"`
	ForecastedSpend float64   `json:"forecasted_spend"`
	Currency        string    `gorm:"default:'USD'" json:"currency"`
	PeriodMonth     string    `json:"period_month"` // e.g. 2026-07
	UpdatedAt       time.Time `json:"updated_at"`
}

func (CloudCost) TableName() string {
	return "cloud_costs"
}

// CloudSecurityFinding records CSPM posture risks (public buckets, open security groups, weak IAM)
type CloudSecurityFinding struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	Provider       string    `json:"provider"`
	ResourceID     string    `json:"resource_id"`
	FindingType    string    `json:"finding_type"` // public_s3, open_security_group, unencrypted_disk, weak_iam
	Severity       string    `json:"severity"`     // CRITICAL, HIGH, MEDIUM, LOW
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Remediation    string    `json:"remediation"`
	Status         string    `gorm:"default:'OPEN'" json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

func (CloudSecurityFinding) TableName() string {
	return "cloud_security_findings"
}

// CloudAlert records multi-cloud alert events
type CloudAlert struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"index" json:"organization_id"`
	Provider       string    `json:"provider"`
	ResourceName   string    `json:"resource_name"`
	AlertType      string    `json:"alert_type"` // ec2_down, rds_high_cpu, k8s_node_fail, high_cost, security_risk
	Severity       string    `json:"severity"`
	Message        string    `json:"message"`
	Resolved       bool      `gorm:"default:false" json:"resolved"`
	CreatedAt      time.Time `json:"created_at"`
}

func (CloudAlert) TableName() string {
	return "cloud_alerts"
}

// CloudRegion tracks active regions per provider
type CloudRegion struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Provider   string    `json:"provider"`
	RegionCode string    `json:"region_code"`
	RegionName string    `json:"region_name"`
}

func (CloudRegion) TableName() string {
	return "cloud_regions"
}
