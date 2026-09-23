package automation

import (
	"fmt"
	"net/smtp"
	"os"
)

type NotificationEngine struct{}

func NewNotificationEngine() *NotificationEngine {
	return &NotificationEngine{}
}

func (n *NotificationEngine) NotifyAll(title, message string) error {
	to := "infrapilotadmin@gmail.com"
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		host = "smtp.gmail.com"
	}
	user := os.Getenv("SMTP_USER")
	if user == "" {
		user = "infrapilotadmin@gmail.com"
	}
	password := os.Getenv("SMTP_PASSWORD")
	if password == "" {
		password = "ajrlswurhrurjddk"
	}
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "InfraPilot Enterprise <infrapilotadmin@gmail.com>"
	}

	fmt.Printf("[NOTIFICATION DISPATCH] Title: %s | Message: %s | Recipient: %s\n", title, message, to)

	// Send direct SMTP email
	msg := fmt.Sprintf("To: %s\r\nFrom: %s\r\nSubject: [InfraPilot Update] %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n\r\n-- InfraPilot Enterprise Engine", to, from, title, message)
	addr := fmt.Sprintf("%s:587", host)
	auth := smtp.PlainAuth("", user, password, host)
	_ = smtp.SendMail(addr, auth, user, []string{to}, []byte(msg))

	return nil
}
