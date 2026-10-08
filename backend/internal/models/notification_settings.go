package models

import "time"

// NotificationSettings stores dynamic SMTP and notification routing configuration
type NotificationSettings struct {
	ID                          uint      `gorm:"primaryKey" json:"id"`
	Enabled                     bool      `gorm:"default:true" json:"enabled"`
	SMTPHost                    string    `json:"smtp_host"`
	SMTPPort                    int       `gorm:"default:587" json:"smtp_port"`
	SMTPUser                    string    `json:"smtp_user"`
	SMTPPassword                string    `json:"smtp_password"`
	FromAddress                 string    `json:"from_address"`
	DefaultRecipient            string    `json:"default_recipient"`
	SendResolvedEmails          bool      `gorm:"default:true" json:"send_resolved_emails"`
	ConsecutiveBreachesRequired int       `gorm:"default:2" json:"consecutive_breaches_required"`
	ConsecutiveNormalRequired   int       `gorm:"default:2" json:"consecutive_normal_required"`
	WebhookURL                  string    `json:"webhook_url"`
	WebhookEnabled              bool      `gorm:"default:false" json:"webhook_enabled"`
	UpdatedAt                   time.Time `json:"updated_at"`
}
