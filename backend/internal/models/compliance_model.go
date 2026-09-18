package models

import (
	"time"

	"github.com/google/uuid"
)

// PolicyRuleRecord defines Attribute-Based Access Control (ABAC) rules
type PolicyRuleRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	RuleName       string    `gorm:"type:varchar(255);not null" json:"rule_name"`
	Effect         string    `gorm:"type:varchar(20);default:'ALLOW'" json:"effect"` // ALLOW, DENY
	RolePattern    string    `gorm:"type:varchar(100)" json:"role_pattern"`
	ResourceType   string    `gorm:"type:varchar(100);index" json:"resource_type"`
	ActionPattern  string    `gorm:"type:varchar(100)" json:"action_pattern"`
	ConditionsJSON string    `gorm:"type:text" json:"conditions_json"` // ABAC attributes json
	Enabled        bool      `gorm:"default:true" json:"enabled"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns table name for PolicyRuleRecord
func (PolicyRuleRecord) TableName() string {
	return "policy_rules"
}

// MFASettingRecord stores user Multi-Factor Authentication TOTP configuration
type MFASettingRecord struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"user_id"`
	TOTPSecret  string    `gorm:"type:varchar(255)" json:"-"`
	MFAEnabled  bool      `gorm:"default:false" json:"mfa_enabled"`
	Method      string    `gorm:"type:varchar(50);default:'totp'" json:"method"` // totp, webauthn
	BackupCodes string    `gorm:"type:text" json:"-"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName returns table name for MFASettingRecord
func (MFASettingRecord) TableName() string {
	return "user_mfa_settings"
}

// ImmutableAuditRecord records cryptographically signed audit trail logs
type ImmutableAuditRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	UserID         string    `gorm:"type:varchar(100);index" json:"user_id"`
	Username       string    `gorm:"type:varchar(255)" json:"username"`
	Action         string    `gorm:"type:varchar(255);index" json:"action"`
	ResourceType   string    `gorm:"type:varchar(100)" json:"resource_type"`
	ResourceID     string    `gorm:"type:varchar(255)" json:"resource_id"`
	SourceIP       string    `gorm:"type:varchar(50)" json:"source_ip"`
	HMACSignature  string    `gorm:"type:varchar(255);not null" json:"hmac_signature"`
	TamperDetected bool      `gorm:"default:false" json:"tamper_detected"`
	DetailsJSON    string    `gorm:"type:text" json:"details_json"`
	CreatedAt      time.Time `gorm:"index" json:"created_at"`
}

// TableName returns table name for ImmutableAuditRecord
func (ImmutableAuditRecord) TableName() string {
	return "immutable_audit_logs"
}

// CertificateRecord tracks TLS & Internal CA certificate lifecycles
type CertificateRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	CommonName     string    `gorm:"type:varchar(255);not null" json:"common_name"`
	Issuer         string    `gorm:"type:varchar(255)" json:"issuer"`
	SerialNumber   string    `gorm:"type:varchar(255)" json:"serial_number"`
	ValidFrom      time.Time `json:"valid_from"`
	ValidTo        time.Time `json:"valid_to"`
	AutoRenew      bool      `gorm:"default:true" json:"auto_renew"`
	Status         string    `gorm:"type:varchar(50);default:'active'" json:"status"` // active, expiring_soon, expired
	CreatedAt      time.Time `json:"created_at"`
}

// TableName returns table name for CertificateRecord
func (CertificateRecord) TableName() string {
	return "certificates"
}

// ComplianceFrameworkRecord stores ISO 27001, SOC 2, CIS, NIST, HIPAA readiness scores
type ComplianceFrameworkRecord struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID  string    `gorm:"type:varchar(100);index" json:"organization_id"`
	FrameworkName   string    `gorm:"type:varchar(100);index" json:"framework_name"` // iso27001, soc2, cis, nist_csf, pci_dss, hipaa
	ScorePct        float64   `json:"score_pct"`
	PassingControls int       `json:"passing_controls"`
	TotalControls   int       `json:"total_controls"`
	Status          string    `gorm:"type:varchar(50)" json:"status"` // compliant, non_compliant, audit_pending
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName returns table name for ComplianceFrameworkRecord
func (ComplianceFrameworkRecord) TableName() string {
	return "compliance_frameworks"
}

// SecretVaultRecord handles HashiCorp Vault / Key Vault integration status
type SecretVaultRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID string    `gorm:"type:varchar(100);index" json:"organization_id"`
	Provider       string    `gorm:"type:varchar(50);default:'hashicorp_vault'" json:"provider"` // hashicorp_vault, aws_secrets, azure_keyvault, gcp_secrets
	VaultURL       string    `gorm:"type:varchar(500)" json:"vault_url"`
	RotationDays   int       `gorm:"default:90" json:"rotation_days"`
	LastRotatedAt  time.Time `json:"last_rotated_at"`
	Status         string    `gorm:"type:varchar(50);default:'connected'" json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

// TableName returns table name for SecretVaultRecord
func (SecretVaultRecord) TableName() string {
	return "secret_vaults"
}
