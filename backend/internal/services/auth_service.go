package services

import (
	"errors"
	"strings"
	"time"

	"infrapilot/backend/internal/auth"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo *repository.UserRepository
}

func NewAuthService(userRepo *repository.UserRepository) *AuthService {
	return &AuthService{userRepo: userRepo}
}

func (s *AuthService) Register(username, email, password string) (*models.User, error) {
	existingUser, err := s.userRepo.FindByEmail(email)
	if err == nil && existingUser != nil {
		return nil, errors.New("user with this email already exists")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		ID:        uuid.New(),
		Username:  username,
		Email:     email,
		Password:  string(hashedPassword),
		CreatedAt: time.Now(),
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *AuthService) Login(email, password string) (string, string, *models.User, error) {
	cleanEmail := strings.TrimSpace(email)
	user, err := s.userRepo.FindByEmail(cleanEmail)

	// Admin auto-provision / reset fallback for infrapilotadmin@gmail.com and admin@infrapilot.com
	if strings.EqualFold(cleanEmail, "infrapilotadmin@gmail.com") && password == "Admin@123" {
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("Admin@123"), bcrypt.DefaultCost)
		if user == nil {
			adminUser := models.User{
				ID:        uuid.New(),
				Username:  "InfraPilotAdmin",
				Email:     "infrapilotadmin@gmail.com",
				Password:  string(hashedPassword),
				Role:      models.RoleSuperAdmin,
				IsActive:  true,
				CreatedAt: time.Now(),
			}
			if database.DB != nil {
				_ = database.DB.Create(&adminUser).Error
			}
			user = &adminUser
		} else {
			user.Password = string(hashedPassword)
			user.IsActive = true
			if database.DB != nil {
				_ = database.DB.Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{
					"password":  user.Password,
					"is_active": true,
				}).Error
			}
		}
	} else if strings.EqualFold(cleanEmail, "admin@infrapilot.com") || strings.EqualFold(cleanEmail, "admin") {
		if password == "password" {
			hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
			if user == nil {
				adminUser := models.User{
					ID:        uuid.New(),
					Username:  "Admin",
					Email:     "admin@infrapilot.com",
					Password:  string(hashedPassword),
					Role:      models.RoleSuperAdmin,
					IsActive:  true,
					CreatedAt: time.Now(),
				}
				if database.DB != nil {
					_ = database.DB.Create(&adminUser).Error
				}
				user = &adminUser
			} else {
				user.Password = string(hashedPassword)
				user.IsActive = true
				if database.DB != nil {
					_ = database.DB.Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{
						"password":  user.Password,
						"is_active": true,
					}).Error
				}
			}
		}
	}

	if user == nil {
		return "", "", nil, errors.New("invalid email or password")
	}

	if !user.IsActive {
		return "", "", nil, errors.New("user account is deactivated")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return "", "", nil, errors.New("invalid email or password")
	}

	orgID := "default"
	token, err := auth.GenerateToken(user.ID.String(), user.Username, user.Email, user.Role, orgID)
	if err != nil {
		return "", "", nil, err
	}

	refreshToken, err := auth.GenerateRefreshToken(user.ID.String(), user.Username, user.Email, user.Role, orgID)
	if err != nil {
		return "", "", nil, err
	}

	return token, refreshToken, user, nil
}

func (s *AuthService) Refresh(refreshTokenStr string) (string, string, error) {
	claims, err := auth.ValidateToken(refreshTokenStr)
	if err != nil {
		return "", "", errors.New("invalid or expired refresh token")
	}

	accessToken, err := auth.GenerateToken(claims.UserID, claims.Username, claims.Email, claims.Role, claims.OrganizationID)
	if err != nil {
		return "", "", err
	}

	newRefreshToken, err := auth.GenerateRefreshToken(claims.UserID, claims.Username, claims.Email, claims.Role, claims.OrganizationID)
	if err != nil {
		return "", "", err
	}

	return accessToken, newRefreshToken, nil
}

func (s *AuthService) GetProfile(userID uuid.UUID) (*models.User, error) {
	return s.userRepo.FindByID(userID)
}
