package repository

import (
	"errors"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type AlertRuleRepository struct{}

func NewAlertRuleRepository() *AlertRuleRepository {
	return &AlertRuleRepository{}
}

func (r *AlertRuleRepository) Create(rule *models.AlertRule) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Create(rule).Error
}

func (r *AlertRuleRepository) Update(rule *models.AlertRule) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Save(rule).Error
}

func (r *AlertRuleRepository) Delete(id uuid.UUID) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Delete(&models.AlertRule{}, id).Error
}

func (r *AlertRuleRepository) GetByID(id uuid.UUID) (*models.AlertRule, error) {
	if database.DB == nil {
		return nil, errors.New("database connection unavailable")
	}
	var rule models.AlertRule
	err := database.DB.First(&rule, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

func (r *AlertRuleRepository) GetAll(org string) ([]models.AlertRule, error) {
	rules := make([]models.AlertRule, 0)
	if database.DB == nil {
		return rules, nil
	}
	query := database.DB.Order("created_at DESC")
	if org != "" && org != "all" {
		query = query.Where("organization_id = ?", org)
	}
	err := query.Find(&rules).Error
	return rules, err
}

func (r *AlertRuleRepository) GetEnabledRules(org string) ([]models.AlertRule, error) {
	rules := make([]models.AlertRule, 0)
	if database.DB == nil {
		return rules, nil
	}
	query := database.DB.Where("is_enabled = ?", true).Order("created_at DESC")
	if org != "" && org != "all" {
		query = query.Where("organization_id = ?", org)
	}
	err := query.Find(&rules).Error
	return rules, err
}

func (r *AlertRuleRepository) GetAllEnabledRules() ([]models.AlertRule, error) {
	rules := make([]models.AlertRule, 0)
	if database.DB == nil {
		return rules, nil
	}
	err := database.DB.Where("is_enabled = ?", true).
		Order("created_at DESC").
		Find(&rules).Error
	return rules, err
}
