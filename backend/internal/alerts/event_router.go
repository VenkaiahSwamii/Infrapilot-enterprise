package alerts

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"

	"github.com/google/uuid"
)

// InfrastructureEvent represents any discrete system, agent, container, cluster, or security event.
type InfrastructureEvent struct {
	MachineID   uuid.UUID              `json:"machine_id"`
	EventType   string                 `json:"event_type"` // e.g. SERVICE_CRASH, DISK_EXHAUSTION, LATENCY_SPIKE, DOCKER_OOM, CONTAINER_DIE, K8S_POD_CRASH, SYSTEM_LOG_ERROR, SECURITY_BREACH
	Entity      string                 `json:"entity"`     // Target service, mount point, container ID/name, pod name, or event ID
	Severity    string                 `json:"severity"`   // Critical, Major, Warning, Info
	Message     string                 `json:"message"`
	ActionTaken string                 `json:"action_taken,omitempty"`
	ErrorMsg    string                 `json:"error_msg,omitempty"`
	Phase       string                 `json:"phase,omitempty"` // TRIGGERED, FAILED, PENDING_OPERATOR, WAITING_APPROVAL, RESOLVED
	Timestamp   time.Time              `json:"timestamp"`
	RawPayload  map[string]interface{} `json:"raw_payload,omitempty"`
}

var (
	eventDebounceMu  sync.Mutex
	eventDebounceMap = make(map[string]time.Time)
	eventCountMap    = make(map[string]int)
)

// formatSourceTag returns a friendly visual tag for event titles.
func formatSourceTag(eventType string) string {
	et := strings.ToUpper(eventType)
	switch {
	case strings.HasPrefix(et, "DOCKER"):
		return "Docker"
	case strings.HasPrefix(et, "K8S") || strings.Contains(et, "POD"):
		return "K8s"
	case strings.Contains(et, "SERVICE") || strings.Contains(et, "CRASH"):
		return "SRE"
	case strings.Contains(et, "SECURITY") || strings.Contains(et, "AUTH"):
		return "Security"
	case strings.Contains(et, "SYSTEM") || strings.Contains(et, "LOG"):
		return "System"
	default:
		return "Event"
	}
}

// formatEventTitle returns a clean title for the alert.
func formatEventTitle(eventType string) string {
	switch strings.ToUpper(eventType) {
	case "SERVICE_CRASH":
		return "Service Crash"
	case "DISK_EXHAUSTION":
		return "Disk Exhaustion Imminent"
	case "LATENCY_SPIKE":
		return "Network Latency Spike"
	case "DOCKER_OOM", "CONTAINER_OOM":
		return "Container OOM Killed"
	case "DOCKER_DIE", "CONTAINER_DIE":
		return "Container Terminated Prematurely"
	case "K8S_POD_CRASH", "CRASH_LOOP_BACKOFF":
		return "Kubernetes CrashLoopBackOff"
	case "K8S_NODE_NOT_READY":
		return "Kubernetes Node Not Ready"
	case "SYSTEM_LOG_ERROR":
		return "System Log Error Event"
	case "SECURITY_BREACH":
		return "Security Incident Detected"
	default:
		return strings.ReplaceAll(eventType, "_", " ")
	}
}

// generateEventRecoverySuggestion produces automated advice for resolving the event.
func generateEventRecoverySuggestion(eventType, entity string) string {
	switch strings.ToUpper(eventType) {
	case "SERVICE_CRASH":
		return fmt.Sprintf("Inspect journal logs (`journalctl -u %s.service -n 50`) and attempt restart (`systemctl restart %s`).", entity, entity)
	case "DISK_EXHAUSTION":
		return fmt.Sprintf("Run disk cleanup on mount '%s' (`journalctl --vacuum-time=2d` or purge /tmp) or expand volume.", entity)
	case "LATENCY_SPIKE":
		return fmt.Sprintf("Probe gateway routes and check network interface drops (`mtr -n -c 10 %s`).", entity)
	case "DOCKER_OOM", "CONTAINER_OOM":
		return fmt.Sprintf("Increase container memory limit (`docker update --memory 2g %s`) and inspect OOM stacktrace.", entity)
	case "DOCKER_DIE", "CONTAINER_DIE":
		return fmt.Sprintf("Check container crash exit code (`docker inspect %s --format='{{.State.ExitCode}}'`) and restart.", entity)
	case "K8S_POD_CRASH", "CRASH_LOOP_BACKOFF":
		return fmt.Sprintf("Examine pod logs (`kubectl logs -n default %s --previous`) and verify container probes.", entity)
	case "K8S_NODE_NOT_READY":
		return fmt.Sprintf("Inspect kubelet status on node '%s' and check system resources / disk pressure.", entity)
	case "SYSTEM_LOG_ERROR":
		return fmt.Sprintf("Review full syslog/EventLog context around event ID '%s' to trace causative subsystem.", entity)
	case "SECURITY_BREACH":
		return fmt.Sprintf("Isolate suspicious host process, verify firewall ACLs, and review authentication logs for %s.", entity)
	default:
		return "Inspect host telemetry and investigate causative event logs."
	}
}

// RouteInfrastructureEvent receives an event, enforces debouncing/deduplication,
// persists it to the database as a LinuxAlert with Origin = 'event', and broadcasts it.
func RouteInfrastructureEvent(evt InfrastructureEvent) (*models.LinuxAlert, error) {
	if evt.MachineID == uuid.Nil {
		// Attempt to associate with first known machine if only 1 machine exists
		if database.DB != nil {
			var m models.Machine
			if err := database.DB.Select("id").First(&m).Error; err == nil && m.ID != uuid.Nil {
				evt.MachineID = m.ID
			}
		}
	}
	if evt.MachineID == uuid.Nil {
		return nil, fmt.Errorf("event missing machine_id")
	}

	if evt.Timestamp.IsZero() {
		evt.Timestamp = time.Now()
	}

	if evt.Severity == "" {
		evt.Severity = "Critical"
	}
	priority := models.MapSeverityToPriority(evt.Severity)

	// Fetch hostname for enrichment and broadcasting
	hostname := evt.MachineID.String()
	if database.DB != nil {
		var m models.Machine
		if err := database.DB.Select("hostname").Where("id = ?", evt.MachineID).First(&m).Error; err == nil && m.Hostname != "" {
			hostname = m.Hostname
		}
	}

	eventKey := fmt.Sprintf("%s:%s:%s",
		evt.MachineID.String(),
		strings.ToLower(evt.EventType),
		strings.ToLower(evt.Entity),
	)

	// Check for Resolution Phase
	isResolution := strings.EqualFold(evt.Phase, "RESOLVED") ||
		strings.Contains(strings.ToLower(evt.ActionTaken), "resolved") ||
		strings.Contains(strings.ToLower(evt.Message), "verified healthy") ||
		strings.Contains(strings.ToLower(evt.Message), "auto-resolved")

	if isResolution {
		if database.DB == nil {
			return nil, nil
		}
		var existing models.LinuxAlert
		err := database.DB.Where(
			"machine_id = ? AND category = ? AND component = ? AND LOWER(status) IN ('open', 'active')",
			evt.MachineID, evt.EventType, evt.Entity,
		).Order("created_at desc").First(&existing).Error

		if err == nil {
			now := time.Now()
			note := fmt.Sprintf("Auto-resolved via Event: %s", evt.Message)
			if note == "Auto-resolved via Event: " {
				note = "Event recovery verified; service/resource returned to normal state."
			}

			database.DB.Model(&models.LinuxAlert{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
				"status":          "RESOLVED",
				"resolution_note": note,
				"resolved_by":     "System (Event Auto-Resolved)",
				"resolved_at":     &now,
				"updated_at":      now,
			})
			existing.Status = "RESOLVED"
			existing.ResolutionNote = note
			existing.ResolvedBy = "System (Event Auto-Resolved)"
			existing.ResolvedAt = &now
			existing.UpdatedAt = now

			BroadcastAlertPayload(existing, hostname, true)
			services.ResetAlertEmailCooldown(existing.MachineID, existing.Category, existing.Title)

			eventDebounceMu.Lock()
			delete(eventDebounceMap, eventKey)
			delete(eventCountMap, eventKey)
			eventDebounceMu.Unlock()

			return &existing, nil
		}
		return nil, nil
	}

	// Non-resolution: Trigger/Alert Event
	// 1. Debounce & In-Place Update check for existing active event alert
	if database.DB != nil {
		var existing models.LinuxAlert
		err := database.DB.Where(
			"machine_id = ? AND category = ? AND component = ? AND LOWER(status) IN ('open', 'active')",
			evt.MachineID, evt.EventType, evt.Entity,
		).Order("created_at desc").First(&existing).Error

		if err == nil {
			// Alert already active: update occurrence count and latest message without spamming duplicate rows
			eventDebounceMu.Lock()
			eventCountMap[eventKey]++
			curCount := eventCountMap[eventKey]
			eventDebounceMu.Unlock()

			now := time.Now()
			updatedMsg := evt.Message
			if curCount > 1 {
				updatedMsg = fmt.Sprintf("%s (re-occurred %d times)", evt.Message, curCount)
			}

			database.DB.Model(&models.LinuxAlert{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
				"metric_value": float64(curCount + 1),
				"message":      updatedMsg,
				"severity":     evt.Severity,
				"priority":     priority,
				"updated_at":   now,
			})
			existing.MetricValue = float64(curCount + 1)
			existing.Message = updatedMsg
			existing.Severity = evt.Severity
			existing.Priority = priority
			existing.UpdatedAt = now

			BroadcastAlertPayload(existing, hostname, false)
			return &existing, nil
		}
	}

	// 2. Create Brand New Event-Driven Alert
	now := time.Now()
	var rawDataStr string
	if len(evt.RawPayload) > 0 {
		if b, err := json.Marshal(evt.RawPayload); err == nil {
			rawDataStr = string(b)
		}
	}

	title := fmt.Sprintf("[%s] %s: %s", formatSourceTag(evt.EventType), formatEventTitle(evt.EventType), evt.Entity)
	if evt.Entity == "" {
		title = fmt.Sprintf("[%s] %s", formatSourceTag(evt.EventType), formatEventTitle(evt.EventType))
	}

	newAlert := models.LinuxAlert{
		ID:                 uuid.New(),
		MachineID:          evt.MachineID,
		RuleID:             uuid.Nil,
		Title:              title,
		Description:        evt.Message,
		Type:               strings.ToLower(evt.EventType),
		Category:           evt.EventType,
		Component:          evt.Entity,
		Source:             "EVENT",
		Origin:             "event",
		Severity:           evt.Severity,
		Priority:           priority,
		Message:            evt.Message,
		Status:             "ACTIVE",
		MetricValue:        1.0,
		Threshold:          1.0,
		RecoverySuggestion: generateEventRecoverySuggestion(evt.EventType, evt.Entity),
		EventData:          rawDataStr,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if database.DB != nil {
		if err := database.DB.Create(&newAlert).Error; err != nil {
			log.Printf("[EventAlertRouter] Failed to persist event alert: %v", err)
			return nil, err
		}
	}

	eventDebounceMu.Lock()
	eventDebounceMap[eventKey] = now
	eventCountMap[eventKey] = 1
	eventDebounceMu.Unlock()

	log.Printf("[EventAlertRouter] Event Alert Created: Host=%s Type=%s Entity=%s Severity=%s",
		hostname, evt.EventType, evt.Entity, evt.Severity)

	// Send notification & broadcast
	go services.SendAlert(newAlert)
	BroadcastAlertPayload(newAlert, hostname, true)

	return &newAlert, nil
}

// IngestSREEvent processes SRE crash, disk, or latency events from the agent controller.
func IngestSREEvent(machineID uuid.UUID, eventType, target, actionTaken, errorMsg, phase string) (*models.LinuxAlert, error) {
	sev := "Critical"
	if strings.Contains(strings.ToLower(eventType), "warning") || strings.Contains(strings.ToLower(phase), "waiting") {
		sev = "Warning"
	} else if strings.EqualFold(phase, "PENDING_OPERATOR") {
		sev = "Major"
	}

	msg := actionTaken
	if errorMsg != "" {
		msg = fmt.Sprintf("%s - %s", actionTaken, errorMsg)
	}

	return RouteInfrastructureEvent(InfrastructureEvent{
		MachineID:   machineID,
		EventType:   eventType,
		Entity:      target,
		Severity:    sev,
		Message:     msg,
		ActionTaken: actionTaken,
		ErrorMsg:    errorMsg,
		Phase:       phase,
		Timestamp:   time.Now(),
		RawPayload: map[string]interface{}{
			"action_taken": actionTaken,
			"error_msg":    errorMsg,
			"phase":        phase,
			"target":       target,
		},
	})
}

// IngestDockerLifecycleEvent translates container crash or OOM events into event alerts.
func IngestDockerLifecycleEvent(machineID uuid.UUID, evt services.DockerEventInput) (*models.LinuxAlert, error) {
	action := strings.ToLower(evt.Action)
	if action != "die" && action != "oom" && action != "kill" && action != "stop" && action != "destroy" {
		return nil, nil // Ignore benign events like start, create, connect
	}

	containerName := evt.ActorName
	if containerName == "" {
		containerName = evt.ActorID
		if len(containerName) > 12 {
			containerName = containerName[:12]
		}
	}
	if containerName == "" {
		containerName = "container"
	}

	eventType := "DOCKER_DIE"
	sev := "Major"
	if action == "oom" {
		eventType = "DOCKER_OOM"
		sev = "Critical"
	}

	msg := evt.Message
	if msg == "" {
		msg = fmt.Sprintf("Docker container '%s' terminated via %s", containerName, action)
	}

	return RouteInfrastructureEvent(InfrastructureEvent{
		MachineID: machineID,
		EventType: eventType,
		Entity:    containerName,
		Severity:  sev,
		Message:   msg,
		Timestamp: time.Now(),
		RawPayload: map[string]interface{}{
			"container_id": evt.ActorID,
			"action":       evt.Action,
			"message":      evt.Message,
		},
	})
}

// IngestKubernetesEvent translates K8s pod crash, Evicted, or NodeNotReady events.
func IngestKubernetesEvent(clusterID uuid.UUID, k8sEvt models.KubernetesEvent) (*models.LinuxAlert, error) {
	reason := strings.ToUpper(k8sEvt.Reason)
	isCritical := strings.Contains(reason, "CRASH") ||
		strings.Contains(reason, "OOM") ||
		strings.Contains(reason, "FAILED") ||
		strings.Contains(reason, "NOTREADY")

	if !isCritical && !strings.EqualFold(k8sEvt.Type, "Warning") {
		return nil, nil
	}

	sev := "Warning"
	if isCritical {
		sev = "Critical"
	}

	eventType := "K8S_POD_CRASH"
	if strings.Contains(reason, "NODE") {
		eventType = "K8S_NODE_NOT_READY"
	}

	msg := fmt.Sprintf("[%s] %s on %s: %s", k8sEvt.Reason, k8sEvt.Message, k8sEvt.Namespace, k8sEvt.InvolvedObject)

	return RouteInfrastructureEvent(InfrastructureEvent{
		MachineID: clusterID,
		EventType: eventType,
		Entity:    k8sEvt.InvolvedObject,
		Severity:  sev,
		Message:   msg,
		Timestamp: time.Now(),
		RawPayload: map[string]interface{}{
			"reason":          k8sEvt.Reason,
			"involved_object": k8sEvt.InvolvedObject,
			"namespace":       k8sEvt.Namespace,
			"type":            k8sEvt.Type,
		},
	})
}

// IngestLogEvent translates high-priority system logs and Windows EventLog events.
func IngestLogEvent(machineID uuid.UUID, level, source, eventID, message string) (*models.LinuxAlert, error) {
	lvl := strings.ToUpper(strings.TrimSpace(level))
	if lvl != "CRITICAL" && lvl != "FATAL" && lvl != "EMERG" && lvl != "ALERT" && lvl != "ERROR" {
		return nil, nil // Only process error and critical log events
	}

	sev := "Major"
	if lvl == "CRITICAL" || lvl == "FATAL" || lvl == "EMERG" {
		sev = "Critical"
	}

	entity := source
	if eventID != "" {
		entity = fmt.Sprintf("%s:%s", source, eventID)
	}

	return RouteInfrastructureEvent(InfrastructureEvent{
		MachineID: machineID,
		EventType: "SYSTEM_LOG_ERROR",
		Entity:    entity,
		Severity:  sev,
		Message:   message,
		Timestamp: time.Now(),
		RawPayload: map[string]interface{}{
			"level":    level,
			"source":   source,
			"event_id": eventID,
		},
	})
}
