package services

import (
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

type MachineService struct {
	serverSvc *ServerService
}

type RegisterMachineInput struct {
	ID             uuid.UUID
	Hostname       string
	OS             string
	Platform       string
	IPAddress      string
	AgentVersion   string
	ResourceType   string
	Organization   string
	Kernel         string
	Architecture   string
	MACAddress     string
	CPUModel       string
	TotalMemoryGB  float64
	TotalDiskGB    float64
	GPU            string
	Virtualization string
	CloudProvider  string
}

func NewMachineService(machineRepo *repository.MachineRepository, metricRepo *repository.MetricRepository, hub *websocket.Hub, bus *events.EventBus) *MachineService {
	serverRepo := repository.NewServerRepository()
	return &MachineService{
		serverSvc: NewServerService(serverRepo, metricRepo, hub, bus),
	}
}

func (s *MachineService) RegisterOrUpdateMachine(input RegisterMachineInput) (*models.Machine, error) {
	serverInput := RegisterServerInput{
		ID:             input.ID,
		Hostname:       input.Hostname,
		OS:             input.OS,
		Platform:       input.Platform,
		IPAddress:      input.IPAddress,
		AgentVersion:   input.AgentVersion,
		ResourceType:   input.ResourceType,
		Organization:   input.Organization,
		Kernel:         input.Kernel,
		Architecture:   input.Architecture,
		MACAddress:     input.MACAddress,
		CPUModel:       input.CPUModel,
		TotalMemoryGB:  input.TotalMemoryGB,
		TotalDiskGB:    input.TotalDiskGB,
		GPU:            input.GPU,
		Virtualization: input.Virtualization,
		CloudProvider:  input.CloudProvider,
	}
	return s.serverSvc.RegisterOrUpdateServer(serverInput)
}

func (s *MachineService) RegisterMachine(hostname, ipAddress, os, agentVersion string) (*models.Machine, error) {
	return s.serverSvc.RegisterServer(hostname, ipAddress, os, agentVersion)
}

func (s *MachineService) Heartbeat(id uuid.UUID) error {
	return s.serverSvc.Heartbeat(id)
}

func (s *MachineService) GetMachines() ([]models.MachineSnapshot, error) {
	return s.serverSvc.GetServers()
}

func (s *MachineService) GetMachineSnapshotByID(id uuid.UUID) (*models.MachineSnapshot, error) {
	return s.serverSvc.GetServerSnapshotByID(id)
}

func (s *MachineService) GetMachineByID(id uuid.UUID) (*models.Machine, error) {
	return s.serverSvc.GetServerByID(id)
}

func (s *MachineService) Save(machine *models.Machine) error {
	return s.serverSvc.Save(machine)
}

func (s *MachineService) PublishEvent(e events.Event) {
	s.serverSvc.PublishEvent(e)
}

func (s *MachineService) GetServerService() *ServerService {
	return s.serverSvc
}
