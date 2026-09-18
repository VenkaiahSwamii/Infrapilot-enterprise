package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/observability"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/websocket"

	"github.com/gin-gonic/gin"
)

type InfrastructureCategory struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Count       int    `json:"count"`
	Online      int    `json:"online"`
	Warning     int    `json:"warning"`
	Critical    int    `json:"critical"`
}

type OverviewResponse struct {
	Organizations    int                      `json:"organizations"`
	Users            int64                    `json:"users"`
	TotalServers     int                      `json:"total_servers"`
	Online           int                      `json:"online"`
	Offline          int                      `json:"offline"`
	Warning          int                      `json:"warning"`
	Critical         int                      `json:"critical"`
	HealthScore      int                      `json:"health_score"`
	Categories       []InfrastructureCategory `json:"categories"`
	DockerContainers int                      `json:"docker_containers"`
	KubernetesPods   int                      `json:"kubernetes_pods"`
	KubernetesNodes  int                      `json:"kubernetes_nodes"`
	ActiveAlerts     int64                    `json:"active_alerts"`
	CPUAverage       float64                  `json:"cpu_average"`
	MemoryAverage    float64                  `json:"memory_average"`
	DiskAverage      float64                  `json:"disk_average"`
	QueueLength      int64                    `json:"queue_length"`
	ActiveSockets    int                      `json:"active_sockets"`
	BackendCPU       float64                  `json:"backend_cpu"`
	BackendRAM       float64                  `json:"backend_ram"`
	APILatency       float64                  `json:"api_latency"`
	DBConnections    int                      `json:"db_connections"`
	RedisUsage       float64                  `json:"redis_usage"`
	RequestsPerSec   int64                    `json:"requests_per_sec"`
	ConnectedAgents  int                      `json:"connected_agents"`
}

func EnterpriseOverview(c *gin.Context) {
	var machines []models.Machine
	if err := database.DB.Preload("LinuxMetric").Preload("LinuxDocker").Find(&machines).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load infrastructure overview"})
		return
	}

	var userCount int64
	database.DB.Model(&models.User{}).Count(&userCount)

	categoryOrder := []InfrastructureCategory{
		{ID: "linux", Label: "Linux Servers", Description: "Ubuntu, Debian, RHEL, Rocky, Amazon Linux"},
		{ID: "windows", Label: "Windows Servers", Description: "Windows Server and workstation assets"},
		{ID: "docker", Label: "Docker Hosts", Description: "Container hosts, images, volumes, networks"},
		{ID: "kubernetes", Label: "Kubernetes Clusters", Description: "Clusters, nodes, pods, workloads, PV/PVC"},
		{ID: "vmware", Label: "VMware", Description: "ESXi hosts, datastores, virtual machines"},
		{ID: "storage", Label: "Storage", Description: "NAS, SAN, NFS, Ceph, LVM, RAID"},
		{ID: "cloud", Label: "Cloud Instances", Description: "AWS EC2, Azure VM, Google Compute"},
		{ID: "database", Label: "Databases", Description: "PostgreSQL, MySQL, MongoDB, Redis"},
	}

	categories := make(map[string]*InfrastructureCategory)
	for index := range categoryOrder {
		category := categoryOrder[index]
		categories[category.ID] = &category
	}

	organizations := map[string]bool{}
	online := 0
	warning := 0
	critical := 0

	for _, machine := range machines {
		org := machine.Organization
		if strings.TrimSpace(org) == "" {
			org = "Default Organization"
		}
		organizations[org] = true

		categoryID := normalizeOverviewType(machine)
		category, exists := categories[categoryID]
		if !exists {
			category = &InfrastructureCategory{ID: "server", Label: "Servers", Description: "Unclassified infrastructure"}
			categories[categoryID] = category
		}

		category.Count++
		status := services.EvaluateMachineStatus(machine.LastSeen, time.Now().UTC())
		if status == "ONLINE" {
			online++
			category.Online++
		} else {
			category.Critical++
			critical++
		}
	}

	total := len(machines)
	offline := total - online
	score := 100
	if total > 0 {
		score = 100 - int(float64(offline)/float64(total)*55) - warning*3 - critical*4
		if score < 0 {
			score = 0
		}
	}

	ordered := make([]InfrastructureCategory, 0, len(categoryOrder))
	for _, item := range categoryOrder {
		ordered = append(ordered, *categories[item.ID])
	}

	// 1. Calculate DockerContainers
	dockerContainers := 0
	var dockerRecords []models.LinuxDocker
	if database.DB.Dialector.Name() == "postgres" {
		database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_dockers 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&dockerRecords)
	} else {
		database.DB.Order("sampled_at DESC").Find(&dockerRecords)
	}
	for _, record := range dockerRecords {
		var containers []interface{}
		if record.ContainersJSON != "" {
			if err := json.Unmarshal([]byte(record.ContainersJSON), &containers); err == nil {
				dockerContainers += len(containers)
			}
		}
	}

	// 2. Calculate KubernetesPods
	kubernetesPods := 0
	var k8sRecords []models.LinuxKubernetes
	if database.DB.Dialector.Name() == "postgres" {
		database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_kubernetes 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&k8sRecords)
	} else {
		database.DB.Order("sampled_at DESC").Find(&k8sRecords)
	}
	for _, record := range k8sRecords {
		var pods []interface{}
		if record.PodsJSON != "" {
			if err := json.Unmarshal([]byte(record.PodsJSON), &pods); err == nil {
				kubernetesPods += len(pods)
			}
		}
	}

	// 3. Calculate ActiveAlerts
	var activeAlerts int64
	database.DB.Model(&models.LinuxAlert{}).Where("status = ? OR status = ?", "ACTIVE", "OPEN").Count(&activeAlerts)

	// 4. Calculate CPU/Memory/Disk Averages from latest telemetry
	var cpuSum, memSum, diskSum float64
	var metricCount int
	for _, machine := range machines {
		if machine.LinuxMetric != nil {
			cpuSum += machine.LinuxMetric.CPUUsage
			memSum += machine.LinuxMetric.MemoryPercent
			diskSum += machine.LinuxMetric.DiskUsage
			metricCount++
		}
	}
	cpuAvg := 0.0
	memAvg := 0.0
	diskAvg := 0.0
	if metricCount > 0 {
		cpuAvg = cpuSum / float64(metricCount)
		memAvg = memSum / float64(metricCount)
		diskAvg = diskSum / float64(metricCount)
	}

	// 5. Calculate QueueLength
	var queueLength int64
	database.DB.Model(&models.QueuedMetric{}).Count(&queueLength)

	// 6. Calculate ActiveSockets
	activeSockets := websocket.WS.ActiveClientsCount()

	// 7. Get Backend System Metrics
	backendMetrics := observability.GetBackendSystemMetrics()

	c.JSON(http.StatusOK, OverviewResponse{
		Organizations:    maxInt(len(organizations), 1),
		Users:            userCount,
		TotalServers:     total,
		Online:           online,
		Offline:          offline,
		Warning:          warning,
		Critical:         critical,
		HealthScore:      score,
		Categories:       ordered,
		DockerContainers: dockerContainers,
		KubernetesPods:   kubernetesPods,
		KubernetesNodes:  backendMetrics.KubernetesNodes,
		ActiveAlerts:     activeAlerts,
		CPUAverage:       cpuAvg,
		MemoryAverage:    memAvg,
		DiskAverage:      diskAvg,
		QueueLength:      queueLength,
		ActiveSockets:    activeSockets,
		BackendCPU:       backendMetrics.CPUUsage,
		BackendRAM:       backendMetrics.MemoryUsage,
		APILatency:       backendMetrics.APILatency,
		DBConnections:    backendMetrics.DBConnections,
		RedisUsage:       backendMetrics.RedisUsage,
		RequestsPerSec:   backendMetrics.RequestsPerSec,
		ConnectedAgents:  backendMetrics.ConnectedAgents,
	})
}

func normalizeOverviewType(machine models.Machine) string {
	resourceType := strings.ToLower(strings.TrimSpace(machine.ResourceType))
	if resourceType != "" {
		return resourceType
	}

	haystack := strings.ToLower(machine.OS + " " + machine.Platform + " " + machine.Virtualization + " " + machine.CloudProvider)
	switch {
	case strings.Contains(haystack, "kubernetes") || strings.Contains(haystack, "k8s"):
		return "kubernetes"
	case strings.Contains(haystack, "docker"):
		return "docker"
	case strings.Contains(haystack, "vmware") || strings.Contains(haystack, "esxi"):
		return "vmware"
	case strings.Contains(haystack, "nas") || strings.Contains(haystack, "san") || strings.Contains(haystack, "nfs") || strings.Contains(haystack, "ceph"):
		return "storage"
	case strings.Contains(haystack, "aws") || strings.Contains(haystack, "azure") || strings.Contains(haystack, "gcp") || strings.Contains(haystack, "google cloud"):
		return "cloud"
	case strings.Contains(haystack, "postgres") || strings.Contains(haystack, "mysql") || strings.Contains(haystack, "mongo") || strings.Contains(haystack, "redis"):
		return "database"
	case strings.Contains(haystack, "linux") || strings.Contains(haystack, "ubuntu") || strings.Contains(haystack, "debian") || strings.Contains(haystack, "centos") || strings.Contains(haystack, "rocky") || strings.Contains(haystack, "redhat"):
		return "linux"
	case strings.Contains(haystack, "windows"):
		return "windows"
	default:
		return "server"
	}
}

func maxInt(value, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}

func GetDashboardData(c *gin.Context) {
	var machines []models.Machine
	if err := database.DB.Find(&machines).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list machines"})
		return
	}

	type DashboardItem struct {
		Hostname string  `json:"hostname"`
		CPU      float64 `json:"cpu"`
		Memory   float64 `json:"memory"`
		Disk     float64 `json:"disk"`
		Upload   float64 `json:"upload"`
		Download float64 `json:"download"`
		Uptime   uint64  `json:"uptime"`
		Status   string  `json:"status"`
		LastSeen string  `json:"last_seen"`
	}

	response := make([]DashboardItem, 0, len(machines))

	for _, machine := range machines {
		var metric models.Metric
		err := database.DB.Where("machine_id = ?", machine.ID).Order("created_at desc").First(&metric).Error

		cpu := 0.0
		mem := 0.0
		disk := 0.0
		up := 0.0
		down := 0.0
		var uptime uint64 = 0

		if err == nil {
			cpu = metric.CPUUsage
			mem = metric.MemoryUsage
			disk = metric.DiskUsage
			up = metric.UploadMbps
			down = metric.DownloadMbps
			uptime = metric.Uptime
		}

		status := "Offline"
		latest := time.Since(machine.LastSeen)

		if strings.ToUpper(machine.Status) == "ONLINE" && latest < 30*time.Second {
			status = "Online"
		}

		response = append(response, DashboardItem{
			Hostname: machine.Hostname,
			CPU:      cpu,
			Memory:   mem,
			Disk:     disk,
			Upload:   up,
			Download: down,
			Uptime:   uptime,
			Status:   status,
			LastSeen: machine.LastSeen.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, response)
}
