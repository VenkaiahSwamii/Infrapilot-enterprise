package service

import (
	"log"

	"infrapilot/agent/internal/app"

	"github.com/kardianos/service"
)

type Program struct{}

func (p *Program) Start(s service.Service) error {
	go app.RunAgent()
	return nil
}

func (p *Program) Stop(s service.Service) error {
	log.Println("InfraPilot Agent stopped")
	return nil
}

// NewService creates a new Service instance for Windows service management.
func NewService() (service.Service, error) {
	svcConfig := &service.Config{
		Name:        "infrapilot-agent",
		DisplayName: "InfraPilot Monitoring Agent",
		Description: "InfraPilot Enterprise Monitoring Agent Service.",
	}

	prg := &Program{}
	s, err := service.New(prg, svcConfig)
	return s, err
}
