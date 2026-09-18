package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/cache"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type UserRegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type UserLoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type UpdateRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req UserRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.authService.Register(req.Username, req.Email, req.Password)
	if err != nil {
		utils.LogAudit(req.Username, uuid.Nil, "Register user", "Failure: "+err.Error())
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	utils.LogAudit(req.Username, uuid.Nil, "Register user", "Success")
	c.JSON(http.StatusCreated, gin.H{
		"message": "Registration Successful",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req UserLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if cache.IsAccountLocked(req.Email) {
		utils.LogAudit(req.Email, uuid.Nil, "Login", "Failure: Account Locked")
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "Account is temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.",
		})
		return
	}

	token, refreshToken, user, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		count, _ := cache.RecordFailedLogin(req.Email)
		utils.LogAudit(req.Email, uuid.Nil, "Login", "Failure")
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":           err.Error(),
			"failed_attempts": count,
		})
		return
	}

	cache.ResetFailedLogins(req.Email)
	utils.LogAudit(user.Username, uuid.Nil, "Login", "Success")

	c.JSON(http.StatusOK, gin.H{
		"token":         token,
		"refresh_token": refreshToken,
		"user":          user.Username,
		"user_id":       user.ID.String(),
		"email":         user.Email,
	})
}

type TokenRefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req TokenRefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, refreshToken, err := h.authService.Refresh(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":         token,
		"refresh_token": refreshToken,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	username := c.GetString("username")
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		_ = cache.RevokeToken(tokenStr, 24*time.Hour)
	}

	utils.LogAudit(username, uuid.Nil, "Logout", "Success")
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	h.Profile(c)
}

func (h *AuthHandler) Profile(c *gin.Context) {
	userIDStr := c.GetString("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID format"})
		return
	}

	user, err := h.authService.GetProfile(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":               user.ID,
		"username":         user.Username,
		"email":            user.Email,
		"role":             user.Role,
		"allowed_machines": user.AllowedMachines,
		"allowed_modules":  user.AllowedModules,
		"is_active":        user.IsActive,
	})
}

func (h *AuthHandler) ListUsers(c *gin.Context) {
	var users []models.User
	if err := database.DB.Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list users"})
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *AuthHandler) DeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID format"})
		return
	}
	actor := c.GetString("username")
	if err := database.DB.Delete(&models.User{}, userID).Error; err != nil {
		utils.LogAudit(actor, uuid.Nil, "Delete user: "+idStr, "Failure")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}
	utils.LogAudit(actor, uuid.Nil, "Delete user: "+idStr, "Success")
	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}

func (h *AuthHandler) UpdateUserRole(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	var req UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User not found",
		})
		return
	}

	user.Role = req.Role
	if err := database.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update role",
		})
		return
	}

	actor := c.GetString("username")
	utils.LogAudit(actor, uuid.Nil, "Update role for user "+idStr+" to "+req.Role, "Success")
	c.JSON(http.StatusOK, gin.H{
		"message": "Role updated successfully",
		"user":    user,
	})
}

type UpdatePermissionsRequest struct {
	Role            string `json:"role"`
	AllowedMachines string `json:"allowed_machines"`
	AllowedModules  string `json:"allowed_modules"`
	IsActive        *bool  `json:"is_active"`
}

func (h *AuthHandler) UpdateUserPermissions(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	var req UpdatePermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User not found",
		})
		return
	}

	if req.Role != "" {
		user.Role = req.Role
	}
	if req.AllowedMachines != "" {
		user.AllowedMachines = req.AllowedMachines
	}
	if req.AllowedModules != "" {
		user.AllowedModules = req.AllowedModules
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update permissions",
		})
		return
	}

	actor := c.GetString("username")
	utils.LogAudit(actor, uuid.Nil, fmt.Sprintf("Updated permissions for user %s: role=%s, machines=%s, modules=%s", idStr, user.Role, user.AllowedMachines, user.AllowedModules), "Success")
	c.JSON(http.StatusOK, gin.H{
		"message": "Permissions updated successfully",
		"user":    user,
	})
}

func (h *AuthHandler) ToggleUserStatus(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User not found",
		})
		return
	}

	user.IsActive = !user.IsActive
	database.DB.Save(&user)

	actor := c.GetString("username")
	status := "deactivated"
	if user.IsActive {
		status = "activated"
	}
	utils.LogAudit(actor, uuid.Nil, "Toggle user status: "+idStr+" "+status, "Success")
	c.JSON(http.StatusOK, gin.H{
		"status": user.IsActive,
	})
}

type PasswordResetRequestInput struct {
	Email string `json:"email" binding:"required,email"`
}

type PasswordResetConfirmInput struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

func (h *AuthHandler) RequestPasswordReset(c *gin.Context) {
	var req PasswordResetRequestInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var count int64
	database.DB.Table("users").Where("email = ?", req.Email).Count(&count)
	if count == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "If the email exists, a reset token has been sent"})
		return
	}

	token := uuid.New().String()
	rClient := cache.GetRedisClient()
	if rClient != nil {
		ctx := context.Background()
		rClient.Set(ctx, "password_reset_token:"+token, req.Email, 15*time.Minute)
	}

	utils.LogAudit(req.Email, uuid.Nil, "Password reset request initiated", "Success")

	c.JSON(http.StatusOK, gin.H{
		"message": "Password reset token generated successfully",
		"token":   token,
	})
}

func (h *AuthHandler) ConfirmPasswordReset(c *gin.Context) {
	var req PasswordResetConfirmInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rClient := cache.GetRedisClient()
	if rClient == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Redis client not available"})
		return
	}

	ctx := context.Background()
	email, err := rClient.Get(ctx, "password_reset_token:"+req.Token).Result()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired reset token"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := database.DB.Table("users").Where("email = ?", email).Update("password", string(hashedPassword)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	rClient.Del(ctx, "password_reset_token:"+req.Token)

	utils.LogAudit(email, uuid.Nil, "Password reset completed", "Success")

	c.JSON(http.StatusOK, gin.H{"message": "Password has been reset successfully"})
}
