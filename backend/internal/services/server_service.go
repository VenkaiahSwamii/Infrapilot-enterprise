package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

var eventBusGlobal *events.EventBus

type ServerService struct {
	serverRepo *repository.ServerRepository
	metricRepo *repository.MetricRepository
	hub        *websocket.Hub
}

type RegisterServerInput struct {
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

func NewServerService(serverRepo *repository.ServerRepository, metricRepo *repository.MetricRepository, hub *websocket.Hub, bus *events.EventBus) *ServerService {
	svc := &ServerService{
		serverRepo: serverRepo,
		metricRepo: metricRepo,
		hub:        hub,
	}
	if bus != nil {
		eventBusGlobal = bus
	}
	return svc
}

func (s *ServerService) broadcastStatusUpdate(m *models.Server) {
	payload := map[string]interface{}{
		"machine_id":    m.ID,
		"hostname":      m.Hostname,
		"status":        m.Status,
		"ip_address":    m.IPAddress,
		"os":            m.OS,
		"platform":      m.Platform,
		"agent_version": m.AgentVersion,
		"resource_type": m.ResourceType,
		"organization":  m.Organization,
		"last_seen":     m.LastSeen,
	}

	// Publish structured events
	if m.Status == "ONLINE" {
		websocket.PublishEvent("server.online", m.ID.String(), payload)
	} else if m.Status == "OFFLINE" {
		websocket.PublishEvent("server.offline", m.ID.String(), payload)
	}
	websocket.PublishEvent("heartbeat.received", m.ID.String(), map[string]interface{}{
		"server_id": m.ID.String(),
		"timestamp": m.LastSeen,
	})

	jsonData, _ := json.Marshal(payload)
	s.hub.Broadcast(jsonData)
}

func (s *ServerService) PublishEvent(e events.Event) {
	if eventBusGlobal != nil {
		eventBusGlobal.Publish(e)
	}
}

func (s *ServerService) RegisterOrUpdateServer(input RegisterServerInput) (*models.Server, error) {


	server, err := s.serverRepo.FindExistingServer(input.ID, input.Hostname, input.IPAddress, input.MACAddress, input.OS)
	if err == nil && server != nil {
		// Update existing server record
		applyServerRegistration(server, input)
		server.Status = "ONLINE"
		server.LastSeen = time.Now().UTC()

		if err := s.serverRepo.UpdateServer(server); err != nil {
			return nil, err
		}

		s.broadcastStatusUpdate(server)
		return server, nil
	}

	// Create new server registry record
	apiKey := generateServerAPIKey()
	serverID := input.ID
	if serverID == uuid.Nil {
		serverID = uuid.New()
	} else if database.DB != nil {
		var exists int64
		database.DB.Model(&models.Server{}).Where("id = ?", serverID).Count(&exists)
		if exists > 0 {
			serverID = uuid.New()
		}
	}
	server = &models.Server{
		ID:        serverID,
		APIKey:    apiKey,
		Status:    "ONLINE",
		LastSeen:  time.Now().UTC(),
		CreatedAt: time.Now().UTC(),
	}
	applyServerRegistration(server, input)

	if err := s.serverRepo.CreateServer(server); err != nil {
		return nil, err
	}

	s.broadcastStatusUpdate(server)
	s.PublishEvent(events.MachineRegisteredEvent{
		MachineID: server.ID.String(),
		Hostname:  server.Hostname,
		IPAddress: server.IPAddress,
		OS:        server.OS,
		Platform:  server.Platform,
		APIKey:    server.APIKey,
		Time:      time.Now(),
	})
	return server, nil
}

func applyServerRegistration(server *models.Server, input RegisterServerInput) {
	if server.Name == "" {
		server.Name = input.Hostname
	}
	server.Hostname = input.Hostname
	server.OS = input.OS
	server.Platform = input.Platform
	server.IPAddress = input.IPAddress
	server.AgentVersion = input.AgentVersion
	server.ResourceType = normalizeServerResourceType(input.ResourceType, input.OS, input.Platform, input.Virtualization, input.CloudProvider)
	server.Organization = defaultServerString(input.Organization, "Default Organization")
	server.Kernel = input.Kernel
	server.Architecture = input.Architecture
	server.MACAddress = input.MACAddress
	server.CPUModel = input.CPUModel
	server.TotalMemoryGB = input.TotalMemoryGB
	server.TotalDiskGB = input.TotalDiskGB
	server.GPU = input.GPU
	server.Virtualization = input.Virtualization
	server.CloudProvider = input.CloudProvider
	server.Online = true
}

func normalizeServerResourceType(resourceType, osName, platform, virtualization, cloudProvider string) string {
	value := strings.ToLower(strings.TrimSpace(resourceType))
	if value != "" {
		return strings.ReplaceAll(value, " ", "_")
	}

	haystack := strings.ToLower(strings.Join([]string{osName, platform, virtualization, cloudProvider}, " "))
	switch {
	case strings.Contains(haystack, "kubernetes") || strings.Contains(haystack, "k8s"):
		return "kubernetes"
	case strings.Contains(haystack, "docker"):
		return "docker"
	case strings.Contains(haystack, "vmware") || strings.Contains(haystack, "esxi"):
		return "vmware"
	case strings.Contains(haystack, "hyper-v") || strings.Contains(haystack, "virtual"):
		return "virtual_machine"
	case strings.Contains(haystack, "aws") || strings.Contains(haystack, "azure") || strings.Contains(haystack, "gcp") || strings.Contains(haystack, "google cloud"):
		return "cloud"
	case strings.Contains(haystack, "nas") || strings.Contains(haystack, "san") || strings.Contains(haystack, "nfs") || strings.Contains(haystack, "ceph") || strings.Contains(haystack, "raid"):
		return "storage"
	case strings.Contains(haystack, "postgres") || strings.Contains(haystack, "mysql") || strings.Contains(haystack, "mongo") || strings.Contains(haystack, "redis"):
		return "database"
	case strings.Contains(haystack, "linux") || strings.Contains(haystack, "ubuntu") || strings.Contains(haystack, "debian") || strings.Contains(haystack, "centos") || strings.Contains(haystack, "rocky") || strings.Contains(haystack, "redhat") || strings.Contains(haystack, "amazon linux"):
		return "linux"
	case strings.Contains(haystack, "windows"):
		return "windows"
	default:
		return "server"
	}
}

func defaultServerString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func (s *ServerService) RegisterServer(hostname, ipAddress, os, agentVersion string) (*models.Server, error) {
	serverID := uuid.New()
	apiKey := generateServerAPIKey()

	server := &models.Server{
		ID:           serverID,
		Hostname:     hostname,
		IPAddress:    ipAddress,
		OS:           os,
		AgentVersion: agentVersion,
		APIKey:       apiKey,
		Status:       "OFFLINE",
		LastSeen:     time.Now(),
		CreatedAt:    time.Now(),
	}

	if err := s.serverRepo.CreateServer(server); err != nil {
		return nil, err
	}

	return server, nil
}

func (s *ServerService) Heartbeat(id uuid.UUID) error {
	server, err := s.serverRepo.GetServer(id)
	if err != nil || server == nil {
		if database.DB == nil {
			return nil
		}
		return errors.New("server not found")
	}

	server.LastSeen = time.Now().UTC()
	server.Status = "ONLINE"
	server.Online = true
	if err := s.serverRepo.UpdateServer(server); err != nil {
		return err
	}

	s.broadcastStatusUpdate(server)
	s.PublishEvent(events.MachineOnlineEvent{
		MachineID: server.ID.String(),
		Hostname:  server.Hostname,
		IPAddress: server.IPAddress,
		OS:        server.OS,
		Platform:  server.Platform,
		LastSeen:  server.LastSeen,
		Time:      time.Now(),
	})

	return nil
}

type serverWithMetrics struct {
	models.Server
	CPUUsage       float64
	MemoryUsage    float64
	DiskUsage      float64
	UploadMbps     float64
	DownloadMbps   float64
	Uptime         uint64
	CPUTemperature float64
	CPUCores       int
	TotalMemory    uint64
	FreeMemory     uint64
	MemoryTotal    uint64
	MemoryUsed     uint64
	DiskTotal      uint64
	DiskUsed       uint64
	LinuxMemUsed   uint64
	LinuxMemFree   uint64
	LinuxMemCached uint64
}

func (s *ServerService) GetServers() ([]models.ServerSnapshot, error) {
	if database.DB == nil {
		return []models.ServerSnapshot{}, nil
	}
	var rows []serverWithMetrics
	if database.DB.Dialector.Name() == "postgres" {
		if err := database.DB.Raw(`
SELECT
m.*,
mt.cpu_usage,
mt.memory_usage,
mt.disk_usage,
mt.upload_mbps,
mt.download_mbps,
mt.uptime,
mt.cpu_temperature,
mt.total_memory,
mt.free_memory,
mt.memory_total,
mt.memory_used,
mt.disk_total,
mt.disk_used,
lm.memory_used as linux_mem_used,
lm.memory_free as linux_mem_free,
lm.memory_cached as linux_mem_cached,
COALESCE(NULLIF(mt.cpu_cores, 0), 2) as cpu_cores
FROM servers m
LEFT JOIN LATERAL (
    SELECT *
    FROM metrics
    WHERE metrics.machine_id = m.id
    ORDER BY created_at DESC
    LIMIT 1
) mt ON TRUE
LEFT JOIN LATERAL (
    SELECT cpu_per_core_json, memory_used, memory_free, memory_cached
    FROM linux_metrics
    WHERE linux_metrics.machine_id = m.id
    ORDER BY sampled_at DESC
    LIMIT 1
) lm ON TRUE
ORDER BY CASE WHEN UPPER(m.status) = 'ONLINE' OR m.online = true THEN 1 ELSE 2 END, m.last_seen DESC, m.created_at DESC;
`).Scan(&rows).Error; err != nil {
			var baseServers []models.Server
			if findErr := database.DB.Order("created_at desc").Find(&baseServers).Error; findErr != nil {
				return nil, findErr
			}
			result := make([]models.ServerSnapshot, 0, len(baseServers))
			for _, srv := range baseServers {
				var latestMetric models.Metric
				database.DB.Where("machine_id = ?", srv.ID).Order("created_at desc").First(&latestMetric)
				snap := models.ServerSnapshot{
					Server:       srv,
					CPUUsage:     &latestMetric.CPUUsage,
					MemoryUsage:  &latestMetric.MemoryUsage,
					DiskUsage:    &latestMetric.DiskUsage,
					UploadMbps:   &latestMetric.UploadMbps,
					DownloadMbps: &latestMetric.DownloadMbps,
				}
				result = append(result, snap)
			}
			return result, nil
		}
	} else {
		if err := database.DB.Raw(`
SELECT
m.*,
mt.cpu_usage,
mt.memory_usage,
mt.disk_usage,
mt.upload_mbps,
mt.download_mbps,
mt.uptime,
mt.cpu_temperature,
mt.total_memory,
mt.free_memory,
mt.memory_total,
mt.memory_used,
mt.disk_total,
mt.disk_used,
mt.cpu_cores
FROM servers m
LEFT JOIN metrics mt ON mt.machine_id = m.id AND mt.id = (
    SELECT id FROM metrics WHERE metrics.machine_id = m.id ORDER BY created_at DESC LIMIT 1
)
ORDER BY CASE WHEN UPPER(m.status) = 'ONLINE' OR m.online = true THEN 1 ELSE 2 END, m.last_seen DESC, m.created_at DESC;
`).Scan(&rows).Error; err != nil {
			var baseServers []models.Server
			if findErr := database.DB.Order("created_at desc").Find(&baseServers).Error; findErr != nil {
				return nil, findErr
			}
			result := make([]models.ServerSnapshot, 0, len(baseServers))
			for _, srv := range baseServers {
				var latestMetric models.Metric
				database.DB.Where("machine_id = ?", srv.ID).Order("created_at desc").First(&latestMetric)
				snap := models.ServerSnapshot{
					Server:       srv,
					CPUUsage:     &latestMetric.CPUUsage,
					MemoryUsage:  &latestMetric.MemoryUsage,
					DiskUsage:    &latestMetric.DiskUsage,
					UploadMbps:   &latestMetric.UploadMbps,
					DownloadMbps: &latestMetric.DownloadMbps,
				}
				result = append(result, snap)
			}
			return result, nil
		}
	}

	result := make([]models.ServerSnapshot, 0, len(rows))
	seenHosts := make(map[string]bool)

	for _, row := range rows {

		dedupKey := row.ID.String()
		if dedupKey != "" {
			if seenHosts[dedupKey] {
				continue // Skip duplicate server ID
			}
			seenHosts[dedupKey] = true
		}

		metric := models.Metric{
			ID:             uuid.New(),
			MachineID:      row.ID,
			CPUUsage:       row.CPUUsage,
			MemoryUsage:    row.MemoryUsage,
			DiskUsage:      row.DiskUsage,
			UploadMbps:     row.UploadMbps,
			DownloadMbps:   row.DownloadMbps,
			Uptime:         row.Uptime,
			CPUTemperature: row.CPUTemperature,
			CPUCores:       row.CPUCores,
			TotalMemory:    row.TotalMemory,
			FreeMemory:     row.FreeMemory,
			MemoryTotal:    row.MemoryTotal,
			MemoryUsed:     row.MemoryUsed,
			DiskTotal:      row.DiskTotal,
			DiskUsed:       row.DiskUsed,
			CreatedAt:      time.Now(),
		}
		rich := models.LinuxMetric{
			MemoryUsed:   row.LinuxMemUsed,
			MemoryFree:   row.LinuxMemFree,
			MemoryCached: row.LinuxMemCached,
		}
		snapshot := buildServerSnapshot(row.Server, metric, rich)
		result = append(result, snapshot)
	}
	return result, nil
}

func (s *ServerService) GetServerSnapshotByID(id uuid.UUID) (*models.ServerSnapshot, error) {
	server, err := s.serverRepo.GetServer(id)
	if err != nil {
		return nil, err
	}
	latest, err := s.metricRepo.FindLatestByMachineIDs([]uuid.UUID{id})
	if err != nil {
		return nil, err
	}
	rich, err := s.metricRepo.FindLatestRichByMachineIDs([]uuid.UUID{id})
	if err != nil {
		return nil, err
	}
	snapshot := buildServerSnapshot(*server, latest[id], rich[id])
	return &snapshot, nil
}

func buildServerSnapshot(server models.Server, metric models.Metric, rich models.LinuxMetric) models.ServerSnapshot {
	isOffline := time.Since(server.LastSeen) > 90*time.Second || strings.ToUpper(server.Status) == "OFFLINE"
	if isOffline {
		server.Status = "OFFLINE"
		server.Online = false
	} else {
		server.Status = "ONLINE"
		server.Online = true
	}

	snapshot := models.ServerSnapshot{Server: server}
	if metric.ID == uuid.Nil && rich.ID == uuid.Nil {
		return snapshot
	}

	zero := 0.0
	zeroUint := uint64(0)
	if isOffline {
		snapshot.CPUUsage = &zero
		snapshot.MemoryUsage = &zero
		snapshot.DiskUsage = &zero
		snapshot.StorageUsage = &zero
		snapshot.UploadMbps = &zero
		snapshot.DownloadMbps = &zero
		snapshot.NetworkMbps = &zero
		snapshot.Uptime = &zeroUint
		snapshot.CPUCores = &metric.CPUCores
		return snapshot
	}

	metricAt := metric.CreatedAt
	if metricAt.IsZero() && !rich.SampledAt.IsZero() {
		metricAt = rich.SampledAt
	}
	network := metric.UploadMbps + metric.DownloadMbps
	snapshot.CPUUsage = &metric.CPUUsage
	snapshot.MemoryUsage = &metric.MemoryUsage
	snapshot.DiskUsage = &metric.DiskUsage
	snapshot.StorageUsage = &metric.DiskUsage
	snapshot.UploadMbps = &metric.UploadMbps
	snapshot.DownloadMbps = &metric.DownloadMbps
	snapshot.NetworkMbps = &network
	snapshot.Uptime = &metric.Uptime
	snapshot.MetricAt = &metricAt
	snapshot.CPUTemperature = &metric.CPUTemperature
	snapshot.CPUCores = &metric.CPUCores

	// Assign real raw bytes memory & disk
	if metric.TotalMemory > 0 {
		snapshot.MemoryTotal = metric.TotalMemory
	} else if metric.MemoryTotal > 0 {
		snapshot.MemoryTotal = metric.MemoryTotal
	} else if rich.MemoryUsed > 0 {
		snapshot.MemoryTotal = rich.MemoryUsed + rich.MemoryFree + rich.MemoryCached
	}

	if metric.FreeMemory > 0 && snapshot.MemoryTotal >= metric.FreeMemory {
		snapshot.MemoryUsed = snapshot.MemoryTotal - metric.FreeMemory
	} else if metric.MemoryUsed > 0 {
		snapshot.MemoryUsed = metric.MemoryUsed
	} else if rich.MemoryUsed > 0 {
		snapshot.MemoryUsed = rich.MemoryUsed
	}

	if metric.DiskTotal > 0 {
		snapshot.DiskTotal = metric.DiskTotal
	}
	if metric.DiskUsed > 0 {
		snapshot.DiskUsed = metric.DiskUsed
	}

	if rich.ID != uuid.Nil {
		snapshot.CPUFrequencyMHz = &rich.CPUFrequencyMHz
		snapshot.DiskReadBps = &rich.DiskReadBps
		snapshot.DiskWriteBps = &rich.DiskWriteBps
		snapshot.DiskIOPS = &rich.DiskIOPS
	}
	return snapshot
}

func (s *ServerService) GetServerByID(id uuid.UUID) (*models.Server, error) {
	return s.serverRepo.GetServer(id)
}

func (s *ServerService) GetServerByIDOrHostname(identifier string) (*models.Server, error) {
	return s.serverRepo.GetServerByIDOrHostname(identifier)
}

func (s *ServerService) GetServerSnapshotByIDOrHostname(identifier string) (*models.ServerSnapshot, error) {
	server, err := s.serverRepo.GetServerByIDOrHostname(identifier)
	if err != nil {
		return nil, err
	}
	latest, err := s.metricRepo.FindLatestByMachineIDs([]uuid.UUID{server.ID})
	if err != nil {
		return nil, err
	}
	rich, err := s.metricRepo.FindLatestRichByMachineIDs([]uuid.UUID{server.ID})
	if err != nil {
		return nil, err
	}
	snapshot := buildServerSnapshot(*server, latest[server.ID], rich[server.ID])
	return &snapshot, nil
}

func (s *ServerService) Save(server *models.Server) error {
	return s.serverRepo.UpdateServer(server)
}

func generateServerAPIKey() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "ip_live_" + uuid.New().String()
	}
	return "ip_live_" + hex.EncodeToString(bytes)
}

type ReSyncFleetResult struct {
	TotalEnrolled int      `json:"total_enrolled"`
	UpdatedCount  int      `json:"updated_count"`
	TargetURL     string   `json:"target_url"`
	Logs          []string `json:"logs"`
}

func (s *ServerService) ReSyncFleet(targetURL string) (*ReSyncFleetResult, error) {
	if targetURL == "" {
		targetURL = "http://192.168.1.86:8080"
	}
	servers, err := s.serverRepo.ListServers()
	if err != nil {
		return nil, err
	}

	res := &ReSyncFleetResult{
		TotalEnrolled: len(servers),
		TargetURL:     targetURL,
		Logs:          make([]string, 0),
	}

	for _, srv := range servers {
		if srv.IPAddress != "" {
			res.Logs = append(res.Logs, fmt.Sprintf("[%s] Over-The-Air IP sync targeted for host %s (%s)", srv.Hostname, srv.IPAddress, targetURL))
			res.UpdatedCount++
		}
	}

	return res, nil
}
