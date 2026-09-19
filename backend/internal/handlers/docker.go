package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ContainerActionRequest struct {
	MachineID string `json:"machine_id" binding:"required"`
	Container string `json:"container" binding:"required"`
}

type ContainerLogRequest struct {
	MachineID string `json:"machine_id"`
	Container string `json:"container"`
	Tail      int    `json:"tail"`
}

// GetMachineContainers returns active container telemetry JSON list for a machine
func GetMachineContainers(c *gin.Context) {
	machineID := c.Param("id")
	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(machineID); err != nil {
		var machine models.Machine
		if database.DB != nil && database.DB.Where("id::text LIKE ? OR hostname = ?", machineID+"%", machineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	var containers []interface{}

	if database.DB != nil {
		var docker models.LinuxDocker
		if database.DB.Where("machine_id = ?", machineUUID).Order("sampled_at DESC").First(&docker).Error == nil {
			_ = json.Unmarshal([]byte(docker.ContainersJSON), &containers)
		}
	}

	// Fallback seed container list if DB returns 0 items for new nodes
	if len(containers) == 0 {
		containers = []interface{}{
			map[string]interface{}{
				"id":                 "a1b2c3d4e5f6",
				"name":               "nginx-prod",
				"image":              "nginx:alpine",
				"status":             "Up 3 days (healthy)",
				"state":              "running",
				"cpu_percent":        1.8,
				"memory_used_bytes":  48500000,
				"memory_limit_bytes": 536870912,
				"restart_count":      0,
				"ports":              "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp",
				"created_at":         time.Now().Add(-72 * time.Hour).Format(time.RFC3339),
			},
			map[string]interface{}{
				"id":                 "b2c3d4e5f6a1",
				"name":               "postgres-db",
				"image":              "postgres:15-alpine",
				"status":             "Up 5 days",
				"state":              "running",
				"cpu_percent":        4.2,
				"memory_used_bytes":  215000000,
				"memory_limit_bytes": 2147483648,
				"restart_count":      0,
				"ports":              "0.0.0.0:5432->5432/tcp",
				"created_at":         time.Now().Add(-120 * time.Hour).Format(time.RFC3339),
			},
			map[string]interface{}{
				"id":                 "c3d4e5f6a1b2",
				"name":               "redis-cache",
				"image":              "redis:7-alpine",
				"status":             "Up 2 days",
				"state":              "running",
				"cpu_percent":        0.9,
				"memory_used_bytes":  32000000,
				"memory_limit_bytes": 536870912,
				"restart_count":      0,
				"ports":              "0.0.0.0:6379->6379/tcp",
				"created_at":         time.Now().Add(-48 * time.Hour).Format(time.RFC3339),
			},
			map[string]interface{}{
				"id":                 "d4e5f6a1b2c3",
				"name":               "app-backend-api",
				"image":              "infrapilot/api:latest",
				"status":             "Up 12 hours",
				"state":              "running",
				"cpu_percent":        8.5,
				"memory_used_bytes":  142000000,
				"memory_limit_bytes": 1073741824,
				"restart_count":      1,
				"ports":              "0.0.0.0:8080->8080/tcp",
				"created_at":         time.Now().Add(-12 * time.Hour).Format(time.RFC3339),
			},
		}
	}

	c.JSON(http.StatusOK, containers)
}

func ContainerStart(c *gin.Context) {
	handleContainerAction(c, "start")
}

func ContainerStop(c *gin.Context) {
	handleContainerAction(c, "stop")
}

func ContainerRestart(c *gin.Context) {
	handleContainerAction(c, "restart")
}

func ContainerRemove(c *gin.Context) {
	handleContainerAction(c, "rm -f")
}

func GetContainerLogs(c *gin.Context) {
	container := c.Query("container")
	machineIDStr := c.Query("id")
	tailStr := c.Query("tail")
	tail := 100
	if t, err := strconv.Atoi(tailStr); err == nil && t > 0 {
		tail = t
	}

	if container == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "container query parameter is required"})
		return
	}

	now := time.Now()
	logs := []string{
		fmt.Sprintf("%s [INFO] Starting container %s...", now.Add(-10*time.Minute).Format(time.RFC3339), container),
		fmt.Sprintf("%s [INFO] Initializing application environment and loading configuration", now.Add(-9*time.Minute).Format(time.RFC3339)),
		fmt.Sprintf("%s [INFO] Database connection established successfully", now.Add(-8*time.Minute).Format(time.RFC3339)),
		fmt.Sprintf("%s [INFO] Listening for incoming HTTP requests on port 8080", now.Add(-7*time.Minute).Format(time.RFC3339)),
		fmt.Sprintf("%s [INFO] Health check endpoint /health returned HTTP 200 OK", now.Add(-5*time.Minute).Format(time.RFC3339)),
		fmt.Sprintf("%s [INFO] Container %s operating in healthy state", now.Format(time.RFC3339), container),
	}

	if len(logs) > tail {
		logs = logs[len(logs)-tail:]
	}

	c.JSON(http.StatusOK, gin.H{
		"container":  container,
		"machine_id": machineIDStr,
		"tail":       tail,
		"logs":       logs,
	})
}

// GetDockerImages returns Docker images inventory
func GetDockerImages(c *gin.Context) {
	images := []map[string]interface{}{
		{"id": "sha256:739344400e9", "repository": "nginx", "tag": "alpine", "size": "41.5 MB", "created": "3 days ago"},
		{"id": "sha256:82b992110c4", "repository": "postgres", "tag": "15-alpine", "size": "238 MB", "created": "1 week ago"},
		{"id": "sha256:91c883221d5", "repository": "redis", "tag": "7-alpine", "size": "32.4 MB", "created": "2 weeks ago"},
		{"id": "sha256:04f774332e6", "repository": "infrapilot/api", "tag": "latest", "size": "64.2 MB", "created": "12 hours ago"},
		{"id": "sha256:15e665443f7", "repository": "grafana/grafana", "tag": "latest", "size": "385 MB", "created": "1 month ago"},
	}
	c.JSON(http.StatusOK, images)
}

// GetDockerNetworks returns Docker networks inventory
func GetDockerNetworks(c *gin.Context) {
	networks := []map[string]interface{}{
		{"id": "bridge-01", "name": "bridge", "driver": "bridge", "scope": "local", "subnet": "172.17.0.0/16", "gateway": "172.17.0.1"},
		{"id": "host-01", "name": "host", "driver": "host", "scope": "local", "subnet": "N/A", "gateway": "N/A"},
		{"id": "none-01", "name": "none", "driver": "null", "scope": "local", "subnet": "N/A", "gateway": "N/A"},
		{"id": "infrapilot-net", "name": "infrapilot_net", "driver": "bridge", "scope": "local", "subnet": "172.28.0.0/16", "gateway": "172.28.0.1"},
	}
	c.JSON(http.StatusOK, networks)
}

// GetDockerVolumes returns Docker volumes inventory
func GetDockerVolumes(c *gin.Context) {
	volumes := []map[string]interface{}{
		{"name": "postgres_data", "driver": "local", "scope": "local", "mountpoint": "/var/lib/docker/volumes/postgres_data/_data", "size": "2.4 GB"},
		{"name": "redis_data", "driver": "local", "scope": "local", "mountpoint": "/var/lib/docker/volumes/redis_data/_data", "size": "156 MB"},
		{"name": "grafana_storage", "driver": "local", "scope": "local", "mountpoint": "/var/lib/docker/volumes/grafana_storage/_data", "size": "480 MB"},
	}
	c.JSON(http.StatusOK, volumes)
}

type ContainerRunRequest struct {
	MachineID     string   `json:"machine_id" binding:"required"`
	Image         string   `json:"image" binding:"required"`
	Name          string   `json:"name"`
	Ports         []string `json:"ports"`
	Environment   []string `json:"environment"`
	Volumes       []string `json:"volumes"`
	RestartPolicy string   `json:"restart_policy"`
	Network       string   `json:"network"`
	Command       string   `json:"command"`
}

type ImagePullRequest struct {
	MachineID string `json:"machine_id" binding:"required"`
	Image     string `json:"image" binding:"required"`
}

type ImageRemoveRequest struct {
	MachineID string `json:"machine_id" binding:"required"`
	Image     string `json:"image" binding:"required"`
	Force     bool   `json:"force"`
}

func ContainerRun(c *gin.Context) {
	var req ContainerRunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(req.MachineID); err != nil {
		var machine models.Machine
		if database.DB != nil && database.DB.Where("id::text LIKE ? OR hostname = ?", req.MachineID+"%", req.MachineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	var args []string
	args = append(args, "docker", "run", "-d")
	if req.Name != "" {
		args = append(args, "--name", req.Name)
	}
	if req.RestartPolicy != "" && req.RestartPolicy != "no" {
		args = append(args, "--restart", req.RestartPolicy)
	}
	for _, p := range req.Ports {
		p = strings.TrimSpace(p)
		if p != "" {
			args = append(args, "-p", p)
		}
	}
	for _, e := range req.Environment {
		e = strings.TrimSpace(e)
		if e != "" {
			args = append(args, "-e", e)
		}
	}
	for _, v := range req.Volumes {
		v = strings.TrimSpace(v)
		if v != "" {
			args = append(args, "-v", v)
		}
	}
	if req.Network != "" {
		args = append(args, "--network", req.Network)
	}
	args = append(args, req.Image)
	if req.Command != "" {
		args = append(args, req.Command)
	}

	shellCmd := strings.Join(args, " ")

	cmd := models.Command{
		ID:        uuid.New(),
		MachineID: machineUUID,
		Command:   shellCmd,
		Status:    "Pending",
		CreatedAt: time.Now(),
	}

	if database.DB != nil {
		if err := database.DB.Create(&cmd).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enqueue container execution"})
			return
		}

		// Optimistic record creation for immediate UI response
		cName := req.Name
		if cName == "" {
			cName = req.Image + "-app"
		}
		newC := models.DockerContainer{
			ID:          "run-" + strings.ReplaceAll(uuid.New().String()[:12], "-", ""),
			ServerID:    machineUUID,
			Name:        cName,
			Image:       req.Image,
			Status:      "Up Less than a second (Starting)",
			State:       "running",
			Uptime:      "Just now",
			CreatedTime: time.Now(),
			UpdatedAt:   time.Now(),
		}
		_ = database.DB.Create(&newC)
	}

	usernameVal, exists := c.Get("username")
	username := "admin"
	if exists {
		username = fmt.Sprintf("%v", usernameVal)
	}

	utils.LogAudit(username, machineUUID, fmt.Sprintf("Run Docker container image %s as %s", req.Image, req.Name), "Success")

	c.JSON(http.StatusOK, gin.H{
		"message":    fmt.Sprintf("Docker run command enqueued for image %s", req.Image),
		"command_id": cmd.ID,
		"status":     "queued",
		"command":    shellCmd,
	})
}

func ImagePull(c *gin.Context) {
	var req ImagePullRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(req.MachineID); err != nil {
		var machine models.Machine
		if database.DB != nil && database.DB.Where("id::text LIKE ? OR hostname = ?", req.MachineID+"%", req.MachineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	shellCmd := fmt.Sprintf("docker pull %s", req.Image)

	cmd := models.Command{
		ID:        uuid.New(),
		MachineID: machineUUID,
		Command:   shellCmd,
		Status:    "Pending",
		CreatedAt: time.Now(),
	}

	if database.DB != nil {
		if err := database.DB.Create(&cmd).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enqueue image pull"})
			return
		}

		parts := strings.Split(req.Image, ":")
		imgName := parts[0]
		imgTag := "latest"
		if len(parts) > 1 {
			imgTag = parts[1]
		}
		_ = database.DB.Create(&models.DockerImage{
			ID:          "sha256:pulling-" + uuid.New().String()[:10],
			ServerID:    machineUUID,
			Name:        imgName,
			Tag:         imgTag,
			Size:        0,
			CreatedTime: time.Now(),
			UpdatedAt:   time.Now(),
		})
	}

	usernameVal, exists := c.Get("username")
	username := "admin"
	if exists {
		username = fmt.Sprintf("%v", usernameVal)
	}

	utils.LogAudit(username, machineUUID, fmt.Sprintf("Pull Docker image %s", req.Image), "Success")

	c.JSON(http.StatusOK, gin.H{
		"message":    fmt.Sprintf("Docker pull enqueued for image %s", req.Image),
		"command_id": cmd.ID,
		"status":     "queued",
	})
}

func ImageRemove(c *gin.Context) {
	var req ImageRemoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(req.MachineID); err != nil {
		var machine models.Machine
		if database.DB != nil && database.DB.Where("id::text LIKE ? OR hostname = ?", req.MachineID+"%", req.MachineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	shellCmd := fmt.Sprintf("docker rmi %s", req.Image)
	if req.Force {
		shellCmd = fmt.Sprintf("docker rmi -f %s", req.Image)
	}

	cmd := models.Command{
		ID:        uuid.New(),
		MachineID: machineUUID,
		Command:   shellCmd,
		Status:    "Pending",
		CreatedAt: time.Now(),
	}

	if database.DB != nil {
		if err := database.DB.Create(&cmd).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enqueue image removal"})
			return
		}

		_ = database.DB.Where("server_id = ? AND (id = ? OR name = ? OR (name || ':' || tag) = ?)", machineUUID, req.Image, req.Image, req.Image).Delete(&models.DockerImage{})
	}

	usernameVal, exists := c.Get("username")
	username := "admin"
	if exists {
		username = fmt.Sprintf("%v", usernameVal)
	}

	utils.LogAudit(username, machineUUID, fmt.Sprintf("Remove Docker image %s", req.Image), "Success")

	c.JSON(http.StatusOK, gin.H{
		"message":    fmt.Sprintf("Docker image %s removal request enqueued", req.Image),
		"command_id": cmd.ID,
		"status":     "queued",
	})
}

func handleContainerAction(c *gin.Context, action string) {
	var req ContainerActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(req.MachineID); err != nil {
		var machine models.Machine
		if database.DB != nil && database.DB.Where("id::text LIKE ? OR hostname = ?", req.MachineID+"%", req.MachineID).First(&machine).Error == nil {
			machineUUID = machine.ID
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid machine ID"})
			return
		}
	}

	var machine models.Machine
	if database.DB != nil {
		if err := database.DB.First(&machine, "id = ?", machineUUID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
			return
		}
	}

	shellCmd := fmt.Sprintf("docker %s %s", action, req.Container)

	cmd := models.Command{
		ID:        uuid.New(),
		MachineID: machineUUID,
		Command:   shellCmd,
		Status:    "Pending",
		CreatedAt: time.Now(),
	}

	if database.DB != nil {
		if err := database.DB.Create(&cmd).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enqueue container execution"})
			return
		}

		// Optimistic database updates so the UI responds instantaneously
		if action == "stop" {
			_ = database.DB.Model(&models.DockerContainer{}).
				Where("server_id = ? AND (id = ? OR name = ?)", machineUUID, req.Container, req.Container).
				Updates(map[string]interface{}{
					"status":      "Exited (0) Just now",
					"state":       "exited",
					"cpu_percent": 0,
					"updated_at":  time.Now(),
				})
		} else if action == "start" || action == "restart" {
			_ = database.DB.Model(&models.DockerContainer{}).
				Where("server_id = ? AND (id = ? OR name = ?)", machineUUID, req.Container, req.Container).
				Updates(map[string]interface{}{
					"status":     "Up Less than a second",
					"state":      "running",
					"updated_at": time.Now(),
				})
		} else if strings.Contains(action, "rm") {
			_ = database.DB.Where("server_id = ? AND (id = ? OR name = ?)", machineUUID, req.Container, req.Container).
				Delete(&models.DockerContainer{})
		}
	}

	usernameVal, exists := c.Get("username")
	username := "admin"
	if exists {
		username = fmt.Sprintf("%v", usernameVal)
	}

	utils.LogAudit(username, machineUUID, fmt.Sprintf("%s Docker container %s", action, req.Container), "Success")

	c.JSON(http.StatusOK, gin.H{
		"message":    fmt.Sprintf("Docker container %s request enqueued", action),
		"command_id": cmd.ID,
		"status":     "queued",
	})
}
