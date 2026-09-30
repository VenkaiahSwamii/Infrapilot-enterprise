package subscribers

import (
	"log"

	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/websocket"
)

// SendWebSocket broadcasts events to WebSocket clients
func SendWebSocket(e events.Event) {
	log.Printf("Broadcasting event via WebSocket: %s", e.Name())

	var payload map[string]interface{}

	switch ev := e.(type) {
	case events.MachineOnlineEvent:
		payload = map[string]interface{}{
			"type":       "machine_online",
			"machine_id": ev.MachineID,
			"last_seen":  ev.LastSeen,
		}
	case events.MetricReceivedEvent:
		payload = map[string]interface{}{
			"type":          "metric.received",
			"machine_id":    ev.MachineID,
			"hostname":      ev.Hostname,
			"ip_address":    ev.IPAddress,
			"os":            ev.OS,
			"cpu_usage":     ev.CPU,
			"memory_usage":  ev.Memory,
			"disk_usage":    ev.Disk,
			"storage_usage": ev.Disk,
			"upload_mbps":   ev.Upload,
			"download_mbps": ev.Download,
			"network_mbps":  ev.Upload + ev.Download,
			"last_seen":     ev.Time,
			"timestamp":     ev.Time,
		}
	case events.MachineRegisteredEvent:
		payload = map[string]interface{}{
			"type":       "machine.registered",
			"machine_id": ev.MachineID,
			"hostname":   ev.Hostname,
			"ip_address": ev.IPAddress,
			"os":         ev.OS,
			"platform":   ev.Platform,
			"timestamp":  ev.Time,
		}
	case events.MachineOfflineEvent:
		payload = map[string]interface{}{
			"type":       "machine.offline",
			"machine_id": ev.MachineID,
			"hostname":   ev.Hostname,
			"ip_address": ev.IPAddress,
			"os":         ev.OS,
			"platform":   ev.Platform,
			"last_seen":  ev.LastSeen,
			"timestamp":  ev.Time,
		}
	case events.AlertCreatedEvent:
		payload = map[string]interface{}{
			"type":       "alert.created",
			"id":         ev.ID,
			"alert_id":   ev.ID,
			"machine_id": ev.MachineID,
			"title":      ev.Title,
			"severity":   ev.Severity,
			"message":    ev.Message,
			"status":     ev.Status,
			"timestamp":  ev.CreatedAt,
		}
	case events.CommandExecutedEvent:
		payload = map[string]interface{}{
			"type":        "command.executed",
			"machine_id":  ev.MachineID,
			"command":     ev.Command,
			"output":      ev.Output,
			"exit_code":   ev.ExitCode,
			"executed_by": ev.ExecutedBy,
			"timestamp":   ev.Time,
		}
	case events.TerminalOpenedEvent:
		payload = map[string]interface{}{
			"type":          "terminal.opened",
			"machine_id":    ev.MachineID,
			"session_id":    ev.SessionID,
			"user_id":       ev.UserID,
			"username":      ev.Username,
			"terminal_type": ev.TerminalType,
			"timestamp":     ev.Time,
		}
	case events.TerminalClosedEvent:
		payload = map[string]interface{}{
			"type":       "terminal.closed",
			"machine_id": ev.MachineID,
			"session_id": ev.SessionID,
			"user_id":    ev.UserID,
			"username":   ev.Username,
			"duration":   ev.Duration,
			"timestamp":  ev.Time,
		}
	case events.FileUploadedEvent:
		payload = map[string]interface{}{
			"type":        "file.uploaded",
			"machine_id":  ev.MachineID,
			"file_path":   ev.FilePath,
			"file_name":   ev.FileName,
			"file_size":   ev.FileSize,
			"uploaded_by": ev.UploadedBy,
			"timestamp":   ev.Time,
		}
	case events.FileDeletedEvent:
		payload = map[string]interface{}{
			"type":       "file.deleted",
			"machine_id": ev.MachineID,
			"file_path":  ev.FilePath,
			"file_name":  ev.FileName,
			"deleted_by": ev.DeletedBy,
			"timestamp":  ev.Time,
		}
	case events.DockerContainerStoppedEvent:
		payload = map[string]interface{}{
			"type":           "docker.container.stopped",
			"machine_id":     ev.MachineID,
			"container_id":   ev.ContainerID,
			"container_name": ev.ContainerName,
			"image":          ev.Image,
			"exit_code":      ev.ExitCode,
			"timestamp":      ev.Time,
		}
	case events.KubernetesPodFailedEvent:
		payload = map[string]interface{}{
			"type":       "kubernetes.pod.failed",
			"machine_id": ev.MachineID,
			"pod_name":   ev.PodName,
			"namespace":  ev.Namespace,
			"reason":     ev.Reason,
			"message":    ev.Message,
			"timestamp":  ev.Time,
		}
	case events.UserLoginEvent:
		payload = map[string]interface{}{
			"type":       "user.login",
			"user_id":    ev.UserID,
			"username":   ev.Username,
			"email":      ev.Email,
			"ip_address": ev.IPAddress,
			"user_agent": ev.UserAgent,
			"timestamp":  ev.Time,
		}
	case events.UserLogoutEvent:
		payload = map[string]interface{}{
			"type":      "user.logout",
			"user_id":   ev.UserID,
			"username":  ev.Username,
			"timestamp": ev.Time,
		}
	default:
		payload = map[string]interface{}{
			"type":      e.Name(),
			"timestamp": e.Timestamp(),
		}
	}

	// Broadcast to all connected WebSocket clients
	websocket.WS.Broadcast(payload)
	log.Printf("Event %s broadcasted to WebSocket clients", e.Name())
}
