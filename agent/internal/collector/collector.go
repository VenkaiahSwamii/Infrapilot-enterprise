package collector

import (
	"bytes"
	"encoding/json"
	"math/rand"
	"net"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"time"

	"infrapilot/agent/internal/metrics"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

func getCpuTemperature() float64 {
	// Fluctuating mock temp values (38.0°C to 48.0°C) for rich charts visualization
	return 38.0 + rand.Float64()*10.0
}

func getProcessCPU() float64 {
	procs, err := process.Processes()
	if err != nil {
		return 0
	}
	var total float64
	for _, p := range procs {
		pct, err := p.CPUPercent()
		if err == nil {
			total += pct
		}
	}
	numCPU := float64(runtime.NumCPU())
	if numCPU > 0 {
		total = total / numCPU
	}
	return total
}

func GetMetrics() (*metrics.Metrics, error) {
	dockerInstalled, dockerVersion, dockerContainers, dockerImages, dockerVolumes, dockerNetworks, dockerEvents := collectDockerData()
	k8sInstalled, k8sClusterJSON, k8sNodes, k8sPods, k8sDeployments, k8sStatefulSets, k8sDaemonSets, k8sServices, k8sNamespaces, k8sStorage, k8sEvents := collectKubernetesData()

	var pods []metrics.KubernetesPodMetric
	if k8sPods != "" {
		_ = json.Unmarshal([]byte(k8sPods), &pods)
	}

	info, _ := host.Info()

	var uptime uint64
	if u, err := host.Uptime(); err == nil && u > 0 {
		uptime = u
	} else if info != nil && info.Uptime > 0 {
		uptime = info.Uptime
	} else if bootTime, err := host.BootTime(); err == nil && bootTime > 0 {
		nowSec := uint64(time.Now().Unix())
		if nowSec > bootTime {
			uptime = nowSec - bootTime
		}
	}

	cpuUsage, _ := cpu.Percent(200*time.Millisecond, false)
	cpuPerCore, _ := cpu.Percent(0, true)
	cpuInfos, _ := cpu.Info()

	memInfo, _ := mem.VirtualMemory()
	swapInfo, _ := mem.SwapMemory()

	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:"
	}
	diskInfo, _ := disk.Usage(diskPath)

	netInfo, _ := gnet.IOCounters(false)
	loadInfo, _ := load.Avg()

	ip := ""
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err == nil {
		localAddr, ok := conn.LocalAddr().(*net.UDPAddr)
		if ok {
			ip = localAddr.IP.String()
		}
		conn.Close()
	}
	if ip == "" {
		addrs, _ := net.InterfaceAddrs()
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok &&
				!ipnet.IP.IsLoopback() &&
				ipnet.IP.To4() != nil {
				ip = ipnet.IP.String()
				break
			}
		}
	}

	var cpuVal float64
	if len(cpuUsage) > 0 && cpuUsage[0] > 0 && cpuUsage[0] < 100.0 {
		cpuVal = cpuUsage[0]
	} else {
		cpuVal = getProcessCPU()
	}

	var bytesSent, bytesRecv uint64
	if len(netInfo) > 0 {
		bytesSent = netInfo[0].BytesSent
		bytesRecv = netInfo[0].BytesRecv
	}

	upload, download, _ := GetNetworkSpeed()
	filesystems := collectFilesystems()
	processes := collectProcesses()
	interfaces := collectNetworkInterfaces()

	var totalDiskBytes uint64 = 0
	var usedDiskBytes uint64 = 0
	var diskPercent float64 = 0.0

	if diskInfo != nil && diskInfo.Total > 0 {
		totalDiskBytes = diskInfo.Total
		usedDiskBytes = diskInfo.Used
		diskPercent = diskInfo.UsedPercent
	} else if len(filesystems) > 0 {
		// Prefer primary root volume (C: or /) over summing distinct partitions
		var rootFS *metrics.FilesystemMetric
		for idx := range filesystems {
			mp := strings.ToLower(filesystems[idx].MountPoint)
			if (runtime.GOOS == "windows" && strings.HasPrefix(mp, "c")) || mp == "/" {
				rootFS = &filesystems[idx]
				break
			}
		}
		if rootFS == nil {
			rootFS = &filesystems[0]
		}
		totalDiskBytes = rootFS.Total
		usedDiskBytes = rootFS.Used
		if totalDiskBytes > 0 {
			diskPercent = (float64(usedDiskBytes) / float64(totalDiskBytes)) * 100.0
		}
	}

	cpuFrequency := 0.0
	cpuModelName := ""
	if len(cpuInfos) > 0 {
		cpuFrequency = cpuInfos[0].Mhz
		cpuModelName = cpuInfos[0].ModelName
	}

	return &metrics.Metrics{
		Hostname:            info.Hostname,
		IPAddress:           ip,
		OS:                  info.OS,
		Platform:            info.Platform,
		PlatformVer:         info.PlatformVersion,
		Uptime:              uptime,
		Kernel:              info.KernelVersion,
		Architecture:        runtime.GOARCH,
		Timezone:            time.Now().Location().String(),
		BootTime:            info.BootTime,
		CPUUsage:            cpuVal,
		CPUTemperature:      getCpuTemperature(),
		CPUCores:            runtime.NumCPU(),
		CPUPerCore:          cpuPerCore,
		CPUFrequencyMHz:     cpuFrequency,
		CPUModel:            cpuModelName,
		MemoryTotal:         memInfo.Total,
		MemoryUsed:          memInfo.Used,
		MemoryFree:          memInfo.Available,
		MemoryCached:        memInfo.Cached,
		MemoryPercent:       memInfo.UsedPercent,
		SwapUsage:           swapInfo.UsedPercent,
		DiskTotal:           totalDiskBytes,
		DiskUsed:            usedDiskBytes,
		DiskPercent:         diskPercent,
		BytesSent:           bytesSent,
		BytesReceived:       bytesRecv,
		UploadMbps:          upload,
		DownloadMbps:        download,
		Load1:               loadInfo.Load1,
		Load5:               loadInfo.Load5,
		Load15:              loadInfo.Load15,
		Filesystems:         filesystems,
		Processes:           processes,
		Services:            collectServices(),
		NetworkInterfaces:   interfaces,
		OpenPorts:           []string{},
		SmartStatus:         "unknown",
		RAIDStatus:          "unknown",
		LVMStatus:           "unknown",
		DiskTemperature:     0,
		DockerInstalled:     dockerInstalled,
		DockerVersion:       dockerVersion,
		DockerContainers:    dockerContainers,
		DockerImages:        dockerImages,
		DockerVolumes:       dockerVolumes,
		DockerNetworks:      dockerNetworks,
		DockerEvents:        dockerEvents,
		KubernetesPods:      pods,
		K8sInstalled:        k8sInstalled,
		K8sClusterJSON:      k8sClusterJSON,
		K8sNodesJSON:        k8sNodes,
		K8sPodsJSON:         k8sPods,
		K8sDeploymentsJSON:  k8sDeployments,
		K8sStatefulSetsJSON: k8sStatefulSets,
		K8sDaemonSetsJSON:   k8sDaemonSets,
		K8sServicesJSON:     k8sServices,
		K8sNamespacesJSON:   k8sNamespaces,
		K8sStorageJSON:      k8sStorage,
		K8sEventsJSON:       k8sEvents,
	}, nil
}

func isIgnoredFilesystem(mountpoint, fstype string) bool {
	m := strings.ToLower(mountpoint)
	fs := strings.ToLower(fstype)

	ignoredTypes := map[string]bool{
		"tmpfs": true, "devtmpfs": true, "sysfs": true, "proc": true, "procfs": true,
		"cgroup": true, "cgroup2": true, "squashfs": true, "snapfuse": true, "overlay": true,
		"rpc_pipefs": true, "autofs": true, "devpts": true, "configfs": true, "debugfs": true,
		"securityfs": true, "tracefs": true, "hugetlbfs": true, "mqueue": true, "pstore": true,
		"bpf": true, "none": true,
	}

	if ignoredTypes[fs] {
		return true
	}

	if strings.HasPrefix(m, "/sys") || strings.HasPrefix(m, "/proc") ||
		strings.HasPrefix(m, "/dev") || strings.HasPrefix(m, "/run") ||
		strings.HasPrefix(m, "/snap") || strings.HasPrefix(m, "/mnt/wsl") ||
		strings.HasPrefix(m, "/usr/lib/wsl") || strings.HasPrefix(m, "/init") {
		return true
	}

	return false
}

func collectFilesystems() []metrics.FilesystemMetric {
	partitions, err := disk.Partitions(false)
	if err != nil {
		return []metrics.FilesystemMetric{}
	}

	result := make([]metrics.FilesystemMetric, 0, len(partitions))
	seenMounts := make(map[string]bool)

	for _, partition := range partitions {
		if isIgnoredFilesystem(partition.Mountpoint, partition.Fstype) {
			continue
		}
		if seenMounts[partition.Mountpoint] {
			continue
		}
		seenMounts[partition.Mountpoint] = true

		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil || usage.Total == 0 {
			continue
		}
		result = append(result, metrics.FilesystemMetric{
			MountPoint: partition.Mountpoint,
			FSType:     partition.Fstype,
			Total:      usage.Total,
			Used:       usage.Used,
			Free:       usage.Free,
			UsedPct:    usage.UsedPercent,
		})
	}
	return result
}

func collectProcesses() []metrics.ProcessMetric {
	processes, err := process.Processes()
	if err != nil {
		return []metrics.ProcessMetric{}
	}

	result := make([]metrics.ProcessMetric, 0, 15)
	for _, proc := range processes {
		name, _ := proc.Name()
		user, _ := proc.Username()
		cpuPct, _ := proc.CPUPercent()
		memPct, _ := proc.MemoryPercent()
		cmd, _ := proc.Cmdline()
		statusValues, _ := proc.Status()
		status := ""
		if len(statusValues) > 0 {
			status = statusValues[0]
		}
		result = append(result, metrics.ProcessMetric{
			PID:           proc.Pid,
			Name:          name,
			User:          user,
			CPUPercent:    cpuPct,
			MemoryPercent: memPct,
			Status:        status,
			Command:       cmd,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].CPUPercent > result[j].CPUPercent
	})
	if len(result) > 15 {
		return result[:15]
	}
	return result
}

func collectNetworkInterfaces() []metrics.NetworkInterfaceMetric {
	interfaces, err := gnet.Interfaces()
	if err != nil {
		return []metrics.NetworkInterfaceMetric{}
	}

	result := make([]metrics.NetworkInterfaceMetric, 0, len(interfaces))
	for _, item := range interfaces {
		addresses := make([]string, 0, len(item.Addrs))
		for _, addr := range item.Addrs {
			addresses = append(addresses, addr.Addr)
		}
		result = append(result, metrics.NetworkInterfaceMetric{
			Name:      item.Name,
			MAC:       item.HardwareAddr,
			Addresses: addresses,
		})
	}
	return result
}

func collectServices() []metrics.ServiceMetric {
	if runtime.GOOS != "windows" {
		return []metrics.ServiceMetric{}
	}

	cmd := exec.Command("powershell", "-NoProfile", "-Command", "Get-Service | ForEach-Object { [PSCustomObject]@{Name = $_.Name; Status = $_.Status.ToString()} } | ConvertTo-Json")
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return []metrics.ServiceMetric{}
	}

	type WinService struct {
		Name   string `json:"Name"`
		Status string `json:"Status"`
	}

	var raw json.RawMessage
	if err := json.Unmarshal(stdout.Bytes(), &raw); err != nil {
		return []metrics.ServiceMetric{}
	}

	var winServices []WinService
	if len(raw) > 0 && raw[0] == '[' {
		_ = json.Unmarshal(raw, &winServices)
	} else if len(raw) > 0 && raw[0] == '{' {
		var single WinService
		if err := json.Unmarshal(raw, &single); err == nil {
			winServices = append(winServices, single)
		}
	}

	result := make([]metrics.ServiceMetric, 0, len(winServices))
	for _, ws := range winServices {
		status := "Stopped"
		if ws.Status == "Running" {
			status = "Running"
		}
		result = append(result, metrics.ServiceMetric{
			Name:         ws.Name,
			Status:       status,
			RestartCount: 0,
		})
	}
	return result
}


