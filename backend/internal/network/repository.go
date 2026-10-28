package network

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"infrapilot/backend/internal/config"
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
		return r.getSeedChecks(), nil
	}
	err := database.DB.Order("created_at DESC").Find(&checks).Error
	if err != nil && !strings.Contains(err.Error(), "no such table") {
		return nil, err
	}
	if len(checks) == 0 {
		return r.SeedDefaultChecks(), nil
	}
	return checks, nil
}

func (r *postgresRepository) GetEnabledChecks() ([]models.NetworkCheck, error) {
	var checks []models.NetworkCheck
	if database.DB == nil {
		return r.getSeedChecks(), nil
	}
	err := database.DB.Where("enabled = ?", true).Find(&checks).Error
	if err != nil && !strings.Contains(err.Error(), "no such table") {
		return nil, err
	}
	if len(checks) == 0 {
		return r.SeedDefaultChecks(), nil
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
		switch strings.ToUpper(strings.TrimSpace(c.LastStatus)) {
		case "HEALTHY":
			healthy++
		case "DEGRADED":
			degraded++
		case "CRITICAL":
			critical++
			failed++
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
		hasCritical := false
		hasDegraded := false
		healthyChecks := 0

		for _, c := range checks {
			avail := 100.0
			st := strings.ToUpper(strings.TrimSpace(c.LastStatus))
			if st == "CRITICAL" {
				hasCritical = true
				avail = 0.0
			} else if st == "DEGRADED" {
				hasDegraded = true
				avail = 50.0
			} else if st == "HEALTHY" {
				healthyChecks++
				avail = 100.0
			} else {
				avail = 0.0
			}

			hostConnectivities = append(hostConnectivities, HostEndpointItem{
				ID:            c.ID,
				Name:          c.Name,
				Type:          c.Type,
				Target:        c.Target,
				Status:        c.LastStatus,
				LatencyMs:     c.LastLatencyMs,
				PacketLossPct: c.LastPacketLossPct,
				Availability:  avail,
			})
		}

		overallStatus := "UNKNOWN"
		if len(checks) > 0 {
			if hasCritical {
				overallStatus = "CRITICAL"
			} else if hasDegraded {
				overallStatus = "DEGRADED"
			} else if healthyChecks == len(checks) {
				overallStatus = "HEALTHY"
			} else {
				overallStatus = "PENDING"
			}
		}

		views = append(views, HostNetworkView{
			Hostname:       hostname,
			IPAddress:      s.IPAddress,
			OS:             s.OS,
			OverallStatus:  overallStatus,
			Interfaces:     []HostInterfaceItem{},
			Connectivities: hostConnectivities,
		})
	}

	return views, nil
}

func (r *postgresRepository) getSeedChecks() []models.NetworkCheck {
	now := time.Now()
	var checks []models.NetworkCheck

	cfg := config.Get()
	if cfg != nil && len(cfg.Agent.Network.Websites) > 0 {
		for _, w := range cfg.Agent.Network.Websites {
			host := ""
			if u, err := url.Parse(w.URL); err == nil && u.Hostname() != "" {
				host = u.Hostname()
			}
			thresh := w.AlertThresholdMs
			if thresh <= 0 {
				thresh = 200.0
			}
			timeout := w.TimeoutMs
			if timeout <= 0 {
				timeout = 3000
			}
			checks = append(checks, models.NetworkCheck{
				ID:                     uuid.New(),
				Name:                   w.Name,
				Type:                   "HTTP",
				Target:                 w.URL,
				Host:                   host,
				Port:                   w.Port,
				URL:                    w.URL,
				IntervalSeconds:        10,
				TimeoutMs:              timeout,
				ThresholdLatencyMs:     thresh,
				ThresholdPacketLossPct: 5.0,
				Enabled:                true,
				LastStatus:             "PENDING",
				LastLatencyMs:          0.0,
				LastPacketLossPct:      0.0,
				LastCheckAt:            nil,
				CreatedAt:              now,
				UpdatedAt:              now,
			})
		}
	}
	gw := ""
	if cfg != nil && cfg.Agent.Network.DefaultGateway != "" {
		gw = cfg.Agent.Network.DefaultGateway
	} else if cfg != nil && cfg.BackendURL != "" {
		if u, err := url.Parse(cfg.BackendURL); err == nil && u.Hostname() != "" {
			gw = u.Hostname()
		}
	}
	if gw != "" {
		checks = append(checks,
			models.NetworkCheck{
				ID:                     uuid.New(),
				Name:                   "Network Default Gateway",
				Type:                   "PING",
				Target:                 gw,
				Host:                   gw,
				Port:                   80,
				IntervalSeconds:        10,
				TimeoutMs:              2000,
				ThresholdLatencyMs:     100.0,
				ThresholdPacketLossPct: 10.0,
				Enabled:                true,
				LastStatus:             "PENDING",
				LastLatencyMs:          0.0,
				LastPacketLossPct:      0.0,
				LastCheckAt:            nil,
				CreatedAt:              now,
				UpdatedAt:              now,
			},
		)
	}

	if cfg != nil && cfg.DBHost != "" {
		dbHost := cfg.DBHost
		dbPort := 5432
		if p, err := strconv.Atoi(cfg.DBPort); err == nil && p > 0 {
			dbPort = p
		}
		dbTarget := fmt.Sprintf("%s:%d", dbHost, dbPort)

		checks = append(checks,
			models.NetworkCheck{
				ID:                     uuid.New(),
				Name:                   "Core Database Port",
				Type:                   "TCP",
				Target:                 dbTarget,
				Host:                   dbHost,
				Port:                   dbPort,
				IntervalSeconds:        15,
				TimeoutMs:              2000,
				ThresholdLatencyMs:     50.0,
				ThresholdPacketLossPct: 5.0,
				Enabled:                true,
				LastStatus:             "PENDING",
				LastLatencyMs:          0.0,
				LastPacketLossPct:      0.0,
				LastCheckAt:            nil,
				CreatedAt:              now,
				UpdatedAt:              now,
			},
		)
	}
	return checks
}

func (r *postgresRepository) SeedDefaultChecks() []models.NetworkCheck {
	seeds := r.getSeedChecks()
	if database.DB == nil {
		return seeds
	}
	// Clean up obsolete legacy checks
	database.DB.Where("name IN ?", []string{"Public Gateway / DNS", "Local DNS Resolver"}).Delete(&models.NetworkCheck{})

	for i := range seeds {
		var existing models.NetworkCheck
		if err := database.DB.Where("name = ? OR target = ?", seeds[i].Name, seeds[i].Target).First(&existing).Error; err != nil {
			_ = database.DB.Create(&seeds[i]).Error
		} else {
			existing.Target = seeds[i].Target
			existing.URL = seeds[i].URL
			existing.Host = seeds[i].Host
			existing.Port = seeds[i].Port
			existing.Type = seeds[i].Type
			existing.ThresholdLatencyMs = seeds[i].ThresholdLatencyMs
			_ = database.DB.Save(&existing).Error
		}
	}
	var all []models.NetworkCheck
	if err := database.DB.Order("created_at ASC").Find(&all).Error; err == nil && len(all) > 0 {
		return all
	}
	return seeds
}
