package docker

import (
	"encoding/json"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DockerVersionInput struct {
	DockerVersion string `json:"docker_version"`
	EngineVersion string `json:"engine_version"`
	APIVersion    string `json:"api_version"`
	HostOS        string `json:"host_os"`
	DockerRootDir string `json:"docker_root_dir"`
}

type DockerContainerInput struct {
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

type DockerImageInput struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Tag         string    `json:"tag"`
	Size        int64     `json:"size"`
	IsUnused    bool      `json:"is_unused"`
	CreatedTime time.Time `json:"created_time"`
}

type DockerVolumeInput struct {
	Name       string `json:"name"`
	Driver     string `json:"driver"`
	MountPoint string `json:"mount_point"`
	UsageBytes int64  `json:"usage_bytes"`
}

type DockerNetworkInput struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	Driver              string   `json:"driver"`
	Scope               string   `json:"scope"`
	ConnectedContainers []string `json:"connected_containers"`
}

type DockerEventInput struct {
	Time      time.Time `json:"time"`
	Type      string    `json:"type"`
	Action    string    `json:"action"`
	ActorID   string    `json:"actor_id"`
	ActorName string    `json:"actor_name"`
	Message   string    `json:"message"`
}

func SaveDockerMetrics(
	serverID uuid.UUID,
	dockerInstalled bool,
	dockerVersion DockerVersionInput,
	dockerContainers []DockerContainerInput,
	dockerImages []DockerImageInput,
	dockerVolumes []DockerVolumeInput,
	dockerNetworks []DockerNetworkInput,
	dockerEvents []DockerEventInput,
) error {
	db := database.DB
	if db == nil {
		return nil
	}

	// 1. Handle Docker Not Installed scenario
	if !dockerInstalled {
		// Update DockerHost status if exists
		var host models.DockerHost
		err := db.Where("server_id = ?", serverID).First(&host).Error
		if err == nil {
			host.DockerVersion = "Docker Not Installed"
			host.EngineVersion = "Docker Not Installed"
			host.UpdatedAt = time.Now()
			db.Save(&host)
		}
		// Clear or mark containers offline
		db.Model(&models.DockerContainer{}).Where("server_id = ?", serverID).Updates(map[string]interface{}{
			"status":     "Offline",
			"state":      "exited",
			"updated_at": time.Now(),
		})
		return nil
	}

	// 2. Save Docker Host Info
	host := models.DockerHost{
		ID:            uuid.New(),
		ServerID:      serverID,
		DockerVersion: dockerVersion.DockerVersion,
		EngineVersion: dockerVersion.EngineVersion,
		APIVersion:    dockerVersion.APIVersion,
		HostOS:        dockerVersion.HostOS,
		DockerRootDir: dockerVersion.DockerRootDir,
		Containers:    len(dockerContainers),
		Images:        len(dockerImages),
		Volumes:       len(dockerVolumes),
		Networks:      len(dockerNetworks),
		UpdatedAt:     time.Now(),
	}

	db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "server_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"docker_version", "engine_version", "api_version", "host_os", "docker_root_dir",
			"containers", "images", "volumes", "networks", "updated_at",
		}),
	}).Create(&host)

	// 3. Save Containers
	activeContainerIDs := make([]string, 0)
	for _, c := range dockerContainers {
		activeContainerIDs = append(activeContainerIDs, c.ID)

		container := models.DockerContainer{
			ID:           c.ID,
			ServerID:     serverID,
			Name:         c.Name,
			Image:        c.Image,
			Status:       c.Status,
			State:        c.State,
			CPUPercent:   c.CPUPercent,
			MemoryUsed:   c.MemoryUsed,
			MemoryLimit:  c.MemoryLimit,
			MemoryPct:    c.MemoryPct,
			NetworkIn:    c.NetworkIn,
			NetworkOut:   c.NetworkOut,
			DiskRead:     c.DiskRead,
			DiskWrite:    c.DiskWrite,
			PIDs:         c.PIDs,
			RestartCount: c.RestartCount,
			Uptime:       c.Uptime,
			CreatedTime:  c.CreatedTime,
			UpdatedAt:    time.Now(),
		}

		db.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "server_id"}, {Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"status", "state", "cpu_percent", "memory_used", "memory_limit", "memory_pct",
				"network_in", "network_out", "disk_read", "disk_write", "p_ids", "restart_count",
				"uptime", "updated_at",
			}),
		}).Create(&container)

		// Broadcast container update via WebSocket
		websocket.PublishEvent("docker.updated", serverID.String(), map[string]interface{}{
			"type":         "container_updated",
			"server_id":    serverID.String(),
			"container_id": c.ID,
			"name":         c.Name,
			"state":        c.State,
			"cpu_percent":  c.CPUPercent,
			"memory_pct":   c.MemoryPct,
		})
	}

	// Prune inactive containers
	if len(activeContainerIDs) > 0 {
		db.Where("server_id = ? AND id NOT IN ?", serverID, activeContainerIDs).Delete(&models.DockerContainer{})
	} else {
		db.Where("server_id = ?", serverID).Delete(&models.DockerContainer{})
	}

	// 4. Save Images
	activeImageIDs := make([]string, 0)
	for _, img := range dockerImages {
		activeImageIDs = append(activeImageIDs, img.ID)

		image := models.DockerImage{
			ID:          img.ID,
			ServerID:    serverID,
			Name:        img.Name,
			Tag:         img.Tag,
			Size:        img.Size,
			IsUnused:    img.IsUnused,
			CreatedTime: img.CreatedTime,
			UpdatedAt:   time.Now(),
		}

		db.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "server_id"}, {Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"name", "tag", "size", "is_unused", "updated_at",
			}),
		}).Create(&image)
	}

	if len(activeImageIDs) > 0 {
		db.Where("server_id = ? AND id NOT IN ?", serverID, activeImageIDs).Delete(&models.DockerImage{})
	} else {
		db.Where("server_id = ?", serverID).Delete(&models.DockerImage{})
	}

	// 5. Save Volumes
	activeVolNames := make([]string, 0)
	for _, vol := range dockerVolumes {
		activeVolNames = append(activeVolNames, vol.Name)

		volume := models.DockerVolume{
			Name:       vol.Name,
			ServerID:   serverID,
			Driver:     vol.Driver,
			MountPoint: vol.MountPoint,
			UsageBytes: vol.UsageBytes,
			UpdatedAt:  time.Now(),
		}

		db.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "server_id"}, {Name: "name"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"driver", "mount_point", "usage_bytes", "updated_at",
			}),
		}).Create(&volume)
	}

	if len(activeVolNames) > 0 {
		db.Where("server_id = ? AND name NOT IN ?", serverID, activeVolNames).Delete(&models.DockerVolume{})
	} else {
		db.Where("server_id = ?", serverID).Delete(&models.DockerVolume{})
	}

	// 6. Save Networks
	activeNetIDs := make([]string, 0)
	for _, net := range dockerNetworks {
		activeNetIDs = append(activeNetIDs, net.ID)

		connBytes, _ := json.Marshal(net.ConnectedContainers)

		network := models.DockerNetwork{
			ID:                  net.ID,
			ServerID:            serverID,
			Name:                net.Name,
			Driver:              net.Driver,
			Scope:               net.Scope,
			ConnectedContainers: string(connBytes),
			UpdatedAt:           time.Now(),
		}

		db.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "server_id"}, {Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"name", "driver", "scope", "connected_containers", "updated_at",
			}),
		}).Create(&network)
	}

	if len(activeNetIDs) > 0 {
		db.Where("server_id = ? AND id NOT IN ?", serverID, activeNetIDs).Delete(&models.DockerNetwork{})
	} else {
		db.Where("server_id = ?", serverID).Delete(&models.DockerNetwork{})
	}

	// 7. Save and stream Events
	for _, ev := range dockerEvents {
		event := models.DockerEvent{
			ID:        uuid.New(),
			ServerID:  serverID,
			Time:      ev.Time,
			Type:      ev.Type,
			Action:    ev.Action,
			ActorID:   ev.ActorID,
			ActorName: ev.ActorName,
			Message:   ev.Message,
		}

		db.Create(&event)

		// Broadcast live Docker events to client dashboards
		websocket.PublishDockerEvent(serverID.String(), websocket.DockerEventPayload{
			Time:      ev.Time,
			Type:      ev.Type,
			Action:    ev.Action,
			ActorName: ev.ActorName,
			Message:   ev.Message,
		})
	}

	return nil
}

// CheckDockerAlerts evaluates container logs and generates GORM alerts
func CheckDockerAlerts(db *gorm.DB, serverID uuid.UUID, containers []DockerContainerInput) {
}
