package services

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/docker"
	"infrapilot/backend/internal/kubernetes"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"

	"github.com/google/uuid"
)

type MetricService struct {
	metricRepo  *repository.MetricRepository
	machineRepo *repository.MachineRepository
}

func NewMetricService(metricRepo *repository.MetricRepository, machineRepo *repository.MachineRepository) *MetricService {
	return &MetricService{
		metricRepo:  metricRepo,
		machineRepo: machineRepo,
	}
}

type SaveMetricInput struct {
	APIKey              string
	CPUUsage            float64
	MemoryPercent       float64
	DiskPercent         float64
	UploadMbps          float64
	DownloadMbps        float64
	Uptime              uint64
	Hostname            string
	IPAddress           string
	OS                  string
	CPUTemperature      float64
	CPUCores            int
	TotalMemory         uint64
	FreeMemory          uint64
	Kernel              string
	Architecture        string
	MACAddress          string
	CPUModel            string
	Timezone            string
	BootTime            uint64
	CPUPerCore          []float64
	CPUFrequencyMHz     float64
	Load1               float64
	Load5               float64
	Load15              float64
	MemoryCached        uint64
	SwapUsage           float64
	DiskReadBps         float64
	DiskWriteBps        float64
	DiskIOPS            float64
	LatencyMs           float64
	PacketLoss          float64
	Filesystems         []FilesystemInput
	Processes           []ProcessInput
	Services            []ServiceInput
	NetworkInterfaces   []NetworkInterfaceInput
	OpenPorts           []string
	SmartStatus         string
	RAIDStatus          string
	LVMStatus           string
	DiskTemperature     float64
	DockerContainers    []DockerContainerInput
	DockerInstalled     bool
	DockerVersion       DockerVersionInput
	DockerImages        []DockerImageInput
	DockerVolumes       []DockerVolumeInput
	DockerNetworks      []DockerNetworkInput
	DockerEvents        []DockerEventInput
	K8sInstalled        bool   `json:"k8s_installed"`
	K8sClusterJSON      string `json:"k8s_cluster_json"`
	K8sNodesJSON        string `json:"k8s_nodes_json"`
	K8sPodsJSON         string `json:"k8s_pods_json"`
	K8sDeploymentsJSON  string `json:"k8s_deployments_json"`
	K8sStatefulSetsJSON string `json:"k8s_statefulsets_json"`
	K8sDaemonSetsJSON   string `json:"k8s_daemonsets_json"`
	K8sServicesJSON     string `json:"k8s_services_json"`
	K8sNamespacesJSON   string `json:"k8s_namespaces_json"`
	K8sStorageJSON      string `json:"k8s_storage_json"`
	K8sEventsJSON       string `json:"k8s_events_json"`
}

type FilesystemInput struct {
	MountPoint string  `json:"mount_point"`
	FSType     string  `json:"fs_type"`
	Total      uint64  `json:"total"`
	Used       uint64  `json:"used"`
	Free       uint64  `json:"free"`
	UsedPct    float64 `json:"used_percent"`
}

type ProcessInput struct {
	PID           int32   `json:"pid"`
	Name          string  `json:"name"`
	User          string  `json:"user"`
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryPercent float32 `json:"memory_percent"`
	Status        string  `json:"status"`
	Command       string  `json:"command"`
}

type ServiceInput struct {
	Name         string `json:"name"`
	Status       string `json:"status"`
	RestartCount int    `json:"restart_count"`
}

type NetworkInterfaceInput struct {
	Name      string   `json:"name"`
	MAC       string   `json:"mac"`
	Addresses []string `json:"addresses"`
	SpeedMbps float64  `json:"speed_mbps"`
}

type DockerVersionInput = docker.DockerVersionInput
type DockerContainerInput = docker.DockerContainerInput
type DockerImageInput = docker.DockerImageInput
type DockerVolumeInput = docker.DockerVolumeInput
type DockerNetworkInput = docker.DockerNetworkInput
type DockerEventInput = docker.DockerEventInput

func (s *MetricService) SaveMetric(input SaveMetricInput) (*models.Metric, *models.Machine, error) {
	var machine *models.Machine

	// 1. Match by Hostname AND OS (prevents Linux vs Windows collisions on same hostname)
	if input.Hostname != "" && input.OS != "" && database.DB != nil {
		var m models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?) AND LOWER(os) = LOWER(?)", input.Hostname, input.OS).First(&m).Error; err == nil {
			machine = &m
		}
	}

	// 2. Match by Hostname AND IP
	if machine == nil && input.Hostname != "" && input.IPAddress != "" && database.DB != nil {
		var m models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?) AND ip_address = ?", input.Hostname, input.IPAddress).First(&m).Error; err == nil {
			machine = &m
		}
	}

	// 3. Match by API Key if compatible OS
	if machine == nil && input.APIKey != "" && s.machineRepo != nil {
		m, err := s.machineRepo.FindByAPIKey(input.APIKey)
		if err == nil && m != nil {
			if input.OS == "" || m.OS == "" || strings.EqualFold(m.OS, input.OS) {
				machine = m
			}
		}
	}

	// 4. Match by Hostname alone (if OS is compatible)
	if machine == nil && input.Hostname != "" && database.DB != nil {
		var m models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?)", input.Hostname).First(&m).Error; err == nil {
			if input.OS == "" || m.OS == "" || strings.EqualFold(m.OS, input.OS) {
				machine = &m
			}
		}
	}

	// 5. Match by IP Address alone (if OS is compatible)
	if machine == nil && input.IPAddress != "" && database.DB != nil {
		var m models.Machine
		if err := database.DB.Where("ip_address = ?", input.IPAddress).First(&m).Error; err == nil {
			if input.OS == "" || m.OS == "" || strings.EqualFold(m.OS, input.OS) {
				machine = &m
			}
		}
	}

	if machine == nil {
		return nil, nil, errors.New("machine not found or deleted")
	}

	// Save detailed metric to DB
	metric := &models.Metric{
		ID:             uuid.New(),
		MachineID:      machine.ID,
		CPUUsage:       input.CPUUsage,
		MemoryUsage:    input.MemoryPercent,
		DiskUsage:      input.DiskPercent,
		MemoryPercent:  input.MemoryPercent,
		DiskPercent:    input.DiskPercent,
		LatencyMs:      input.LatencyMs,
		UploadMbps:     input.UploadMbps,
		DownloadMbps:   input.DownloadMbps,
		Uptime:         input.Uptime,
		CreatedAt:      time.Now().UTC(),
		Hostname:       input.Hostname,
		IPAddress:      input.IPAddress,
		OS:             input.OS,
		CPUTemperature: input.CPUTemperature,
		CPUCores:       input.CPUCores,
		TotalMemory:    input.TotalMemory,
		FreeMemory:     input.FreeMemory,
	}

	// Save metric
	if err := database.DB.Create(metric).Error; err != nil {
		return nil, nil, err
	}

	// Update machine information
	updates := map[string]interface{}{
		"hostname":   metric.Hostname,
		"ip_address": metric.IPAddress,
		"os":         metric.OS,
		"status":     "ONLINE",
		"online":     true,
		"last_seen":  metric.CreatedAt,
		"updated_at": time.Now(),
	}
	if input.Kernel != "" {
		updates["kernel"] = input.Kernel
		machine.Kernel = input.Kernel
	}
	if input.Architecture != "" {
		updates["architecture"] = input.Architecture
		machine.Architecture = input.Architecture
	}
	if input.CPUModel != "" {
		updates["cpu_model"] = input.CPUModel
		machine.CPUModel = input.CPUModel
	}
	if input.TotalMemory > 0 {
		memGB := math.Round((float64(input.TotalMemory)/(1024.0*1024.0*1024.0))*10.0) / 10.0
		if memGB > 0 {
			updates["total_memory_gb"] = memGB
			machine.TotalMemoryGB = memGB
		}
	}
	var totalDiskBytes uint64
	if len(input.Filesystems) > 0 {
		for _, fs := range input.Filesystems {
			if fs.MountPoint == "/" || strings.EqualFold(fs.MountPoint, "c:") {
				totalDiskBytes = fs.Total
				break
			}
		}
		if totalDiskBytes == 0 {
			for _, fs := range input.Filesystems {
				totalDiskBytes += fs.Total
			}
		}
	}
	if totalDiskBytes > 0 {
		diskGB := math.Round((float64(totalDiskBytes)/(1024.0*1024.0*1024.0))*10.0) / 10.0
		if diskGB > 0 {
			updates["total_disk_gb"] = diskGB
			machine.TotalDiskGB = diskGB
		}
	}
	if strings.EqualFold(metric.OS, "windows") {
		updates["platform"] = "windows"
		updates["operating_system"] = "Windows 11"
		updates["resource_type"] = "windows"
		updates["name"] = metric.Hostname + " (Windows)"
		machine.Platform = "windows"
		machine.OperatingSystem = "Windows 11"
		machine.ResourceType = "windows"
		machine.Name = metric.Hostname + " (Windows)"
	} else if strings.EqualFold(metric.OS, "linux") {
		updates["platform"] = "ubuntu"
		updates["operating_system"] = "Ubuntu 24.04 LTS (WSL2)"
		updates["resource_type"] = "linux"
		updates["name"] = metric.Hostname + " (Linux)"
		machine.Platform = "ubuntu"
		machine.OperatingSystem = "Ubuntu 24.04 LTS (WSL2)"
		machine.ResourceType = "linux"
		machine.Name = metric.Hostname + " (Linux)"
	}

	if err := database.DB.Model(&models.Machine{}).
		Where("id = ?", metric.MachineID).
		Updates(updates).Error; err != nil {
		return nil, nil, err
	}
	machine.Hostname = metric.Hostname
	machine.IPAddress = metric.IPAddress
	machine.OS = metric.OS
	machine.Status = "ONLINE"
	machine.Online = true
	machine.LastSeen = metric.CreatedAt

	if isLinuxMachine(machine, input) {
		if err := s.persistLinuxTelemetry(machine, input, metric.CreatedAt); err != nil {
			return nil, nil, err
		}
	}

	return metric, machine, nil
}

func isLinuxMachine(machine *models.Machine, input SaveMetricInput) bool {
	haystack := strings.ToLower(machine.OS + " " + machine.Platform + " " + machine.ResourceType + " " + input.OS)
	return strings.Contains(haystack, "linux") ||
		strings.Contains(haystack, "ubuntu") ||
		strings.Contains(haystack, "debian") ||
		strings.Contains(haystack, "centos") ||
		strings.Contains(haystack, "rocky") ||
		strings.Contains(haystack, "redhat") ||
		strings.Contains(haystack, "windows")
}

func (s *MetricService) persistLinuxTelemetry(machine *models.Machine, input SaveMetricInput, sampledAt time.Time) error {
	cpuPerCoreJSON := mustJSON(input.CPUPerCore)
	filesystemsJSON := mustJSON(input.Filesystems)
	networkJSON := mustJSON(input.NetworkInterfaces)
	openPortsJSON := mustJSON(input.OpenPorts)

	server := models.LinuxServer{
		ID:           uuid.New(),
		MachineID:    machine.ID,
		Hostname:     machine.Hostname,
		OS:           firstNonEmpty(input.OS, machine.OS),
		Kernel:       input.Kernel,
		Architecture: input.Architecture,
		AgentVersion: machine.AgentVersion,
		IPAddress:    firstNonEmpty(input.IPAddress, machine.IPAddress),
		MACAddress:   input.MACAddress,
		Timezone:     input.Timezone,
		BootTime:     input.BootTime,
		LastSeenAt:   sampledAt,
	}

	if err := s.metricRepo.UpsertLinuxServer(server); err != nil {
		return err
	}
	if err := s.metricRepo.CreateLinuxMetric(models.LinuxMetric{
		ID:              uuid.New(),
		MachineID:       machine.ID,
		SampledAt:       sampledAt,
		CPUUsage:        input.CPUUsage,
		CPUPerCoreJSON:  cpuPerCoreJSON,
		CPUFrequencyMHz: input.CPUFrequencyMHz,
		CPUTemperature:  input.CPUTemperature,
		Load1:           input.Load1,
		Load5:           input.Load5,
		Load15:          input.Load15,
		MemoryUsed:      input.TotalMemory - input.FreeMemory,
		MemoryFree:      input.FreeMemory,
		MemoryCached:    input.MemoryCached,
		MemoryPercent:   input.MemoryPercent,
		SwapUsage:       input.SwapUsage,
		DiskUsage:       input.DiskPercent,
		DiskReadBps:     input.DiskReadBps,
		DiskWriteBps:    input.DiskWriteBps,
		DiskIOPS:        input.DiskIOPS,
		UploadMbps:      input.UploadMbps,
		DownloadMbps:    input.DownloadMbps,
		LatencyMs:       input.LatencyMs,
		PacketLoss:      input.PacketLoss,
		CreatedAt:       sampledAt,
	}); err != nil {
		return err
	}
	if err := s.metricRepo.CreateLinuxNetwork(models.LinuxNetwork{
		ID:             uuid.New(),
		MachineID:      machine.ID,
		SampledAt:      sampledAt,
		InterfacesJSON: networkJSON,
		OpenPortsJSON:  openPortsJSON,
		UploadMbps:     input.UploadMbps,
		DownloadMbps:   input.DownloadMbps,
		PacketLoss:     input.PacketLoss,
		LatencyMs:      input.LatencyMs,
	}); err != nil {
		return err
	}
	if err := s.metricRepo.CreateLinuxStorage(models.LinuxStorage{
		ID:              uuid.New(),
		MachineID:       machine.ID,
		SampledAt:       sampledAt,
		FilesystemsJSON: filesystemsJSON,
		DiskReadBps:     input.DiskReadBps,
		DiskWriteBps:    input.DiskWriteBps,
		DiskIOPS:        input.DiskIOPS,
		SmartStatus:     firstNonEmpty(input.SmartStatus, "unknown"),
		RAIDStatus:      firstNonEmpty(input.RAIDStatus, "unknown"),
		LVMStatus:       firstNonEmpty(input.LVMStatus, "unknown"),
		DiskTemperature: input.DiskTemperature,
	}); err != nil {
		return err
	}

	for _, process := range input.Processes {
		_ = s.metricRepo.CreateLinuxProcess(models.LinuxProcess{
			ID:            uuid.New(),
			MachineID:     machine.ID,
			SampledAt:     sampledAt,
			PID:           process.PID,
			Name:          process.Name,
			User:          process.User,
			CPUPercent:    process.CPUPercent,
			MemoryPercent: process.MemoryPercent,
			Status:        process.Status,
			Command:       process.Command,
		})
	}

	for _, service := range input.Services {
		_ = s.metricRepo.UpsertLinuxService(models.LinuxService{
			ID:           uuid.New(),
			MachineID:    machine.ID,
			Name:         service.Name,
			Status:       service.Status,
			RestartCount: service.RestartCount,
			LastSeenAt:   sampledAt,
		})
	}

	if len(input.DockerContainers) > 0 {
		containersJSON := mustJSON(input.DockerContainers)
		_ = database.DB.Create(&models.LinuxDocker{
			ID:             uuid.New(),
			MachineID:      machine.ID,
			SampledAt:      sampledAt,
			ContainersJSON: containersJSON,
			ImagesJSON:     "[]",
		})
	}

	if input.K8sNodesJSON != "" || input.K8sPodsJSON != "" {
		_ = database.DB.Create(&models.LinuxKubernetes{
			ID:        uuid.New(),
			MachineID: machine.ID,
			SampledAt: sampledAt,
			NodesJSON: input.K8sNodesJSON,
			PodsJSON:  input.K8sPodsJSON,
		})
	}

	_ = kubernetes.SaveKubernetesMetrics(
		machine.ID,
		input.K8sInstalled,
		input.K8sClusterJSON,
		input.K8sNodesJSON,
		input.K8sPodsJSON,
		input.K8sDeploymentsJSON,
		input.K8sStatefulSetsJSON,
		input.K8sDaemonSetsJSON,
		input.K8sServicesJSON,
		input.K8sNamespacesJSON,
		input.K8sStorageJSON,
		input.K8sEventsJSON,
	)

	history := map[string]float64{
		"cpu_usage":      input.CPUUsage,
		"memory_usage":   input.MemoryPercent,
		"disk_usage":     input.DiskPercent,
		"upload_mbps":    input.UploadMbps,
		"download_mbps":  input.DownloadMbps,
		"load_1":         input.Load1,
		"swap_usage":     input.SwapUsage,
		"temperature":    input.CPUTemperature,
		"disk_read_bps":  input.DiskReadBps,
		"disk_write_bps": input.DiskWriteBps,
	}
	for name, value := range history {
		_ = s.metricRepo.CreateHistoricalMetric(models.HistoricalMetric{
			ID:        uuid.New(),
			MachineID: machine.ID,
			Metric:    name,
			Value:     value,
			SampledAt: sampledAt,
		})
	}

	return nil
}

func mustJSON(value interface{}) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func (s *MetricService) GetMachineMetrics(machineID uuid.UUID) ([]models.Metric, error) {
	return s.metricRepo.FindByMachineID(machineID, 100)
}

func (s *MetricService) GetRecentMachineMetrics(machineID uuid.UUID, since time.Time) ([]models.Metric, error) {
	return s.metricRepo.FindRecentByMachineID(machineID, since)
}
