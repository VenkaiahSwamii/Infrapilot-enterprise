package sremonitor

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

type LatencyConfig struct {
	ServiceName         string
	AcceptList          []string
	BaselineP95         float64
	ThresholdMultiplier float64
	AlertWindow         time.Duration
	OnTriggered         func(reason string)
}

type LatencyController interface {
	GetP95Latency(serviceName string) (float64, error)
	Audit(msg string)
	Escalate(args ...string)
	SendRemoteEvent(eventType, target, actionTaken string, success bool, errorMsg, phase string)
}


type LatencyMonitor struct {
	config           LatencyConfig
	sys              LatencyController
	mu               sync.Mutex
	highLatencyStart time.Time
	isAlerting       bool
	lastP95          float64
}

type LatencyReportStats struct {
	IsAlerting     bool
	AlertStartTime time.Time
	LastP95Ms      float64
	ServiceName    string
}

func (m *LatencyMonitor) GetStats() LatencyReportStats {
	m.mu.Lock()
	defer m.mu.Unlock()
	targetSvc := m.config.ServiceName
	if targetSvc == "" && len(m.config.AcceptList) > 0 {
		targetSvc = m.config.AcceptList[0]
	}
	return LatencyReportStats{
		IsAlerting:     m.isAlerting,
		AlertStartTime: m.highLatencyStart,
		LastP95Ms:      m.lastP95,
		ServiceName:    targetSvc,
	}
}

func NewLatencyMonitor(cfg LatencyConfig, sys LatencyController) *LatencyMonitor {
	return &LatencyMonitor{
		config: cfg,
		sys:    sys,
	}
}

func (m *LatencyMonitor) Check(currentTime time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	targetSvc := m.config.ServiceName
	if targetSvc == "" && len(m.config.AcceptList) > 0 {
		targetSvc = m.config.AcceptList[0]
	}
	if targetSvc == "" {
		targetSvc = "ssh.service"
	}

	currentP95, err := m.sys.GetP95Latency(targetSvc)
	if err != nil {
		return fmt.Errorf("failed to get latency: %w", err)
	}
	m.lastP95 = currentP95

	threshold := m.config.BaselineP95 * m.config.ThresholdMultiplier

	if currentP95 > threshold {
		if m.highLatencyStart.IsZero() {
			m.highLatencyStart = currentTime
		} else {
			elapsed := currentTime.Sub(m.highLatencyStart)
			if elapsed >= m.config.AlertWindow && !m.isAlerting {
				procName := strings.TrimSuffix(m.config.ServiceName, ".service")
				elapsed = elapsed.Round(time.Second)
				msg := fmt.Sprintf(
					"\n"+
						"  %-18s %s\n"+
						"  %-18s %.1f ms\n"+
						"  %-18s %.1f ms  (threshold: %.1f ms = %.1fx baseline)\n"+
						"  %-18s %s\n"+
						"\n"+
						"  HUMAN REMEDIATION PLAN (do NOT auto-restart for latency):\n"+
						"  Step 1 - Check logs     : journalctl -u %s -n 100 --no-pager\n"+
						"  Step 2 - Check CPU/mem  : top -b -n 1 | grep %s\n"+
						"  Step 3 - Check conns    : ss -tlnp | grep %s\n"+
						"  Step 4 - If overloaded  : sudo systemctl restart %s\n"+
						"  Step 5 - If need to stop: touch /tmp/.maintenance_%s first!\n",
					"Service:", m.config.ServiceName,
					"Observed p95:", currentP95,
					"Baseline p95:", m.config.BaselineP95, threshold, m.config.ThresholdMultiplier,
					"Elevated for:", elapsed.String(),
					m.config.ServiceName,
					procName, procName,
					m.config.ServiceName,
					m.config.ServiceName,
				)
				m.sys.Escalate(m.config.ServiceName, msg)
				m.sys.SendRemoteEvent("LATENCY_SPIKE", m.config.ServiceName, "Escalated to human", false, fmt.Sprintf("Latency exceeded threshold for %s", elapsed.String()), "TRIGGERED")
				m.isAlerting = true

				if m.config.OnTriggered != nil {
					m.config.OnTriggered(fmt.Sprintf("Alerting latency degradation (%.1f ms)", currentP95))
				}
			}
		}
	} else {
		if m.isAlerting {
			m.sys.Audit(fmt.Sprintf("Auto-resolved latency alert for %s. p95 is now %.1f ms.", m.config.ServiceName, currentP95))
			m.sys.SendRemoteEvent("LATENCY_SPIKE", m.config.ServiceName, "Auto-resolved", true, "", "RESOLVED")
			m.isAlerting = false
		}
		m.highLatencyStart = time.Time{}
	}

	return nil
}
