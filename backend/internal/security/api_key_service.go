package security

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// HashSecret produces a SHA-256 hex digest of a raw secret key
func HashSecret(rawSecret string) string {
	sum := sha256.Sum256([]byte(rawSecret))
	return hex.EncodeToString(sum[:])
}

// GenerateAPIKey creates a new cryptographic API key and returns the plaintext key (once) along with the DB model
func GenerateAPIKey(name string, orgID uuid.UUID, scopes []string, ttlDays int) (string, *models.APIKey, error) {
	if strings.TrimSpace(name) == "" {
		return "", nil, errors.New("api key name cannot be empty")
	}

	// 24 random bytes -> 48 hex chars
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", nil, fmt.Errorf("failed to generate secure entropy: %w", err)
	}

	randomHex := hex.EncodeToString(bytes)
	rawKey := fmt.Sprintf("sk_live_%s", randomHex)
	prefix := rawKey[:12] // "sk_live_abcd"
	suffix := rawKey[len(rawKey)-4:] // last 4 chars
	masked := fmt.Sprintf("%s...%s", prefix, suffix)

	keyHash := HashSecret(rawKey)

	scopeStr := strings.Join(scopes, ",")
	if len(scopes) == 0 {
		scopeStr = "*"
	}

	now := time.Now().UTC()
	var expiresAt *time.Time
	if ttlDays > 0 {
		exp := now.AddDate(0, 0, ttlDays)
		expiresAt = &exp
	}

	apiKey := &models.APIKey{
		ID:             uuid.New(),
		OrganizationID: orgID,
		Name:           strings.TrimSpace(name),
		KeyPrefix:      prefix,
		KeyHash:        keyHash,
		MaskedKey:      masked,
		Scopes:         scopeStr,
		Status:         "ACTIVE",
		ExpiresAt:      expiresAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	return rawKey, apiKey, nil
}

// ValidateAPIKey validates a raw secret key against the database using constant-time hash comparison
func ValidateAPIKey(rawKey string, db *gorm.DB) (*models.APIKey, error) {
	if strings.TrimSpace(rawKey) == "" {
		return nil, errors.New("empty api key provided")
	}

	keyHash := HashSecret(rawKey)

	var candidate models.APIKey
	if err := db.Where("key_hash = ? AND status = 'ACTIVE'", keyHash).First(&candidate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid or revoked api key")
		}
		return nil, err
	}

	// Double-check with constant time compare
	if subtle.ConstantTimeCompare([]byte(candidate.KeyHash), []byte(keyHash)) != 1 {
		return nil, errors.New("cryptographic key verification failed")
	}

	// Check expiration
	if candidate.IsExpired() {
		candidate.Status = "EXPIRED"
		_ = db.Model(&candidate).Update("status", "EXPIRED")
		return nil, errors.New("api key has expired")
	}

	return &candidate, nil
}

// RevokeAPIKey immediately invalidates an active API key
func RevokeAPIKey(keyID uuid.UUID, db *gorm.DB) error {
	now := time.Now().UTC()
	res := db.Model(&models.APIKey{}).
		Where("id = ? AND status != 'REVOKED'", keyID).
		Updates(map[string]interface{}{
			"status":     "REVOKED",
			"revoked_at": now,
			"updated_at": now,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("api key not found or already revoked")
	}
	return nil
}
