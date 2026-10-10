package models

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// APIKey represents an enterprise scoped, masked API credential
type APIKey struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string     `gorm:"type:varchar(255);not null" json:"name"`
	KeyPrefix      string     `gorm:"type:varchar(32);index;not null" json:"key_prefix"` // e.g. "sk_live_9f82"
	KeyHash        string     `gorm:"type:varchar(255);not null" json:"-"`               // SHA-256 hash of the full secret
	MaskedKey      string     `gorm:"type:varchar(64);not null" json:"masked_key"`       // "sk_live_9f82...3b1a"
	Scopes         string     `gorm:"type:varchar(500);default:'*'" json:"scopes"`       // comma-separated scopes
	Status         string     `gorm:"type:varchar(50);default:'ACTIVE';index" json:"status"` // ACTIVE, REVOKED, EXPIRED
	LastUsedAt     *time.Time `json:"last_used_at,omitempty"`
	LastUsedIP     string     `gorm:"type:varchar(50)" json:"last_used_ip,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	RevokedAt      *time.Time `json:"revoked_at,omitempty"`
	CreatedAt      time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (APIKey) TableName() string {
	return "api_keys"
}

// HasScope checks if the API key possesses the requested scope or the wildcard '*'
func (k *APIKey) HasScope(requiredScope string) bool {
	if k == nil || k.Status != "ACTIVE" {
		return false
	}
	if k.ExpiresAt != nil && time.Now().UTC().After(*k.ExpiresAt) {
		return false
	}
	if strings.TrimSpace(k.Scopes) == "*" || strings.TrimSpace(k.Scopes) == "all" || strings.TrimSpace(k.Scopes) == "admin:all" {
		return true
	}
	parts := strings.Split(k.Scopes, ",")
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed == requiredScope || trimmed == "*" {
			return true
		}
		// Prefix matching for scoped namespaces (e.g. "metrics:*" matches "metrics:read")
		if strings.HasSuffix(trimmed, ":*") {
			prefix := strings.TrimSuffix(trimmed, ":*")
			if strings.HasPrefix(requiredScope, prefix+":") {
				return true
			}
		}
	}
	return false
}

// IsExpired returns true if the key has an expiration date in the past
func (k *APIKey) IsExpired() bool {
	if k == nil {
		return true
	}
	return k.ExpiresAt != nil && time.Now().UTC().After(*k.ExpiresAt)
}
