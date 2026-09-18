package models

import (
	"time"

	"github.com/google/uuid"
)

// Organization represents an enterprise tenant organization
type Organization struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name      string    `gorm:"type:varchar(255);not null" json:"name"`
	Slug      string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"slug"`
	Status    string    `gorm:"type:varchar(50);default:'active';index" json:"status"` // active, archived
	OwnerID   uuid.UUID `gorm:"type:uuid;index" json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName returns table name for Organization
func (Organization) TableName() string {
	return "organizations"
}

// OrganizationUser maps user membership and RBAC role inside an organization
type OrganizationUser struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	UserID         uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	Role           string    `gorm:"type:varchar(50);default:'viewer';not null" json:"role"` // owner, admin, operator, viewer, auditor, billing_admin
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns table name for OrganizationUser
func (OrganizationUser) TableName() string {
	return "organization_users"
}

// OrganizationSettings holds tenant white-label branding, policies, and configuration
type OrganizationSettings struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID    uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"organization_id"`
	CompanyName       string    `gorm:"type:varchar(255)" json:"company_name"`
	LogoURL           string    `gorm:"type:varchar(500)" json:"logo_url"`
	Timezone          string    `gorm:"type:varchar(100);default:'UTC'" json:"timezone"`
	Language          string    `gorm:"type:varchar(10);default:'en'" json:"language"`
	Theme             string    `gorm:"type:varchar(20);default:'dark'" json:"theme"`
	EmailSettings     string    `gorm:"type:text" json:"email_settings"`
	AlertPolicies     string    `gorm:"type:text" json:"alert_policies"`
	RetentionPolicies string    `gorm:"type:text" json:"retention_policies"`
	PrimaryColor      string    `gorm:"type:varchar(20);default:'#58a6ff'" json:"primary_color"`
	SidebarColor      string    `gorm:"type:varchar(20);default:'#0d1117'" json:"sidebar_color"`
	CustomDomain      string    `gorm:"type:varchar(255)" json:"custom_domain"`
	FaviconURL        string    `gorm:"type:varchar(500)" json:"favicon_url"`
	LoginBanner       string    `gorm:"type:text" json:"login_banner"`
	LicenseTier       string    `gorm:"type:varchar(50);default:'enterprise'" json:"license_tier"` // trial, community, professional, enterprise
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// TableName returns table name for OrganizationSettings
func (OrganizationSettings) TableName() string {
	return "organization_settings"
}

// OrganizationInvitation manages pending team member email invitations
type OrganizationInvitation struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	Email          string    `gorm:"type:varchar(255);not null;index" json:"email"`
	Role           string    `gorm:"type:varchar(50);default:'operator'" json:"role"`
	InviteToken    string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"invite_token"`
	InvitedBy      string    `gorm:"type:varchar(255)" json:"invited_by"`
	ExpiresAt      time.Time `json:"expires_at"`
	Accepted       bool      `gorm:"default:false" json:"accepted"`
	CreatedAt      time.Time `json:"created_at"`
}

// TableName returns table name for OrganizationInvitation
func (OrganizationInvitation) TableName() string {
	return "organization_invitations"
}

// OrganizationBilling handles SaaS subscription readiness and payment provider state
type OrganizationBilling struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID  uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"organization_id"`
	SubscriptionID  string    `gorm:"type:varchar(255)" json:"subscription_id"`
	Plan            string    `gorm:"type:varchar(50);default:'enterprise'" json:"plan"`         // starter, professional, enterprise
	Status          string    `gorm:"type:varchar(50);default:'active'" json:"status"`           // active, past_due, canceled, trialing
	PaymentProvider string    `gorm:"type:varchar(50);default:'stripe'" json:"payment_provider"` // stripe, razorpay, paypal, aws_marketplace, azure_marketplace
	BillingEmail    string    `gorm:"type:varchar(255)" json:"billing_email"`
	RenewalDate     time.Time `json:"renewal_date"`
	InvoicesJSON    string    `gorm:"type:text" json:"invoices_json"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName returns table name for OrganizationBilling
func (OrganizationBilling) TableName() string {
	return "organization_billing"
}

// OrganizationQuota manages resource consumption limits per tenant
type OrganizationQuota struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"organization_id"`
	MaxMachines    int       `gorm:"default:50" json:"max_machines"` // 0 = unlimited
	MaxUsers       int       `gorm:"default:20" json:"max_users"`    // 0 = unlimited
	MaxStorageGB   int       `gorm:"default:500" json:"max_storage_gb"`
	MaxReports     int       `gorm:"default:100" json:"max_reports"`
	MaxAlerts      int       `gorm:"default:1000" json:"max_alerts"`
	MaxAPICalls    int       `gorm:"default:100000" json:"max_api_calls"`
	RetentionDays  int       `gorm:"default:90" json:"retention_days"`
	MaxProjects    int       `gorm:"default:10" json:"max_projects"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns table name for OrganizationQuota
func (OrganizationQuota) TableName() string {
	return "organization_quotas"
}

// OrganizationSSO configures SAML 2.0 / OIDC / LDAP enterprise SSO for tenant
type OrganizationSSO struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"organization_id"`
	ProviderType   string    `gorm:"type:varchar(50);default:'saml'" json:"provider_type"` // saml, oidc, ldap, google, azure_ad, okta
	Enabled        bool      `gorm:"default:false" json:"enabled"`
	IssuerURL      string    `gorm:"type:varchar(500)" json:"issuer_url"`
	ClientID       string    `gorm:"type:varchar(255)" json:"client_id"`
	ClientSecret   string    `gorm:"type:varchar(500)" json:"client_secret"`
	SSOURL         string    `gorm:"type:varchar(500)" json:"sso_url"`
	Certificate    string    `gorm:"type:text" json:"certificate"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName returns table name for OrganizationSSO
func (OrganizationSSO) TableName() string {
	return "organization_ssos"
}

// OrganizationAuditLog records tenant-scoped administrative events
type OrganizationAuditLog struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	Username       string    `gorm:"type:varchar(255);not null" json:"username"`
	IP             string    `gorm:"type:varchar(50)" json:"ip"`
	Action         string    `gorm:"type:varchar(255);not null" json:"action"`
	Resource       string    `gorm:"type:varchar(255)" json:"resource"`
	Result         string    `gorm:"type:varchar(50);default:'Success'" json:"result"`
	Details        string    `gorm:"type:text" json:"details"`
	CreatedAt      time.Time `json:"created_at"`
}

// TableName returns table name for OrganizationAuditLog
func (OrganizationAuditLog) TableName() string {
	return "organization_audit_logs"
}

// OrganizationAPIKey holds tenant API key credentials
type OrganizationAPIKey struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string     `gorm:"type:varchar(255);not null" json:"name"`
	KeyPrefix      string     `gorm:"type:varchar(20);index;not null" json:"key_prefix"`
	KeyHash        string     `gorm:"type:varchar(255);not null" json:"-"`
	Role           string     `gorm:"type:varchar(50);default:'operator'" json:"role"`
	LastUsedAt     *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// TableName returns table name for OrganizationAPIKey
func (OrganizationAPIKey) TableName() string {
	return "organization_api_keys"
}
