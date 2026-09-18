package sremonitor

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var DefaultAcceptList = []string{
	"ssh.service", "ssh", "nginx.service", "nginx", "docker.service", "docker",
	"postgresql.service", "postgresql", "systemd-journald", "systemd-resolved",
	"infrapilot-agent", "cron", "dbus", "network-manager",
}

type Config struct {

	ServiceName     string
	AcceptList      []string
	MaxRestarts     int
	RestartWindow   time.Duration
	VerifyDuration  time.Duration
	OnTriggered     func(reason string)
}

type SystemController interface {
	IsActive(service string) (bool, error)
	CheckHealth(service string) bool
	Restart(service string) error
	Escalate(args ...string)
	Audit(msg string)
	SendRemoteEvent(eventType, target, actionTaken string, success bool, errorMsg, phase string)
	Sleep(d time.Duration)
	GetAllServices() (map[string]string, error)
	GetSystemdRestarts(service string) (int, error)
}


type Monitor struct {
	config Config
	sys    SystemController

	mu                         sync.Mutex
	healthFailCount            int
	restartTimestamps         []time.Time
	inMaintenance              bool
	totalRestarts              int
	lastRestartDuration        time.Duration
	lastRestartTimestamp       time.Time
	uptimeBeforeCrash          time.Duration
	escalated                  bool
	lastSystemdRestarts        int
	systemdRestartsInitialized bool
}

type ReportStats struct {
	TotalRestarts       int
	LastRestartDuration time.Duration
	UptimeBeforeCrash   time.Duration
	HasCrashedBefore   bool
}

func (m *Monitor) GetStats() ReportStats {
	m.mu.Lock()
	defer m.mu.Unlock()
	return ReportStats{
		TotalRestarts:       m.totalRestarts,
		LastRestartDuration: m.lastRestartDuration,
		UptimeBeforeCrash:   m.uptimeBeforeCrash,
		HasCrashedBefore:   !m.lastRestartTimestamp.IsZero(),
	}
}

func NewMonitor(cfg Config, sys SystemController) *Monitor {
	return &Monitor{
		config:            cfg,
		sys:               sys,
		restartTimestamps: []time.Time{},
		inMaintenance:     false,
	}
}

func (m *Monitor) CheckMaintenanceFlag() bool {
	flagPath := filepath.Join("/opt", ".maintenance_"+m.config.ServiceName)
	_, err := os.Stat(flagPath)
	return err == nil
}

func (m *Monitor) Check() (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	isMaint := m.CheckMaintenanceFlag()
	if isMaint {
		if !m.inMaintenance {
			m.inMaintenance = true
			m.sys.Audit(fmt.Sprintf("[%s] Entered Maintenance Mode. Auto-restarts suspended.", m.config.ServiceName))
		}
		return false, nil
	} else if m.inMaintenance {
		m.inMaintenance = false
		m.sys.Audit(fmt.Sprintf("[%s] Exited Maintenance Mode. Auto-restarts resumed.", m.config.ServiceName))
	}

	active, err := m.sys.IsActive(m.config.ServiceName)
	if err != nil {
		return false, fmt.Errorf("failed to check unit state: %w", err)
	}

	healthOK := m.sys.CheckHealth(m.config.ServiceName)
	if !healthOK {
		m.healthFailCount++
	} else {
		m.healthFailCount = 0
	}

	needsRemediation := !active || m.healthFailCount >= 3

	sysRestarts, err := m.sys.GetSystemdRestarts(m.config.ServiceName)
	if err == nil {
		if !m.systemdRestartsInitialized {
			m.lastSystemdRestarts = sysRestarts
			m.systemdRestartsInitialized = true
		} else if sysRestarts != m.lastSystemdRestarts {
			if sysRestarts > m.lastSystemdRestarts {
				needsRemediation = true
			}
			m.lastSystemdRestarts = sysRestarts
		}
	}

	if !needsRemediation {
		return false, nil
	}

	if !m.lastRestartTimestamp.IsZero() && m.uptimeBeforeCrash == 0 {
		m.uptimeBeforeCrash = time.Since(m.lastRestartTimestamp)
	}

	isAccepted := false
	for _, accepted := range m.config.AcceptList {
		if m.config.ServiceName == accepted || m.config.ServiceName+".service" == accepted {
			isAccepted = true
			break
		}
	}
	if !isAccepted {
		m.sys.Escalate(m.config.ServiceName, "service is not on accept-list, cannot restart")
		return false, errors.New("service not on accept-list")
	}

	now := time.Now()
	m.cleanupOldRestarts(now)
	if len(m.restartTimestamps) >= m.config.MaxRestarts {
		if !m.escalated {
			m.sys.Escalate(m.config.ServiceName, "max restart attempts reached within window")
			m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName, "Escalated to human", false, "Max restart attempts reached", "FAILED")
			m.escalated = true
		}
		return false, errors.New("silent_escalation")
	}

	if m.config.OnTriggered != nil {
		m.config.OnTriggered("Service health degraded or stopped")
	}

	start := time.Now()
	m.restartTimestamps = append(m.restartTimestamps, now)
	m.totalRestarts++

	err = m.sys.Restart(m.config.ServiceName)
	duration := time.Since(start)

	m.lastRestartDuration = duration
	m.lastRestartTimestamp = time.Now()
	m.uptimeBeforeCrash = 0

	if err != nil {
		return false, fmt.Errorf("restart failed: %w", err)
	}

	if sysRestarts, err := m.sys.GetSystemdRestarts(m.config.ServiceName); err == nil {
		m.lastSystemdRestarts = sysRestarts
		m.systemdRestartsInitialized = true
	}

	m.sys.Audit(fmt.Sprintf("Restarted %s successfully (Command took: %v)", m.config.ServiceName, duration))
	m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName, fmt.Sprintf("Restarted service (took %v)", duration), true, "", "RESOLVED")

	m.sys.Sleep(m.config.VerifyDuration)

	if m.sys.CheckHealth(m.config.ServiceName) {
		m.sys.Audit(fmt.Sprintf("Incident closed for %s: verified healthy after %s", m.config.ServiceName, m.config.VerifyDuration))
		m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName, "Verified healthy", true, "", "RESOLVED")
		m.healthFailCount = 0
	} else {
		m.sys.Escalate(m.config.ServiceName, "health check failed after restart verification")
		m.healthFailCount = 0
		return true, errors.New("verification failed after restart")
	}

	return true, nil
}

func (m *Monitor) cleanupOldRestarts(now time.Time) {
	var recent []time.Time
	for _, t := range m.restartTimestamps {
		if now.Sub(t) <= m.config.RestartWindow {
			recent = append(recent, t)
		}
	}
	m.restartTimestamps = recent

	if len(m.restartTimestamps) < m.config.MaxRestarts {
		m.escalated = false
	}
}
