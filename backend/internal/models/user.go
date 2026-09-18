package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	RoleSuperAdmin = "SuperAdmin"
	RoleAdmin      = "Admin"
	RoleOrgAdmin   = "OrgAdmin"
	RoleDevOps     = "DevOps"
	RoleOperator   = "Operator"
	RoleViewer     = "Viewer"
)

type User struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Username  string    `gorm:"size:100;unique;not null" json:"username"`
	Email     string    `gorm:"size:255;unique;not null" json:"email"`
	Password  string    `gorm:"not null" json:"-"`
	Role      string    `gorm:"size:50;not null;default:'Viewer'" json:"role"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	if u.Role == "" {
		var count int64
		// Set to Admin if it is the first registered user
		if err := tx.Session(&gorm.Session{}).Model(&User{}).Count(&count).Error; err == nil && count == 0 {
			u.Role = "Admin"
		} else {
			u.Role = "Viewer"
		}
	}
	return nil
}
