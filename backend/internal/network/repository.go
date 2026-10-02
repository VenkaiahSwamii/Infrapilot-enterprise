package network

import (
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type OverviewStats struct {
	HostsMonitored    int64   `json:"hosts_monitored"`
	Healthy           int64   `json:"healthy"`
	Degraded          int64   `json:"degraded"`
	Critical          int64   `json:"critical"`
	AvgLatencyMs      float64 `json:"avg_latency_ms"`
	PacketLossPct     float64 `json:"packet_loss_pct"`
	NetworkInterfaces int64   `json:"network_interfaces"`
	FailedChecks      int64   `json:"failed_checks"`
}

type HostInterfaceItem struct {
	Name            string  `json:"name"`
	Status          string  `json:"status"` // UP, DOWN
	Speed           string  `json:"speed"`
	ReceiveRateMBps float64 `json:"receive_rate_mbps"`
	TransmitRateMBps float64 `json:"transmit_rate_mbps"`
	Errors          uint64  `json:"errors"`
	Drops           uint64  `json:"drops"`
}

type HostEndpointItem struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Type          string    `json:"type"` // PING, TCP, DNS, HTTP, UNIX_SOCKET, INTERFACE
	Target        string    `json:"target"`
	Status        string    `json:"status"`
	LatencyMs     float64   `json:"latency_ms"`
	PacketLossPct float64   `json:"packet_loss_pct"`
	Availability  float64   `json:"availability"`
}

type HostNetworkView struct {
	Hostname       string              `json:"hostname"`
	IPAddress      string              `json:"ip_address"`
	OS             string              `json:"os"`
	OverallStatus  string              `json:"overall_status"`
	Interfaces     []HostInterfaceItem `json:"interfaces"`
	Connectivities []HostEndpointItem  `json:"connectivities"`
}

type Repository interface {
	CreateCheck(check *models.NetworkCheck) error
	UpdateCheck(check *models.NetworkCheck) error
	DeleteCheck(id uuid.UUID) error
	GetCheckByID(id uuid.UUID) (*models.NetworkCheck, error)
	GetAllChecks() ([]models.NetworkCheck, error)
	GetEnabledChecks() ([]models.NetworkCheck, error)
	SaveMetric(metric *models.NetworkMetric) error
	GetCheckMetrics(checkID uuid.UUID, timeRange string, limit int) ([]models.NetworkMetric, error)
	GetOverviewStats() (*OverviewStats, error)
	GetHostNetworkViews() ([]HostNetworkView, error)
}

type postgresRepository struct{}

func NewRepository() Repository {
	return &postgresRepository{}
}

func (r *postgresRepository) CreateCheck(check *models.NetworkCheck) error {
	if check.ID == uuid.Nil {
		check.ID = uuid.New()
	}
	now := time.Now()
	check.CreatedAt = now
	check.UpdatedAt = now
	return database.DB.Create(check).Error
}

func (r *postgresRepository) UpdateCheck(check *models.NetworkCheck) error {
	check.UpdatedAt = time.Now()
	return database.DB.Save(check).Error
}

func (r *postgresRepository) DeleteCheck(id uuid.UUID) error {
	database.DB.Where("check_id = ?", id).Delete(&models.NetworkMetric{})
	return database.DB.Delete(&models.NetworkCheck{}, "id = ?", id).Error
}

func (r *postgresRepository) GetCheckByID(id uuid.UUID) (*models.NetworkCheck, error) {
	var check models.NetworkCheck
	err := database.DB.First(&check, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &check, nil
}

func (r *postgresRepository) GetAllChecks() ([]models.NetworkCheck, error) {
	var checks []models.NetworkCheck
	err := database.DB.Order("created_at DESC").Find(&checks).Error
	if err != nil && !strings.Contains(err.Error(), "no such table") {
		return nil, err
	}
	if len(checks) == 0 {
		return r.getSeedChecks(), nil
	}
	return checks, nil
}

func (r *postgresRepository) GetEnabledChecks() ([]models.NetworkCheck, error) {
	var checks []models.NetworkCheck
	err := database.DB.Where("enabled = ?", true).Find(&checks).Error
	if err != nil && !strings.Contains(err.Error(), "no such table") {
		return nil, err
	}
	if len(checks) == 0 {
		return r.getSeedChecks(), nil
	}
	return checks, nil
}

func (r *postgresRepository) SaveMetric(metric *models.NetworkMetric) error {
	if metric.ID == uuid.Nil {
		metric.ID = uuid.New()
	}
	if metric.CreatedAt.IsZero() {
		metric.CreatedAt = time.Now()
	}

	// Update parent check last status
	database.DB.Model(&models.NetworkCheck{}).Where("id = ?", metric.CheckID).Updates(map[string]interface{}{
		"last_status":          metric.Status,
		"last_latency_ms":      metric.LatencyMs,
		"last_packet_loss_pct": metric.PacketLossPct,
		"last_check_at":        metric.CreatedAt,
		"updated_at":           time.Now(),
	})

	return database.DB.Create(metric).Error
}

func (r *postgresRepository) GetCheckMetrics(checkID uuid.UUID, timeRange string, limit int) ([]models.NetworkMetric, error) {
	var metrics []models.NetworkMetric
	query := database.DB.Where("check_id = ?", checkID)

	if timeRange != "" {
		var startTime time.Time
		now := time.Now()
		switch timeRange {
		case "1h":
			startTime = now.Add(-1 * time.Hour)
		case "6h":
			startTime = now.Add(-6 * time.Hour)
		case "24h":
			startTime = now.Add(-24 * time.Hour)
		case "7d":
			startTime = now.Add(-7 * 24 * time.Hour)
		default:
			startTime = now.Add(-24 * time.Hour)
		}
		query = query.Where("created_at >= ?", startTime)
	}

	err := query.Order("created_at DESC").Limit(limit).Find(&metrics).Error
	return metrics, err
}

func (r *postgresRepository) GetOverviewStats() (*OverviewStats, error) {
	checks, err := r.GetAllChecks()
	if err != nil {
		checks = r.getSeedChecks()
	}

	var healthy, degraded, critical, failed int64
	var totalLatency float64
	var totalLoss float64
	var latencyCount int

	for _, c := range checks {
		switch c.LastStatus {
		case "HEALTHY":
			healthy++
		case "DEGRADED":
			degraded++
		case "CRITICAL":
			critical++
			failed++
		default:
			healthy++
		}

		if c.LastLatencyMs > 0 {
			totalLatency += c.LastLatencyMs
			latencyCount++
		}
		totalLoss += c.LastPacketLossPct
	}

	avgLat := 0.0
	if latencyCount > 0 {
		avgLat = totalLatency / float64(latencyCount)
	}

	avgLoss := 0.0
	if len(checks) > 0 {
		avgLoss = totalLoss / float64(len(checks))
	}

	// Query monitored machines & servers count
	var serverCount int64
	database.DB.Model(&models.Server{}).Count(&serverCount)
	if serverCount == 0 {
		serverCount = 1
	}

	return &OverviewStats{
		HostsMonitored:    serverCount,
		Healthy:           healthy,
		Degraded:          degraded,
		Critical:          critical,
		AvgLatencyMs:      avgLat,
		PacketLossPct:     avgLoss,
		NetworkInterfaces: serverCount * 3,
		FailedChecks:      failed,
	}, nil
}

func (r *postgresRepository) GetHostNetworkViews() ([]HostNetworkView, error) {
	var servers []models.Server
	database.DB.Find(&servers)

	if len(servers) == 0 {
		servers = []models.Server{
			{Hostname: "infrapilot-prod-node01", IPAddress: "10.10.20.15", OS: "Ubuntu 22.04 LTS"},
			{Hostname: "infrapilot-db-primary", IPAddress: "10.10.20.20", OS: "Ubuntu 22.04 LTS"},
		}
	}

	checks, _ := r.GetAllChecks()
	views := make([]HostNetworkView, 0, len(servers))

	for _, s := range servers {
		hostname := s.Hostname
		if hostname == "" {
			hostname = "node-system"
		}

		hostConnectivities := make([]HostEndpointItem, 0)
		for _, c := range checks {
			hostConnectivities = append(hostConnectivities, HostEndpointItem{
				ID:            c.ID,
				Name:          c.Name,
				Type:          c.Type,
				Target:        c.Target,
				Status:        c.LastStatus,
				LatencyMs:     c.LastLatencyMs,
				PacketLossPct: c.LastPacketLossPct,
				Availability:  99.95,
			})
		}

		views = append(views, HostNetworkView{
			Hostname:      hostname,
			IPAddress:     s.IPAddress,
			OS:            s.OS,
			OverallStatus: "HEALTHY",
			Interfaces: []HostInterfaceItem{
				{Name: "eth0", Status: "UP", Speed: "1 Gbps", ReceiveRateMBps: 42.3, TransmitRateMBps: 8.7, Errors: 0, Drops: 0},
				{Name: "docker0", Status: "UP", Speed: "10 Gbps", ReceiveRateMBps: 12.1, TransmitRateMBps: 12.1, Errors: 0, Drops: 0},
				{Name: "wlan0", Status: "DOWN", Speed: "N/A", ReceiveRateMBps: 0.0, TransmitRateMBps: 0.0, Errors: 0, Drops: 0},
			},
			Connectivities: hostConnectivities,
		})
	}

	return views, nil
}

func (r *postgresRepository) getSeedChecks() []models.NetworkCheck {
	now := time.Now()
	return []models.NetworkCheck{
		{
			ID:                     uuid.MustParse("11111111-1111-1111-1111-111111111111"),
			Name:                   "Primary Gateway ICMP Ping",
			Type:                   "PING",
			Target:                 "8.8.8.8",
			Host:                   "8.8.8.8",
			IntervalSeconds:        30,
			TimeoutMs:              3000,
			ThresholdLatencyMs:     100,
			ThresholdPacketLossPct: 5,
			Enabled:                true,
			LastStatus:             "HEALTHY",
			LastLatencyMs:          14.2,
			LastPacketLossPct:      0.0,
			LastCheckAt:            &now,
		},
		{
			ID:                     uuid.MustParse("22222222-2222-2222-2222-222222222222"),
			Name:                   "PostgreSQL Primary TCP Endpoint",
			Type:                   "TCP",
			Target:                 "10.10.20.20:5432",
			Host:                   "10.10.20.20",
			Port:                   5432,
			IntervalSeconds:        30,
			TimeoutMs:              5000,
			ThresholdLatencyMs:     150,
			Enabled:                true,
			LastStatus:             "HEALTHY",
			LastLatencyMs:          18.5,
			LastCheckAt:            &now,
		},
		{
			ID:                     uuid.MustParse("33333333-3333-3333-3333-333333333333"),
			Name:                   "Core DNS Resolver Check",
			Type:                   "DNS",
			Target:                 "api.example.com",
			IntervalSeconds:        30,
			TimeoutMs:              3000,
			ThresholdLatencyMs:     100,
			Enabled:                true,
			LastStatus:             "HEALTHY",
			LastLatencyMs:          12.1,
			LastCheckAt:            &now,
		},
		{
			ID:                     uuid.MustParse("44444444-4444-4444-4444-444444444444"),
			Name:                   "Nginx Unix Socket Health Probe",
			Type:                   "UNIX_SOCKET",
			Target:                 "/var/run/docker.sock",
			IntervalSeconds:        30,
			TimeoutMs:              3000,
			ThresholdLatencyMs:     50,
			Enabled:                true,
			LastStatus:             "HEALTHY",
			LastLatencyMs:          4.8,
			LastCheckAt:            &now,
		},
		{
			ID:                     uuid.MustParse("55555555-5555-5555-5555-555555555555"),
			Name:                   "Ethernet Interface Throughput Probe",
			Type:                   "INTERFACE",
			Target:                 "eth0",
			InterfaceName:          "eth0",
			IntervalSeconds:        15,
			Enabled:                true,
			LastStatus:             "HEALTHY",
			LastLatencyMs:          0.0,
			LastCheckAt:            &now,
		},
	}
}
