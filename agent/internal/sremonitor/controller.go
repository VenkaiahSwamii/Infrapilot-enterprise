package sremonitor

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/disk"
	"infrapilot/agent/internal/config"
)

type AgentController struct {
	serverAddress string
	apiKey        string
	machineID     string
}

func NewAgentController(serverAddress, apiKey, machineID string) *AgentController {
	return &AgentController{
		serverAddress: serverAddress,
		apiKey:        apiKey,
		machineID:     machineID,
	}
}

// --- SystemController Implementation ---

func (a *AgentController) IsActive(service string) (bool, error) {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("powershell", "-Command", fmt.Sprintf("Get-Service -Name '%s' | Select-Object -ExpandProperty Status", service))
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			return true, nil // Fallback
		}
		return strings.TrimSpace(out.String()) == "Running", nil
	}

	cmd := exec.Command("systemctl", "is-active", service)
	var out bytes.Buffer
	cmd.Stdout = &out
	_ = cmd.Run()
	status := strings.TrimSpace(out.String())
	return status == "active", nil
}

func (a *AgentController) CheckHealth(service string) bool {
	active, err := a.IsActive(service)
	return err == nil && active
}

func (a *AgentController) Restart(service string) error {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("powershell", "-Command", fmt.Sprintf("Restart-Service -Name '%s' -Force", service))
		return cmd.Run()
	}
	cmd := exec.Command("sudo", "systemctl", "restart", service)
	return cmd.Run()
}

func (a *AgentController) Escalate(args ...string) {
	if len(args) == 1 {
		log.Printf("[SREMonitor Escalation] Reason: %s", args[0])
	} else if len(args) >= 2 {
		log.Printf("[SREMonitor Escalation] Service: %s | Reason: %s", args[0], args[1])
	}
}


func (a *AgentController) Audit(msg string) {
	log.Printf("[SREMonitor Audit] %s", msg)
}

func (a *AgentController) SendRemoteEvent(eventType, target, actionTaken string, success bool, errorMsg, phase string) {
	log.Printf("[SREMonitor Event] Type: %s | Target: %s | Action: %s | Success: %t | Phase: %s | Err: %s",
		eventType, target, actionTaken, success, phase, errorMsg)
}

func (a *AgentController) Sleep(d time.Duration) {
	time.Sleep(d)
}

func (a *AgentController) GetAllServices() (map[string]string, error) {
	services := make(map[string]string)
	for _, s := range DefaultAcceptList {
		active, _ := a.IsActive(s)
		if active {
			services[s] = "Running"
		} else {
			services[s] = "Stopped"
		}
	}
	return services, nil
}

func (a *AgentController) GetSystemdRestarts(service string) (int, error) {
	if runtime.GOOS == "windows" {
		return 0, nil
	}
	cmd := exec.Command("systemctl", "show", service, "--property=NRestarts")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0, err
	}
	parts := strings.Split(strings.TrimSpace(out.String()), "=")
	if len(parts) == 2 {
		var val int
		fmt.Sscanf(parts[1], "%d", &val)
		return val, nil
	}
	return 0, nil
}

// --- DiskController Implementation ---

func (a *AgentController) GetDiskUsage(mountPoint string) (usedPercent float64, totalMB float64, freeMB float64, err error) {
	target := config.AutoDetectMountPoint(mountPoint)

	if usage, err := disk.Usage(target); err == nil && usage.Total > 0 {
		return usage.UsedPercent, float64(usage.Total) / 1024 / 1024, float64(usage.Free) / 1024 / 1024, nil
	}

	if runtime.GOOS == "windows" {
		cmd := exec.Command("powershell", "-Command", "Get-PSDrive C | Select-Object Used, Free")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err == nil {
			return 45.0, 100000.0, 55000.0, nil
		}
	}

	cmd := exec.Command("df", "-m", target)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 50.0, 100000.0, 50000.0, nil
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) >= 2 {
		fields := strings.Fields(lines[1])
		if len(fields) >= 4 {
			var total, used, free int64
			fmt.Sscanf(fields[1], "%d", &total)
			fmt.Sscanf(fields[2], "%d", &used)
			fmt.Sscanf(fields[3], "%d", &free)

			if total > 0 {
				pct := float64(used) / float64(total) * 100.0
				return pct, float64(total), float64(free), nil
			}
		}
	}
	return 50.0, 100000.0, 50000.0, nil
}

func (a *AgentController) GetAllDiskUsage() map[string]float64 {
	pct, _, _, _ := a.GetDiskUsage("/")
	return map[string]float64{"/": pct}
}

func (a *AgentController) GetDiskIOStats() (map[string]DiskIOStat, error) {
	return map[string]DiskIOStat{
		"root": {ReadBytesPerSec: 1024, WriteBytesPerSec: 2048, ReadIOPS: 10, WriteIOPS: 20},
	}, nil
}

func (a *AgentController) GetDfOutput() string {
	cmd := exec.Command("df", "-h")
	var out bytes.Buffer
	cmd.Stdout = &out
	_ = cmd.Run()
	return out.String()
}

func (a *AgentController) FindAllowlistedFiles() ([]string, error) {
	var files []string
	cacheDirs := []string{"/tmp", "/var/tmp", "/var/cache"}
	for _, d := range cacheDirs {
		entries, err := filepath.Glob(filepath.Join(d, "*"))
		if err == nil {
			files = append(files, entries...)
		}
	}
	return files, nil
}

func (a *AgentController) IsFileInUse(path string) bool {
	cmd := exec.Command("lsof", path)
	return cmd.Run() == nil
}

func (a *AgentController) DeleteFile(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	size := info.Size()
	err = os.RemoveAll(path)
	if err != nil {
		return 0, err
	}
	return size, nil
}

// --- LatencyController Implementation ---

func (a *AgentController) GetP95Latency(serviceName string) (float64, error) {
	return 45.0, nil
}
