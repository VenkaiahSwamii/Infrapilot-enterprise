package automation

import (
	"fmt"
	"net/smtp"
	"os"

	"infrapilot/backend/internal/config"
)

type NotificationEngine struct{}

func NewNotificationEngine() *NotificationEngine {
	return &NotificationEngine{}
}

func (n *NotificationEngine) NotifyAll(title, message string) error {
	cfg := config.Get()
	to := cfg.SMTP.DefaultRecipient
	if to == "" {
		to = cfg.Alerts.AdminEmail
	}
	if to == "" {
		to = os.Getenv("ADMIN_EMAIL")
	}

	host := cfg.SMTP.Host
	if host == "" {
		host = os.Getenv("SMTP_HOST")
	}
	if host == "" {
		host = "smtp.gmail.com"
	}
	user := cfg.SMTP.User
	if user == "" {
		user = os.Getenv("SMTP_USER")
	}
	password := cfg.SMTP.Password
	if password == "" {
		password = os.Getenv("SMTP_PASSWORD")
	}
	from := cfg.SMTP.From
	if from == "" {
		from = os.Getenv("SMTP_FROM")
	}
	if from == "" {
		from = "InfraPilot Enterprise <notifications@infrapilot.enterprise>"
	}

	fmt.Printf("[NOTIFICATION DISPATCH] Title: %s | Message: %s | Recipient: %s\n", title, message, to)

	if to == "" || user == "" || password == "" {
		return nil
	}

	// Send direct SMTP email
	msg := fmt.Sprintf("To: %s\r\nFrom: %s\r\nSubject: [InfraPilot Update] %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n\r\n-- InfraPilot Enterprise Engine", to, from, title, message)
	addr := fmt.Sprintf("%s:%d", host, cfg.SMTP.Port)
	if cfg.SMTP.Port <= 0 {
		addr = fmt.Sprintf("%s:587", host)
	}
	auth := smtp.PlainAuth("", user, password, host)
	_ = smtp.SendMail(addr, auth, user, []string{to}, []byte(msg))

	return nil
}
