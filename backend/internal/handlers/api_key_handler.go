package handlers

import (
	"net/http"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/security"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type APIKeyHandler struct{}

func NewAPIKeyHandler() *APIKeyHandler {
	return &APIKeyHandler{}
}

type CreateAPIKeyRequest struct {
	Name           string   `json:"name" binding:"required"`
	OrganizationID string   `json:"organization_id"`
	Scopes         []string `json:"scopes"`
	TTLDays        int      `json:"ttl_days"`
}

// ListAPIKeys returns all API keys for the organization with masked secret values
func (h *APIKeyHandler) ListAPIKeys(c *gin.Context) {
	var keys []models.APIKey
	query := database.DB.Order("created_at desc")

	orgIDStr := c.Query("organization_id")
	if orgIDStr != "" {
		if orgUUID, err := uuid.Parse(orgIDStr); err == nil {
			query = query.Where("organization_id = ?", orgUUID)
		}
	}

	if err := query.Find(&keys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list api keys", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"api_keys": keys, "count": len(keys)})
}

// CreateAPIKey generates a new scoped API key and returns the raw secret key ONCE
func (h *APIKeyHandler) CreateAPIKey(c *gin.Context) {
	var req CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	var orgID uuid.UUID
	if req.OrganizationID != "" {
		if parsed, err := uuid.Parse(req.OrganizationID); err == nil {
			orgID = parsed
		}
	}
	if orgID == uuid.Nil {
		orgID = uuid.New()
	}

	rawKey, record, err := security.GenerateAPIKey(req.Name, orgID, req.Scopes, req.TTLDays)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to generate api key", "details": err.Error()})
		return
	}

	if err := database.DB.Create(record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store api key", "details": err.Error()})
		return
	}

	// Return raw secret key ONLY on creation
	c.JSON(http.StatusCreated, gin.H{
		"message":   "API key generated successfully. Store this secret key securely; it will not be displayed again.",
		"secret_key": rawKey,
		"api_key":   record,
	})
}

// RevokeAPIKey immediately revokes an API key
func (h *APIKeyHandler) RevokeAPIKey(c *gin.Context) {
	idStr := c.Param("id")
	keyID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid api key id"})
		return
	}

	if err := security.RevokeAPIKey(keyID, database.DB); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to revoke api key", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "API key revoked successfully", "id": keyID})
}
