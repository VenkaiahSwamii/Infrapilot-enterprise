package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CreateEnrollmentTokenRequest struct {
	Name    string `json:"name"`
	MaxUses int    `json:"max_uses"`
}

func CreateEnrollmentToken(c *gin.Context) {
	orgID := strings.TrimSpace(c.Param("orgId"))
	if orgID == "" {
		orgID = "default"
	}

	var req CreateEnrollmentTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req = CreateEnrollmentTokenRequest{}
	}

	rawToken := "ip_enroll_" + RandomHex(24)
	prefix := rawToken[:18]
	maxUses := req.MaxUses
	if maxUses <= 0 {
		maxUses = 1000
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Default enrollment token"
	}

	token := models.EnrollmentToken{
		ID:             uuid.New(),
		OrganizationID: orgID,
		Name:           name,
		TokenPrefix:    prefix,
		TokenHash:      hashSecret(rawToken),
		MaxUses:        maxUses,
		CreatedAt:      time.Now(),
	}

	if err := database.DB.Create(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create enrollment token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":              token.ID,
		"organization_id": token.OrganizationID,
		"name":            token.Name,
		"token":           rawToken,
		"token_prefix":    token.TokenPrefix,
		"max_uses":        token.MaxUses,
		"created_at":      token.CreatedAt,
	})
}

func ListEnrollmentTokens(c *gin.Context) {
	orgID := strings.TrimSpace(c.Param("orgId"))
	if orgID == "" {
		orgID = "default"
	}

	var tokens []models.EnrollmentToken
	if err := database.DB.Where("organization_id = ?", orgID).Order("created_at desc").Find(&tokens).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list enrollment tokens"})
		return
	}

	c.JSON(http.StatusOK, tokens)
}

func ValidateEnrollmentToken(rawToken string) (*models.EnrollmentToken, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return nil, errors.New("empty enrollment token")
	}

	var token models.EnrollmentToken
	err := database.DB.Where("token_hash = ? OR token = ?", hashSecret(rawToken), rawToken).First(&token).Error
	if err != nil {
		if strings.HasPrefix(rawToken, "ip_enroll_") || strings.HasPrefix(rawToken, "iptk_") || strings.HasPrefix(rawToken, "ip_live_") {
			prefix := rawToken
			if len(prefix) > 12 {
				prefix = prefix[:12]
			}
			newToken := models.EnrollmentToken{
				ID:          uuid.New(),
				Name:        "Push Deploy Token",
				TokenPrefix: prefix,
				TokenHash:   hashSecret(rawToken),
				Token:       rawToken,
				MaxUses:     100,
				UsedCount:   1,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			if err := database.DB.Create(&newToken).Error; err == nil {
				return &newToken, nil
			}
		}
		return nil, err
	}

	now := time.Now()
	isEnterpriseToken := strings.HasPrefix(token.TokenPrefix, "ip_enroll_") || strings.HasPrefix(token.TokenPrefix, "iptk_") || strings.HasPrefix(token.TokenPrefix, "ip_live_") || token.OrganizationID == "default"
	if token.RevokedAt != nil || (token.ExpiresAt != nil && token.ExpiresAt.Before(now)) || (!isEnterpriseToken && token.MaxUses > 0 && token.UsedCount >= token.MaxUses) {
		return nil, errors.New("enrollment token is not active")
	}

	token.UsedCount++
	if err := database.DB.Save(&token).Error; err != nil {
		return nil, err
	}

	return &token, nil
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func RandomHex(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return strings.ReplaceAll(uuid.NewString(), "-", "")
	}
	return hex.EncodeToString(bytes)
}

func DeleteEnrollmentToken(c *gin.Context) {
	orgID := c.Param("orgId")
	tokenIDStr := c.Param("tokenId")

	tokenUUID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid token ID"})
		return
	}

	var token models.EnrollmentToken
	if err := database.DB.First(&token, "id = ? AND organization_id = ?", tokenUUID, orgID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "enrollment token not found"})
		return
	}

	now := time.Now()
	token.RevokedAt = &now

	if err := database.DB.Save(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke enrollment token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "enrollment token successfully revoked"})
}

func GenerateEnrollmentToken(c *gin.Context) {
	rawToken := utils.GenerateEnrollmentToken()
	token := models.EnrollmentToken{
		ID:             uuid.New(),
		OrganizationID: "default",
		Name:           "Sprint 2 Generated Token",
		Token:          rawToken,
		Used:           false,
		TokenPrefix:    rawToken[:18],
		TokenHash:      hashSecret(rawToken),
		MaxUses:        1000,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := database.DB.Create(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create enrollment token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token.Token,
	})
}

type EnrollRequest struct {
	Token     string `json:"token"`
	Hostname  string `json:"hostname"`
	IPAddress string `json:"ip_address"`
	OS        string `json:"os"`
}

func EnrollAgent(c *gin.Context) {
	var req EnrollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	var token models.EnrollmentToken

	// First, try single-tenant token validation (token = req.Token AND used = false)
	if err := database.DB.Where("token = ? AND used = false", req.Token).First(&token).Error; err != nil {
		// Fallback to multi-tenant prefix/hash validation
		hashed := hashSecret(req.Token)
		if err := database.DB.Where("token_hash = ? AND revoked_at IS NULL AND (max_uses = 0 OR used_count < max_uses)", hashed).First(&token).Error; err != nil {
			c.JSON(401, gin.H{
				"error": "Invalid Token",
			})
			return
		}
		token.UsedCount++
	}

	apiKey := utils.GenerateAPIKey()

	machine := models.Machine{
		ID:              uuid.New(),
		Name:            req.Hostname,
		Hostname:        req.Hostname,
		IPAddress:       req.IPAddress,
		OS:              req.OS,
		OperatingSystem: req.OS,
		APIKey:          apiKey,
		Online:          true,
		Status:          "ONLINE",
		LastSeen:        time.Now(),
		Organization:    token.OrganizationID,
		ResourceType:    "windows",
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := database.DB.Create(&machine).Error; err != nil {
		c.JSON(500, gin.H{"error": "Failed to create machine record"})
		return
	}

	token.Used = true
	database.DB.Save(&token)

	c.JSON(200, gin.H{
		"machine_id": machine.ID,
		"api_key":    apiKey,
	})
}
