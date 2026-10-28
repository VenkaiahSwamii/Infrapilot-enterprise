package sremonitor

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"infrapilot/agent/internal/config"
)

var (
	DefaultAcceptList = []string{}

	dynamicPoliciesMu sync.RWMutex
	dynamicPolicies   = make(map[string]string)
)

// UpdateDynamicServicePolicies updates the map of service policies received from backend heartbeat
func UpdateDynamicServicePolicies(policies map[string]string) {
	if len(policies) == 0 {
		return
	}
	dynamicPoliciesMu.Lock()
	defer dynamicPoliciesMu.Unlock()
	for k, v := range policies {
		cleanK := strings.ToLower(strings.TrimSpace(k))
		cleanV := strings.ToUpper(strings.TrimSpace(v))
		dynamicPolicies[cleanK] = cleanV
		dynamicPolicies[strings.TrimSuffix(cleanK, ".service")] = cleanV
		dynamicPolicies[cleanK+".service"] = cleanV
	}
}

// GetServicePolicyMode returns the effective mode for a service ("AUTO_REMEDIATE" vs "NOTIFY_EMAIL")
func GetServicePolicyMode(service string) string {
	dynamicPoliciesMu.RLock()
	defer dynamicPoliciesMu.RUnlock()
	clean := strings.ToLower(strings.TrimSpace(service))
	if mode, ok := dynamicPolicies[clean]; ok && mode != "" {
		return mode
	}
	if mode, ok := dynamicPolicies[strings.TrimSuffix(clean, ".service")]; ok && mode != "" {
		return mode
	}
	if mode, ok := dynamicPolicies[clean+".service"]; ok && mode != "" {
		return mode
	}
	return "AUTO_REMEDIATE"
}

// GetDiskPolicyMode returns the effective policy mode for a disk volume or mount point,
// evaluating from most specific to generic: MountPoint -> Component -> disk -> storage
func GetDiskPolicyMode(targetMount string) string {
	dynamicPoliciesMu.RLock()
	defer dynamicPoliciesMu.RUnlock()

	cleanMount := strings.ToLower(strings.TrimSpace(targetMount))

	// 1. Check exact mount point (e.g. "/var/log", "c:", "/")
	if mode, ok := dynamicPolicies[cleanMount]; ok && mode != "" {
		return mode
	}

	// 2. Check alias component mappings for known mount points
	if cleanMount == "/" || cleanMount == "c:" || cleanMount == "c" || cleanMount == "\\" {
		if mode, ok := dynamicPolicies["root_disk"]; ok && mode != "" {
			return mode
		}
	} else if strings.Contains(cleanMount, "var") {
		if mode, ok := dynamicPolicies["var_log_disk"]; ok && mode != "" {
			return mode
		}
	}

	// 3. Check direct component names
	if mode, ok := dynamicPolicies["root_disk"]; ok && mode != "" && (cleanMount == "" || cleanMount == "/" || cleanMount == "c:") {
		return mode
	}

	// 4. Check generic "disk"
	if mode, ok := dynamicPolicies["disk"]; ok && mode != "" {
		return mode
	}

	// 5. Check category "storage"
	if mode, ok := dynamicPolicies["storage"]; ok && mode != "" {
		return mode
	}

	return "AUTO_REMEDIATE"
}

// GetLatencyPolicyMode returns the effective policy mode for latency monitoring:
// Target -> latency -> network -> default AUTO_REMEDIATE
func GetLatencyPolicyMode(target string) string {
	dynamicPoliciesMu.RLock()
	defer dynamicPoliciesMu.RUnlock()

	clean := strings.ToLower(strings.TrimSpace(target))
	if mode, ok := dynamicPolicies[clean]; ok && mode != "" {
		return mode
	}
	if mode, ok := dynamicPolicies["latency"]; ok && mode != "" {
		return mode
	}
	if mode, ok := dynamicPolicies["network"]; ok && mode != "" {
		return mode
	}
	return "AUTO_REMEDIATE"
}

type Config struct {
	ServiceName      string
	AcceptList       []string
	MaxRestarts      int           // Default: 3
	RestartWindow    time.Duration // Default: 10m
	CooldownDuration time.Duration // Default: 10m (auto-reset when stable)
	VerifyDuration   time.Duration // Default: 5s
	OnTriggered      func(reason string)
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
	GetRecentLogs(service string, maxLines int) string
}

type Monitor struct {
	config Config
	sys    SystemController

	mu                         sync.Mutex
	healthFailCount            int
	restartTimestamps          []time.Time
	inMaintenance              bool
	totalRestarts              int
	lastRestartDuration        time.Duration
	lastRestartTimestamp       time.Time
	uptimeBeforeCrash          time.Duration
	escalated                  bool
	lastSystemdRestarts        int
	systemdRestartsInitialized bool
	lastHealthyTimestamp       time.Time
}

type ReportStats struct {
	TotalRestarts       int
	LastRestartDuration time.Duration
	UptimeBeforeCrash   time.Duration
	HasCrashedBefore    bool
	IsFlapSuspended     bool
	ActiveRestartCount  int
}

func (m *Monitor) GetStats() ReportStats {
	m.mu.Lock()
	defer m.mu.Unlock()
	return ReportStats{
		TotalRestarts:       m.totalRestarts,
		LastRestartDuration: m.lastRestartDuration,
		UptimeBeforeCrash:   m.uptimeBeforeCrash,
		HasCrashedBefore:    !m.lastRestartTimestamp.IsZero(),
		IsFlapSuspended:     m.escalated,
		ActiveRestartCount:  len(m.restartTimestamps),
	}
}

func NewMonitor(cfg Config, sys SystemController) *Monitor {
	if cfg.MaxRestarts <= 0 {
		cfg.MaxRestarts = 3
	}
	if cfg.RestartWindow <= 0 {
		cfg.RestartWindow = 10 * time.Minute
	}
	if cfg.CooldownDuration <= 0 {
		cfg.CooldownDuration = 10 * time.Minute
	}
	if cfg.VerifyDuration <= 0 {
		cfg.VerifyDuration = 5 * time.Second
	}

	return &Monitor{
		config:               cfg,
		sys:                  sys,
		restartTimestamps:    []time.Time{},
		inMaintenance:        false,
		lastHealthyTimestamp: time.Now(),
	}
}

func (m *Monitor) CheckMaintenanceFlag() bool {
	flagPath := filepath.Join("/opt", ".maintenance_"+m.config.ServiceName)
	_, err := os.Stat(flagPath)
	return err == nil
}

// ResetFlap immediately clears active restart timestamps and re-arms the circuit breaker
func (m *Monitor) ResetFlap() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.restartTimestamps = []time.Time{}
	m.escalated = false
	m.healthFailCount = 0
	m.lastHealthyTimestamp = time.Now()
	m.sys.Audit(fmt.Sprintf("[%s] Flap counter reset and circuit breaker re-armed by operator action.", m.config.ServiceName))
}

func (m *Monitor) Check() (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()

	// 1. Maintenance Mode Check
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

	// 2. Active State & Health Check
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

	// 3. Systemd Restarts property tracking (e.g. catches operator or OS restarts)
	sysRestarts, err := m.sys.GetSystemdRestarts(m.config.ServiceName)
	if err == nil {
		if !m.systemdRestartsInitialized {
			m.lastSystemdRestarts = sysRestarts
			m.systemdRestartsInitialized = true
		} else if sysRestarts != m.lastSystemdRestarts {
			if sysRestarts > m.lastSystemdRestarts {
				m.totalRestarts += (sysRestarts - m.lastSystemdRestarts)
			}
			m.lastSystemdRestarts = sysRestarts
		}
	}

	// 4. Stability Cooldown Reset (Auto-Reset if service has been running stably for >= CooldownDuration)
	if active && healthOK {
		m.healthFailCount = 0
		if len(m.restartTimestamps) > 0 && !m.lastRestartTimestamp.IsZero() {
			if now.Sub(m.lastRestartTimestamp) >= m.config.CooldownDuration {
				m.restartTimestamps = []time.Time{}
				m.escalated = false
				m.sys.Audit(fmt.Sprintf("[%s] Service has remained stable for %v. Auto-reset flap counter to 0 and re-armed circuit breaker.",
					m.config.ServiceName, m.config.CooldownDuration))
			}
		}
		m.lastHealthyTimestamp = now
		return false, nil
	}

	// 5. Crash / Unhealthy state detected
	needsRemediation := !active || m.healthFailCount >= 3
	if !needsRemediation {
		return false, nil
	}

	if !m.lastRestartTimestamp.IsZero() && m.uptimeBeforeCrash == 0 {
		m.uptimeBeforeCrash = time.Since(m.lastRestartTimestamp)
	}

	// 6. Verify Accept-List Membership (from config.toml)
	acceptList := m.config.AcceptList
	if len(acceptList) == 0 {
		acceptList = config.Get().GetAcceptList()
	}
	isAccepted := false
	for _, accepted := range acceptList {
		if strings.EqualFold(m.config.ServiceName, accepted) ||
			strings.EqualFold(m.config.ServiceName+".service", accepted) ||
			strings.EqualFold(strings.TrimSuffix(m.config.ServiceName, ".service"), accepted) {
			isAccepted = true
			break
		}
	}
	if !isAccepted {
		m.sys.Escalate(m.config.ServiceName, "service is not on accept-list, cannot restart")
		return false, errors.New("service not on accept-list")
	}

	// 7. Policy Mode Check (AUTO_REMEDIATE vs NOTIFY_EMAIL)
	policyMode := GetServicePolicyMode(m.config.ServiceName)
	if strings.EqualFold(policyMode, "NOTIFY_EMAIL") || strings.EqualFold(policyMode, "EMAIL_ONLY") {
		if !m.escalated {
			logs := m.sys.GetRecentLogs(m.config.ServiceName, 25)
			msg := fmt.Sprintf("[%s] Service stopped/degraded. Auto-remediation suppressed by Policy (Mode: %s). Awaiting operator manual fix.\nRecent Diagnostics:\n%s",
				m.config.ServiceName, policyMode, logs)
			m.sys.Audit(msg)
			m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName, fmt.Sprintf("Suppressed by Policy (%s)", policyMode), false, msg, "PENDING_OPERATOR")
			m.escalated = true
		}
		return false, nil
	}

	// 8. Flap Protection Circuit Breaker Check (Sliding Window: 3 restarts in 10 minutes)
	m.cleanupOldRestarts(now)
	if len(m.restartTimestamps) >= m.config.MaxRestarts {
		if !m.escalated {
			logs := m.sys.GetRecentLogs(m.config.ServiceName, 25)
			diagMsg := fmt.Sprintf("Max restarts (%d in %v) reached. Auto-remediation halted.\n\nRecent Diagnostics:\n%s",
				m.config.MaxRestarts, m.config.RestartWindow, logs)
			m.sys.Escalate(m.config.ServiceName, diagMsg)
			m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName, "Escalated to human (FLAP_SUSPENDED)", false, diagMsg, "FAILED")
			m.escalated = true
		}
		return false, errors.New("silent_escalation")
	}

	if m.config.OnTriggered != nil {
		m.config.OnTriggered("Service health degraded or stopped")
	}

	// 9. Execute Remediation Restart
	start := time.Now()
	m.restartTimestamps = append(m.restartTimestamps, now)
	m.totalRestarts++

	err = m.sys.Restart(m.config.ServiceName)
	duration := time.Since(start)

	m.lastRestartDuration = duration
	m.lastRestartTimestamp = time.Now()
	m.uptimeBeforeCrash = 0

	if err != nil {
		logs := m.sys.GetRecentLogs(m.config.ServiceName, 25)
		return false, fmt.Errorf("restart failed: %w | logs: %s", err, logs)
	}

	if sysRestarts, err := m.sys.GetSystemdRestarts(m.config.ServiceName); err == nil {
		m.lastSystemdRestarts = sysRestarts
		m.systemdRestartsInitialized = true
	}

	m.sys.Audit(fmt.Sprintf("Restarted %s successfully (Command took: %v, Flap Count: %d/%d)",
		m.config.ServiceName, duration, len(m.restartTimestamps), m.config.MaxRestarts))
	m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName,
		fmt.Sprintf("Restarted service (took %v, attempt %d/%d)", duration, len(m.restartTimestamps), m.config.MaxRestarts),
		true, "", "RESOLVED")

	// 9. Post-Restart Health Verification
	m.sys.Sleep(m.config.VerifyDuration)

	if m.sys.CheckHealth(m.config.ServiceName) {
		m.sys.Audit(fmt.Sprintf("Incident closed for %s: verified healthy after %s", m.config.ServiceName, m.config.VerifyDuration))
		m.sys.SendRemoteEvent("SERVICE_CRASH", m.config.ServiceName, "Verified healthy", true, "", "RESOLVED")
		m.healthFailCount = 0
		m.lastHealthyTimestamp = time.Now()
	} else {
		logs := m.sys.GetRecentLogs(m.config.ServiceName, 25)
		m.sys.Escalate(m.config.ServiceName, fmt.Sprintf("health check failed after restart verification\nLogs: %s", logs))
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
