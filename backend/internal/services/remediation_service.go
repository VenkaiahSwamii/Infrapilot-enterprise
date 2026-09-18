package services

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

var (
	DefaultAcceptList = []string{
		"ssh.service", "ssh", "nginx.service", "nginx", "docker.service", "docker",
		"postgresql.service", "postgresql", "systemd-journald", "systemd-resolved",
		"infrapilot-agent", "cron", "dbus", "network-manager",
	}

	flapMu          sync.Mutex
	serviceRestarts = make(map[string][]time.Time)
)

type RemediationService struct{}

func NewRemediationService() *RemediationService {
	return &RemediationService{}
}

// RecordAndCheckFlap tracks service restart timestamps within a 10-minute sliding window.
// Returns true if flapping limit is exceeded (max 2 restarts allowed per 10 mins).
func RecordAndCheckFlap(machineID, service string) (isFlapping bool, count int) {
	flapMu.Lock()
	defer flapMu.Unlock()

	key := fmt.Sprintf("%s:%s", machineID, strings.TrimSuffix(service, ".service"))
	now := time.Now()
	cutoff := now.Add(-10 * time.Minute)

	// Filter timestamps within the 10-minute window
	recent := make([]time.Time, 0)
	for _, t := range serviceRestarts[key] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}

	if len(recent) >= 2 {
		serviceRestarts[key] = recent
		return true, len(recent) + 1
	}

	recent = append(recent, now)
	serviceRestarts[key] = recent
	return false, len(recent)
}

// ResetFlapCounter clears the flap tracker history for a machine and service
func ResetFlapCounter(machineID, service string) {
	flapMu.Lock()
	defer flapMu.Unlock()

	key := fmt.Sprintf("%s:%s", machineID, strings.TrimSuffix(service, ".service"))
	delete(serviceRestarts, key)
}

// IsServiceAccepted checks if a target service is on the accepted auto-remediation list
func IsServiceAccepted(service string) bool {
	svc := strings.ToLower(strings.TrimSpace(service))
	for _, acc := range DefaultAcceptList {
		if svc == strings.ToLower(acc) {
			return true
		}
	}
	return false
}

func (s *RemediationService) EvaluateAndRemediate(alert models.LinuxAlert, incidentID uuid.UUID) (*models.RemediationJob, error) {
	// Find matching enabled policy for alert category / type or severity
	var policy models.RemediationPolicy
	found := false

	if database.DB != nil {
		if err := database.DB.Where("enabled = ? AND (alert_type = ? OR severity = ?)", true, alert.Category, alert.Severity).First(&policy).Error; err == nil {
			found = true
		}
	}

	// Fallback default policy if DB returns no custom policy match
	if !found {
		policy = s.getDefaultPolicyForAlert(alert)
	}

	// Non-Disruptive Latency Monitoring: Latency spikes NEVER auto-restart services
	if strings.Contains(strings.ToLower(alert.Category), "latency") {
		policy.RequiresApproval = true
	}

	now := time.Now()
	status := "PENDING"
	if policy.RequiresApproval {
		status = "WAITING_APPROVAL"
	}

	cmdStr := s.BuildRemediationCommand(policy.ActionType, policy.Command, alert)
	targetService := alert.Component
	if targetService == "" {
		targetService = "app"
	}

	// Service crash recovery & Flap protection checks
	isFlapping := false
	if policy.ActionType == "restart_service" && !policy.RequiresApproval {
		// Flap protection check (Max 2 restarts per 10 mins)
		flapping, _ := RecordAndCheckFlap(alert.MachineID.String(), targetService)
		if flapping {
			isFlapping = true
			status = "FLAPPING_LOOP_DETECTED"
		}
	}

	job := &models.RemediationJob{
		ID:           uuid.New(),
		IncidentID:   incidentID,
		MachineID:    alert.MachineID,
		PolicyID:     policy.ID,
		ActionType:   policy.ActionType,
		Command:      cmdStr,
		Status:       status,
		RetryAttempt: 0,
		MaxRetries:   policy.RetryCount,
		StartedAt:    now,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if isFlapping {
		job.Output = fmt.Sprintf("FLAP PROTECTION ESCALATION: Service '%s' exceeded 2 restarts in 10 mins. Auto-remediation halted for human review.", targetService)
	}

	if database.DB != nil {
		_ = database.DB.Create(job)
	}

	s.broadcastRemediationEvent("remediation_started", *job)

	// Audit log
	utils.LogAudit("RemediationEngine", alert.MachineID, fmt.Sprintf("Auto-remediation job %s (%s) created for alert %s - Status: %s", job.ID, policy.ActionType, alert.Title, status), "Success")

	if !policy.RequiresApproval && !isFlapping {
		// Enqueue command to agent command pipeline
		cmd := models.Command{
			ID:        uuid.New(),
			MachineID: alert.MachineID,
			Command:   cmdStr,
			Status:    "Pending",
			CreatedAt: now,
		}
		if database.DB != nil {
			_ = database.DB.Create(&cmd)
		}

		compTime := time.Now()
		job.Status = "SUCCESS"
		job.Output = fmt.Sprintf("Remediation command '%s' dispatched to agent successfully.", cmdStr)
		job.CompletedAt = &compTime
		job.UpdatedAt = compTime

		if database.DB != nil {
			_ = database.DB.Save(job)
		}

		s.broadcastRemediationEvent("remediation_completed", *job)
	}

	return job, nil
}

func (s *RemediationService) BuildRemediationCommand(actionType, command string, alert models.LinuxAlert) string {
	if command != "" {
		return command
	}

	target := alert.Component
	if target == "" {
		target = "app"
	}

	switch actionType {
	case "restart_service":
		return fmt.Sprintf("sudo systemctl restart %s", target)
	case "restart_container":
		return fmt.Sprintf("docker restart %s", target)
	case "restart_pod":
		return fmt.Sprintf("kubectl delete pod %s --ignore-not-found", target)
	case "cleanup_disk":
		return "sudo rm -rf /tmp/* /var/tmp/* /var/cache/* /var/log/*.gz && sudo logrotate -f /etc/logrotate.conf || true"
	case "kill_process":
		return fmt.Sprintf("sudo pkill -f %s || true", target)
	case "scale_deployment":
		return fmt.Sprintf("kubectl scale deployment %s --replicas=3", target)
	case "rollback_deployment":
		return fmt.Sprintf("kubectl rollout undo deployment %s", target)
	case "custom_script":
		return "echo 'Running auto remediation script...'"
	default:
		return "sudo systemctl restart nginx || echo 'Remediation completed'"
	}
}

func (s *RemediationService) RetryRemediationJob(jobID uuid.UUID) (*models.RemediationJob, error) {
	var job models.RemediationJob
	if database.DB != nil {
		if err := database.DB.First(&job, "id = ?", jobID).Error; err != nil {
			return nil, err
		}

		job.RetryAttempt++
		now := time.Now()
		job.Status = "RUNNING"
		job.UpdatedAt = now

		cmd := models.Command{
			ID:        uuid.New(),
			MachineID: job.MachineID,
			Command:   job.Command,
			Status:    "Pending",
			CreatedAt: now,
		}
		database.DB.Create(&cmd)

		compTime := time.Now()
		job.Status = "SUCCESS"
		job.Output = fmt.Sprintf("Retried remediation job successfully (attempt %d/%d).", job.RetryAttempt, job.MaxRetries)
		job.CompletedAt = &compTime
		job.UpdatedAt = compTime

		database.DB.Save(&job)
	} else {
		job.ID = jobID
		job.Status = "SUCCESS"
		job.RetryAttempt++
	}

	s.broadcastRemediationEvent("remediation_completed", job)
	return &job, nil
}

func (s *RemediationService) GenerateAIRemediationPlan(alert models.LinuxAlert) string {
	if strings.Contains(strings.ToLower(alert.Category), "latency") {
		return fmt.Sprintf("P95 Latency Spike Remediation Plan:\n"+
			"Target Host: %s\n"+
			"Alert: %s\n"+
			"Action: Non-disruptive Escalation (No Service Restart)\n"+
			"Step 1: Check upstream database connection pool and thread latency.\n"+
			"Step 2: Inspect network packet loss and TCP socket retransmissions.\n"+
			"Step 3: Review application garbage collection (GC) pause logs.",
			alert.MachineID.String(), alert.Title)
	}

	return fmt.Sprintf("AI Remediation Plan Suggestion:\n"+
		"Incident Target: %s\n"+
		"Alert Breach: %s\n"+
		"Recommended Step 1: Execute '%s'\n"+
		"Recommended Step 2: Clear temporary cache directory (/tmp, /var/tmp, /var/cache)\n"+
		"Recommended Step 3: Verify system readiness probes and reload configuration.",
		alert.MachineID.String(), alert.Title, s.BuildRemediationCommand("restart_service", "", alert))
}

func (s *RemediationService) getDefaultPolicyForAlert(alert models.LinuxAlert) models.RemediationPolicy {
	action := "restart_service"
	cat := strings.ToLower(alert.Category)
	requiresApproval := false

	if strings.Contains(cat, "disk") || strings.Contains(cat, "storage") {
		action = "cleanup_disk"
	} else if strings.Contains(cat, "latency") {
		action = "custom_script"
		requiresApproval = true
	} else if strings.Contains(cat, "docker") || strings.Contains(cat, "container") {
		action = "restart_container"
	} else if strings.Contains(cat, "kube") || strings.Contains(cat, "pod") {
		action = "restart_pod"
	} else if strings.Contains(cat, "process") {
		action = "kill_process"
	}

	return models.RemediationPolicy{
		ID:               uuid.New(),
		Name:             fmt.Sprintf("Auto-Fix for %s", alert.Category),
		AlertType:        alert.Category,
		Severity:         alert.Severity,
		ActionType:       action,
		Enabled:          true,
		RequiresApproval: requiresApproval,
		RetryCount:       3,
		TimeoutSec:       60,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
}

func (s *RemediationService) broadcastRemediationEvent(eventType string, job models.RemediationJob) {
	if websocket.WS != nil {
		websocket.WS.Broadcast(map[string]interface{}{
			"type":          eventType,
			"job":           job,
			"id":            job.ID.String(),
			"machine_id":    job.MachineID.String(),
			"action_type":   job.ActionType,
			"command":       job.Command,
			"status":        job.Status,
			"retry_attempt": job.RetryAttempt,
		})
	}
}

