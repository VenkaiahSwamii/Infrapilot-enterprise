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
	if database.DB == nil {
		return []models.NetworkCheck{}, nil
	}
	err := database.DB.Order("created_at DESC").Find(&checks).Error
	if err != nil && !strings.Contains(err.Error(), "no such table") {
		return nil, err
	}
	return checks, nil
}

func (r *postgresRepository) GetEnabledChecks() ([]models.NetworkCheck, error) {
	var checks []models.NetworkCheck
	if database.DB == nil {
		return []models.NetworkCheck{}, nil
	}
	err := database.DB.Where("enabled = ?", true).Find(&checks).Error
	if err != nil && !strings.Contains(err.Error(), "no such table") {
		return nil, err
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
		return &OverviewStats{}, err
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
	if database.DB != nil {
		database.DB.Model(&models.Server{}).Count(&serverCount)
	}

	return &OverviewStats{
		HostsMonitored:    serverCount,
		Healthy:           healthy,
		Degraded:          degraded,
		Critical:          critical,
		AvgLatencyMs:      avgLat,
		PacketLossPct:     avgLoss,
		NetworkInterfaces: serverCount,
		FailedChecks:      failed,
	}, nil
}

func (r *postgresRepository) GetHostNetworkViews() ([]HostNetworkView, error) {
	var servers []models.Server
	if database.DB != nil {
		database.DB.Find(&servers)
	}

	if len(servers) == 0 {
		return []HostNetworkView{}, nil
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
			Hostname:       hostname,
			IPAddress:      s.IPAddress,
			OS:             s.OS,
			OverallStatus:  "HEALTHY",
			Interfaces:     []HostInterfaceItem{},
			Connectivities: hostConnectivities,
		})
	}

	return views, nil
}

func (r *postgresRepository) getSeedChecks() []models.NetworkCheck {
	return []models.NetworkCheck{}
}
