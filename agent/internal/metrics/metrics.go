package metrics

import "time"

type Metrics struct {
	Hostname     string `json:"hostname"`
	IPAddress    string `json:"ip_address"`
	OS           string `json:"os"`
	Platform     string `json:"platform"`
	PlatformVer  string `json:"platform_version"`
	Uptime       uint64 `json:"uptime"`
	Kernel       string `json:"kernel"`
	Architecture string `json:"architecture"`
	MACAddress   string `json:"mac_address"`
	Timezone     string `json:"timezone"`
	BootTime     uint64 `json:"boot_time"`

	CPUUsage        float64   `json:"cpu_usage"`
	CPUTemperature  float64   `json:"cpu_temperature"`
	CPUCores        int       `json:"cpu_cores"`
	CPUPerCore      []float64 `json:"cpu_per_core"`
	CPUFrequencyMHz float64   `json:"cpu_frequency_mhz"`
	CPUModel        string    `json:"cpu_model"`

	MemoryTotal   uint64  `json:"memory_total"`
	MemoryUsed    uint64  `json:"memory_used"`
	MemoryFree    uint64  `json:"memory_free"`
	MemoryCached  uint64  `json:"memory_cached"`
	MemoryPercent float64 `json:"memory_percent"`
	SwapUsage     float64 `json:"swap_usage"`

	DiskTotal    uint64  `json:"disk_total"`
	DiskUsed     uint64  `json:"disk_used"`
	DiskPercent  float64 `json:"disk_percent"`
	DiskReadBps  float64 `json:"disk_read_bps"`
	DiskWriteBps float64 `json:"disk_write_bps"`
	DiskIOPS     float64 `json:"disk_iops"`

	BytesSent     uint64 `json:"bytes_sent"`
	BytesReceived uint64 `json:"bytes_received"`

	UploadMbps   float64 `json:"upload_mbps"`
	DownloadMbps float64 `json:"download_mbps"`
	LatencyMs    float64 `json:"latency_ms"`
	PacketLoss   float64 `json:"packet_loss"`
	Load1        float64 `json:"load_1"`
	Load5        float64 `json:"load_5"`
	Load15       float64 `json:"load_15"`
	AgentCPUUsage    float64 `json:"agent_cpu_usage"`
	AgentMemoryMB    float64 `json:"agent_memory_mb"`
	AgentMemoryUsage float64 `json:"agent_memory_usage"`

	Filesystems       []FilesystemMetric       `json:"filesystems"`
	Processes         []ProcessMetric          `json:"processes"`
	Services          []ServiceMetric          `json:"services"`
	NetworkInterfaces []NetworkInterfaceMetric `json:"network_interfaces"`
	OpenPorts         []string                 `json:"open_ports"`
	InstalledPackages map[string]string        `json:"installed_packages,omitempty"`
	SmartStatus       string                   `json:"smart_status"`
	RAIDStatus        string                   `json:"raid_status"`
	LVMStatus         string                   `json:"lvm_status"`
	DiskTemperature   float64                  `json:"disk_temperature"`
	DockerContainers  []DockerContainerMetric  `json:"docker_containers"`
	DockerInstalled   bool                     `json:"docker_installed"`
	DockerVersion     DockerVersionInfo        `json:"docker_version"`
	DockerImages      []DockerImageMetric      `json:"docker_images"`
	DockerVolumes     []DockerVolumeMetric     `json:"docker_volumes"`
	DockerNetworks    []DockerNetworkMetric    `json:"docker_networks"`
	DockerEvents      []DockerEventMetric      `json:"docker_events"`
	KubernetesPods      []KubernetesPodMetric    `json:"kubernetes_pods"`
	K8sInstalled        bool                     `json:"k8s_installed"`
	K8sClusterJSON      string                   `json:"k8s_cluster_json"`
	K8sNodesJSON        string                   `json:"k8s_nodes_json"`
	K8sPodsJSON         string                   `json:"k8s_pods_json"`
	K8sDeploymentsJSON  string                   `json:"k8s_deployments_json"`
	K8sStatefulSetsJSON string                   `json:"k8s_statefulsets_json"`
	K8sDaemonSetsJSON   string                   `json:"k8s_daemonsets_json"`
	K8sServicesJSON     string                   `json:"k8s_services_json"`
	K8sNamespacesJSON   string                   `json:"k8s_namespaces_json"`
	K8sStorageJSON      string                   `json:"k8s_storage_json"`
	K8sEventsJSON       string                   `json:"k8s_events_json"`
}

type DockerVersionInfo struct {
	DockerVersion string `json:"docker_version"`
	EngineVersion string `json:"engine_version"`
	APIVersion    string `json:"api_version"`
	HostOS        string `json:"host_os"`
	DockerRootDir string `json:"docker_root_dir"`
}

type DockerContainerMetric struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Image        string    `json:"image"`
	Status       string    `json:"status"`
	State        string    `json:"state"`
	CPUPercent   float64   `json:"cpu_percent"`
	MemoryUsed   uint64    `json:"memory_used_bytes"`
	MemoryLimit  uint64    `json:"memory_limit_bytes"`
	MemoryPct    float64   `json:"memory_percent"`
	NetworkIn    uint64    `json:"network_in"`
	NetworkOut   uint64    `json:"network_out"`
	DiskRead     uint64    `json:"disk_read"`
	DiskWrite    uint64    `json:"disk_write"`
	PIDs         int       `json:"pids"`
	RestartCount int       `json:"restart_count"`
	Uptime       string    `json:"uptime"`
	CreatedTime  time.Time `json:"created_time"`
}

type DockerImageMetric struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Tag         string    `json:"tag"`
	Size        int64     `json:"size"`
	IsUnused    bool      `json:"is_unused"`
	CreatedTime time.Time `json:"created_time"`
}

type DockerVolumeMetric struct {
	Name       string `json:"name"`
	Driver     string `json:"driver"`
	MountPoint string `json:"mount_point"`
	UsageBytes int64  `json:"usage_bytes"`
}

type DockerNetworkMetric struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	Driver              string   `json:"driver"`
	Scope               string   `json:"scope"`
	ConnectedContainers []string `json:"connected_containers"`
}

type DockerEventMetric struct {
	Time      time.Time `json:"time"`
	Type      string    `json:"type"`
	Action    string    `json:"action"`
	ActorID   string    `json:"actor_id"`
	ActorName string    `json:"actor_name"`
	Message   string    `json:"message"`
}

type FilesystemMetric struct {
	MountPoint string  `json:"mount_point"`
	FSType     string  `json:"fs_type"`
	Total      uint64  `json:"total"`
	Used       uint64  `json:"used"`
	Free       uint64  `json:"free"`
	UsedPct    float64 `json:"used_percent"`
}

type ProcessMetric struct {
	PID           int32   `json:"pid"`
	Name          string  `json:"name"`
	User          string  `json:"user"`
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryPercent float32 `json:"memory_percent"`
	Status        string  `json:"status"`
	Command       string  `json:"command"`
}

type ServiceMetric struct {
	Name         string `json:"name"`
	Status       string `json:"status"`
	RestartCount int    `json:"restart_count"`
}

type NetworkInterfaceMetric struct {
	Name      string   `json:"name"`
	MAC       string   `json:"mac"`
	Addresses []string `json:"addresses"`
	SpeedMbps float64  `json:"speed_mbps"`
}

type KubernetesPodMetric struct {
	Name         string  `json:"name"`
	Namespace    string  `json:"namespace"`
	Node         string  `json:"node"`
	Status       string  `json:"status"`
	CPUUsage     float64 `json:"cpu_usage"`
	MemoryUsage  float64 `json:"memory_usage"`
	RestartCount int     `json:"restart_count"`
}
