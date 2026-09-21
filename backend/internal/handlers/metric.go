package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/alerts"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/docker"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type MetricHandler struct {
	metricService *services.MetricService
	hub           *websocket.Hub
	eventBus      *events.EventBus
}

func NewMetricHandler(metricService *services.MetricService, hub *websocket.Hub, eventBus *events.EventBus) *MetricHandler {
	alerts.SetHub(hub)
	return &MetricHandler{
		metricService: metricService,
		hub:           hub,
		eventBus:      eventBus,
	}
}

type MetricsRequest struct {
	APIKey              string                           `json:"api_key"`
	Hostname            string                           `json:"hostname"`
	IPAddress           string                           `json:"ip_address"`
	OS                  string                           `json:"os"`
	Platform            string                           `json:"platform"`
	CPUUsage            float64                          `json:"cpu_usage"`
	MemoryPercent       float64                          `json:"memory_percent"`
	MemoryUsage         float64                          `json:"memory_usage"`
	DiskPercent         float64                          `json:"disk_percent"`
	DiskUsage           float64                          `json:"disk_usage"`
	UploadMbps          float64                          `json:"upload_mbps"`
	DownloadMbps        float64                          `json:"download_mbps"`
	Uptime              uint64                           `json:"uptime"`
	CPUTemperature      float64                          `json:"cpu_temperature"`
	CPUCores            int                              `json:"cpu_cores"`
	TotalMemory         uint64                           `json:"memory_total"`
	FreeMemory          uint64                           `json:"memory_free"`
	Kernel              string                           `json:"kernel"`
	Architecture        string                           `json:"architecture"`
	MACAddress          string                           `json:"mac_address"`
	CPUModel            string                           `json:"cpu_model"`
	Timezone            string                           `json:"timezone"`
	BootTime            uint64                           `json:"boot_time"`
	CPUPerCore          []float64                        `json:"cpu_per_core"`
	CPUFrequencyMHz     float64                          `json:"cpu_frequency_mhz"`
	Load1               float64                          `json:"load_1"`
	Load5               float64                          `json:"load_5"`
	Load15              float64                          `json:"load_15"`
	MemoryCached        uint64                           `json:"memory_cached"`
	SwapUsage           float64                          `json:"swap_usage"`
	DiskReadBps         float64                          `json:"disk_read_bps"`
	DiskWriteBps        float64                          `json:"disk_write_bps"`
	DiskIOPS            float64                          `json:"disk_iops"`
	LatencyMs           float64                          `json:"latency_ms"`
	PacketLoss          float64                          `json:"packet_loss"`
	Filesystems         []services.FilesystemInput       `json:"filesystems"`
	Processes           []services.ProcessInput          `json:"processes"`
	Services            []services.ServiceInput          `json:"services"`
	NetworkInterfaces   []services.NetworkInterfaceInput `json:"network_interfaces"`
	OpenPorts           []string                         `json:"open_ports"`
	SmartStatus         string                           `json:"smart_status"`
	RAIDStatus          string                           `json:"raid_status"`
	LVMStatus           string                           `json:"lvm_status"`
	DiskTemperature     float64                          `json:"disk_temperature"`
	DockerContainers    []services.DockerContainerInput  `json:"docker_containers"`
	DockerInstalled     bool                             `json:"docker_installed"`
	DockerVersion       services.DockerVersionInput      `json:"docker_version"`
	DockerImages        []services.DockerImageInput      `json:"docker_images"`
	DockerVolumes       []services.DockerVolumeInput     `json:"docker_volumes"`
	DockerNetworks      []services.DockerNetworkInput    `json:"docker_networks"`
	DockerEvents        []services.DockerEventInput      `json:"docker_events"`
	K8sInstalled        bool                             `json:"k8s_installed"`
	K8sClusterJSON      string                           `json:"k8s_cluster_json"`
	K8sNodesJSON        string                           `json:"k8s_nodes_json"`
	K8sPodsJSON         string                           `json:"k8s_pods_json"`
	K8sDeploymentsJSON  string                           `json:"k8s_deployments_json"`
	K8sStatefulSetsJSON string                           `json:"k8s_statefulsets_json"`
	K8sDaemonSetsJSON   string                           `json:"k8s_daemonsets_json"`
	K8sServicesJSON     string                           `json:"k8s_services_json"`
	K8sNamespacesJSON   string                           `json:"k8s_namespaces_json"`
	K8sStorageJSON      string                           `json:"k8s_storage_json"`
	K8sEventsJSON       string                           `json:"k8s_events_json"`
}

func (h *MetricHandler) ReceiveMetrics(c *gin.Context) {
	var req MetricsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}



	apiKey := c.GetString("api_key")
	if apiKey == "" {
		authHeader := c.GetHeader("Authorization")
		if len(authHeader) >= 7 && authHeader[:7] == "Bearer " {
			apiKey = authHeader[7:]
		}
	}
	if apiKey == "" {
		apiKey = "agent-key"
	}

	var machine *models.Machine

	// 1. If explicit server ID passed in URL param
	if c.Param("id") != "" {
		if id, err := uuid.Parse(c.Param("id")); err == nil {
			var mByID models.Machine
			if err := database.DB.Where("id = ?", id).First(&mByID).Error; err == nil {
				if (req.Hostname == "" || mByID.Hostname == "" || strings.EqualFold(mByID.Hostname, req.Hostname)) &&
					(req.OS == "" || mByID.OS == "" || strings.EqualFold(mByID.OS, req.OS)) {
					machine = &mByID
				}
			}
		}
	}

	// 2. Lookup by Hostname AND OS (preventing Windows vs Linux collision on same hostname)
	if machine == nil && req.Hostname != "" && req.OS != "" {
		var mByHostOS models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?) AND LOWER(os) = LOWER(?)", req.Hostname, req.OS).First(&mByHostOS).Error; err == nil {
			machine = &mByHostOS
		}
	}

	// 3. Lookup by Hostname AND IP Address
	if machine == nil && req.Hostname != "" && req.IPAddress != "" {
		var mByHostIP models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?) AND ip_address = ?", req.Hostname, req.IPAddress).First(&mByHostIP).Error; err == nil {
			machine = &mByHostIP
		}
	}

	// 4. Lookup by Hostname alone (if OS is compatible)
	if machine == nil && req.Hostname != "" {
		var mByHost models.Machine
		if err := database.DB.Where("LOWER(hostname) = LOWER(?)", req.Hostname).First(&mByHost).Error; err == nil {
			if mByHost.OS == "" || strings.EqualFold(mByHost.OS, req.OS) {
				machine = &mByHost
			}
		}
	}

	// 5. Lookup by API Key if nothing matched
	if machine == nil && apiKey != "" {
		var mByAPI models.Machine
		if err := database.DB.Where("api_key = ?", apiKey).First(&mByAPI).Error; err == nil {
			if mByAPI.OS == "" || strings.EqualFold(mByAPI.OS, req.OS) {
				machine = &mByAPI
			}
		}
	}

	// 6. Before auto-provisioning, verify host is not blocked in servers registry
	if machine == nil && database.DB != nil && (req.Hostname != "" || req.IPAddress != "") {
		var count int64
		_ = database.DB.Raw("SELECT COUNT(*) FROM servers WHERE (LOWER(hostname) = LOWER(?) OR ip_address = ?) AND (is_blocked = true OR LOWER(status) = 'blocked' OR LOWER(status) = 'stopped')", req.Hostname, req.IPAddress).Scan(&count).Error
		if count > 0 {
			c.JSON(http.StatusForbidden, gin.H{
				"error":  "Machine is stopped or blocked by administrator.",
				"status": "blocked",
			})
			return
		}
	}

	// 7. Auto-provision distinct server record if this is a newly connected host / OS
	if machine == nil && req.Hostname != "" {
		newID := uuid.New()
		if c.Param("id") != "" {
			if parsed, err := uuid.Parse(c.Param("id")); err == nil {
				var count int64
				if database.DB != nil {
					database.DB.Model(&models.Server{}).Where("id = ?", parsed).Count(&count)
					if count == 0 {
						newID = parsed
					}
				}
			}
		}

		newServer := &models.Server{
			ID:           newID,
			Name:         req.Hostname,
			Hostname:     req.Hostname,
			IPAddress:    req.IPAddress,
			OS:           req.OS,
			Platform:     req.Platform,
			Kernel:       req.Kernel,
			Architecture: req.Architecture,
			MACAddress:   req.MACAddress,
			CPUModel:     req.CPUModel,
			Status:       "ONLINE",
			Online:       true,
			HealthScore:  100,
			LastSeen:     time.Now().UTC(),
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
			APIKey:       "ip_live_" + strings.ReplaceAll(uuid.New().String(), "-", ""),
			Organization: "Default Organization",
			ResourceType: req.OS,
		}

		if database.DB != nil {
			if err := database.DB.Create(newServer).Error; err == nil {
				machine = newServer
			}
		}
	}

	if machine == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "Unable to identify or provision machine",
			"status": "unregistered",
		})
		return
	}

	// 8. If machine is explicitly BLOCKED or STOPPED, reject telemetry
	if machine != nil && (machine.IsBlocked || strings.EqualFold(machine.Status, "BLOCKED") || strings.EqualFold(machine.Status, "STOPPED")) {
		c.JSON(http.StatusForbidden, gin.H{
			"error":  "Machine is stopped or blocked by administrator.",
			"status": "blocked",
		})
		return
	}

	// 9. Direct database SQL check to guarantee blocked status in servers table
	if database.DB != nil && machine != nil {
		var count int64
		_ = database.DB.Raw("SELECT COUNT(*) FROM servers WHERE (id = ? OR LOWER(hostname) = LOWER(?) OR ip_address = ?) AND (is_blocked = true OR LOWER(status) = 'blocked' OR LOWER(status) = 'stopped')", machine.ID, machine.Hostname, machine.IPAddress).Scan(&count).Error
		if count > 0 {
			c.JSON(http.StatusForbidden, gin.H{
				"error":  "Machine is stopped or blocked by administrator.",
				"status": "blocked",
			})
			return
		}
	}

	memPct := req.MemoryPercent
	if memPct == 0 && req.MemoryUsage != 0 {
		memPct = req.MemoryUsage
	}
	diskPct := req.DiskPercent
	if diskPct == 0 && req.DiskUsage != 0 {
		diskPct = req.DiskUsage
	}

	input := services.SaveMetricInput{
		APIKey:              apiKey,
		CPUUsage:            req.CPUUsage,
		MemoryPercent:       memPct,
		DiskPercent:         diskPct,
		UploadMbps:          req.UploadMbps,
		DownloadMbps:        req.DownloadMbps,
		Uptime:              req.Uptime,
		Hostname:            req.Hostname,
		IPAddress:           req.IPAddress,
		OS:                  req.OS,
		CPUTemperature:      req.CPUTemperature,
		CPUCores:            req.CPUCores,
		TotalMemory:         req.TotalMemory,
		FreeMemory:          req.FreeMemory,
		Kernel:              req.Kernel,
		Architecture:        req.Architecture,
		MACAddress:          req.MACAddress,
		CPUModel:            req.CPUModel,
		Timezone:            req.Timezone,
		BootTime:            req.BootTime,
		CPUPerCore:          req.CPUPerCore,
		CPUFrequencyMHz:     req.CPUFrequencyMHz,
		Load1:               req.Load1,
		Load5:               req.Load5,
		Load15:              req.Load15,
		MemoryCached:        req.MemoryCached,
		SwapUsage:           req.SwapUsage,
		DiskReadBps:         req.DiskReadBps,
		DiskWriteBps:        req.DiskWriteBps,
		DiskIOPS:            req.DiskIOPS,
		LatencyMs:           req.LatencyMs,
		PacketLoss:          req.PacketLoss,
		Filesystems:         req.Filesystems,
		Processes:           req.Processes,
		Services:            req.Services,
		NetworkInterfaces:   req.NetworkInterfaces,
		OpenPorts:           req.OpenPorts,
		SmartStatus:         req.SmartStatus,
		RAIDStatus:          req.RAIDStatus,
		LVMStatus:           req.LVMStatus,
		DiskTemperature:     req.DiskTemperature,
		DockerContainers:    req.DockerContainers,
		DockerInstalled:     req.DockerInstalled,
		DockerVersion:       req.DockerVersion,
		DockerImages:        req.DockerImages,
		DockerVolumes:       req.DockerVolumes,
		DockerNetworks:      req.DockerNetworks,
		DockerEvents:        req.DockerEvents,
		K8sInstalled:        req.K8sInstalled,
		K8sClusterJSON:      req.K8sClusterJSON,
		K8sNodesJSON:        req.K8sNodesJSON,
		K8sPodsJSON:         req.K8sPodsJSON,
		K8sDeploymentsJSON:  req.K8sDeploymentsJSON,
		K8sStatefulSetsJSON: req.K8sStatefulSetsJSON,
		K8sDaemonSetsJSON:   req.K8sDaemonSetsJSON,
		K8sServicesJSON:     req.K8sServicesJSON,
		K8sNamespacesJSON:   req.K8sNamespacesJSON,
		K8sStorageJSON:      req.K8sStorageJSON,
		K8sEventsJSON:       req.K8sEventsJSON,
	}

	metric, persistedMachine, err := h.metricService.SaveMetric(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to persist metrics"})
		return
	}

	// Persist detailed Docker host/container metrics
	_ = docker.SaveDockerMetrics(
		persistedMachine.ID,
		input.DockerInstalled,
		input.DockerVersion,
		input.DockerContainers,
		input.DockerImages,
		input.DockerVolumes,
		input.DockerNetworks,
		input.DockerEvents,
	)

	// Sprint 7.11: Automatically calculate and update Machine Health Score
	healthScore := services.CalculateHealthScore(
		input.CPUUsage,
		input.MemoryPercent,
		input.DiskPercent,
		input.LatencyMs,
		input.PacketLoss,
	)
	persistedMachine.HealthScore = healthScore
	if database.DB != nil {
		database.DB.Model(&models.Machine{}).Where("id = ?", persistedMachine.ID).Update("health_score", healthScore)
	}

	// Enterprise Unified Alert & Health Check Evaluation (with deduplication & auto-resolution)
	if err := alerts.EvaluateMetrics(
		*persistedMachine,
		*metric,
		input,
	); err != nil {
		log.Printf("[Alert Engine] Evaluation error for machine %s: %v", persistedMachine.Hostname, err)
	}

	fmt.Printf("Persisted metrics from %s: CPU: %.1f%%, RAM: %.1f%%, Disk: %.1f%%\n",
		persistedMachine.Hostname, input.CPUUsage, input.MemoryPercent, input.DiskPercent)

	log.Printf("Metrics received from %s", persistedMachine.Hostname)

	// Publish MetricReceivedEvent to the Event Bus
	metricEvent := events.MetricReceivedEvent{
		MachineID: machine.ID.String(),
		CPU:       input.CPUUsage,
		Memory:    input.MemoryPercent,
		Disk:      input.DiskPercent,
		Upload:    input.UploadMbps,
		Download:  input.DownloadMbps,
		Time:      metric.CreatedAt,
	}

	// Publish event asynchronously
	go h.eventBus.Publish(metricEvent)

	// Broadcast live metrics_update payload to WebSocket hub
	dashboardPayload := websocket.MetricUpdatedPayload{
		Type:         "metrics_update",
		MachineID:    persistedMachine.ID.String(),
		Hostname:     persistedMachine.Hostname,
		OS:           persistedMachine.OS,
		Platform:     persistedMachine.Platform,
		IPAddress:    persistedMachine.IPAddress,
		LatencyMs:    input.LatencyMs,
		CPU:          input.CPUUsage,
		CPUUsage:     input.CPUUsage,
		Memory:       input.MemoryPercent,
		MemoryUsage:  input.MemoryPercent,
		Disk:         input.DiskPercent,
		DiskUsage:    input.DiskPercent,
		Upload:       input.UploadMbps,
		UploadMbps:   input.UploadMbps,
		Download:     input.DownloadMbps,
		MemoryTotal:  input.TotalMemory,
		MemoryUsed:   func() uint64 { if input.TotalMemory > input.FreeMemory { return input.TotalMemory - input.FreeMemory }; return 0 }(),
		DiskTotal:    metric.DiskTotal,
		DiskUsed:     metric.DiskUsed,
		CPUCores:     input.CPUCores,
		Time:         metric.CreatedAt,
	}

	h.hub.BroadcastJSON(dashboardPayload)

	// Publish structured event via WS room
	websocket.PublishMetricUpdated(persistedMachine.ID.String(), dashboardPayload)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Metrics persisted",
		"machine_id": persistedMachine.ID,
		"metric_id":  metric.ID,
		"created_at": metric.CreatedAt,
	})
}

func (h *MetricHandler) GetMachineMetrics(c *gin.Context) {
	// Phase 3.6: Fetch param machine ID from route :id
	machineIDStr := c.Param("id")
	if machineIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing machine ID"})
		return
	}

	cleanIDStr := machineIDStr
	targetOS := ""
	if strings.HasSuffix(machineIDStr, "_linux") {
		cleanIDStr = strings.TrimSuffix(machineIDStr, "_linux")
		targetOS = "linux"
	} else if strings.HasSuffix(machineIDStr, "_windows") {
		cleanIDStr = strings.TrimSuffix(machineIDStr, "_windows")
		targetOS = "windows"
	}

	var machineUUID uuid.UUID
	var err error
	if parsed, parseErr := uuid.Parse(cleanIDStr); parseErr == nil {
		var machine models.Machine
		q := database.DB.Where("id = ?", parsed)
		if targetOS != "" {
			q = q.Where("LOWER(os) = LOWER(?)", targetOS)
		}
		if err := q.First(&machine).Error; err == nil {
			machineUUID = machine.ID
		} else {
			machineUUID = parsed
		}
	} else {
		var machine models.Machine
		q := database.DB.Where("LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR id::text LIKE ?", cleanIDStr, cleanIDStr, cleanIDStr+"%")
		if targetOS != "" {
			q = q.Where("LOWER(os) = LOWER(?)", targetOS)
		}
		if err := q.First(&machine).Error; err == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusNotFound, gin.H{"error": "Machine not found"})
			return
		}
	}

	// Phase 3.6: Parse range query parameter
	window := c.Query("range")
	var since time.Time
	now := time.Now()

	switch window {
	case "15m":
		since = now.Add(-15 * time.Minute)
	case "24h":
		since = now.Add(-24 * time.Hour)
	case "7d":
		since = now.Add(-7 * 24 * time.Hour)
	case "1h":
		fallthrough
	default:
		since = now.Add(-1 * time.Hour)
	}

	metrics, err := h.metricService.GetRecentMachineMetrics(machineUUID, since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query historical metrics"})
		return
	}

	c.JSON(http.StatusOK, metrics)
}
