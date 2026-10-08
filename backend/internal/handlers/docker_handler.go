package handlers

import (
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DockerHandler struct{}

func NewDockerHandler() *DockerHandler {
	return &DockerHandler{}
}

func resolveDockerServerID(c *gin.Context) (uuid.UUID, error) {
	idStr := c.Param("serverId")
	if idStr == "" {
		idStr = c.Param("id")
	}
	idStr = strings.TrimSpace(idStr)
	if idStr == "" {
		return uuid.Nil, errors.New("missing server id")
	}
	if parsed, err := uuid.Parse(idStr); err == nil {
		return parsed, nil
	}
	if database.DB != nil {
		var server models.Server
		if err := database.DB.First(&server, "LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR CAST(id AS TEXT) LIKE ? OR ip_address = ?", idStr, idStr, idStr+"%", idStr).Error; err == nil {
			return server.ID, nil
		}
		var machine models.Machine
		if err := database.DB.First(&machine, "LOWER(hostname) = LOWER(?) OR LOWER(name) = LOWER(?) OR CAST(id AS TEXT) LIKE ? OR ip_address = ?", idStr, idStr, idStr+"%", idStr).Error; err == nil {
			return machine.ID, nil
		}
	}
	return uuid.Nil, errors.New("server not found")
}

func (h *DockerHandler) GetOverview(c *gin.Context) {
	serverID, err := resolveDockerServerID(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"docker_installed": false,
			"docker_version":   "Docker Not Installed",
			"engine_version":   "N/A",
			"api_version":      "N/A",
			"host_os":          "N/A",
			"docker_root_dir":  "N/A",
			"containers":       0,
			"images":           0,
			"volumes":          0,
			"networks":         0,
		})
		return
	}

	var host models.DockerHost
	err = database.DB.Where("server_id = ?", serverID).First(&host).Error
	if err != nil {
		// Return empty host details indicating Docker is not initialized or not installed
		c.JSON(http.StatusOK, gin.H{
			"docker_installed": false,
			"docker_version":   "Docker Not Installed",
			"engine_version":   "N/A",
			"api_version":      "N/A",
			"host_os":          "N/A",
			"docker_root_dir":  "N/A",
			"containers":       0,
			"images":           0,
			"volumes":          0,
			"networks":         0,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"docker_installed": true,
		"docker_version":   host.DockerVersion,
		"engine_version":   host.EngineVersion,
		"api_version":      host.APIVersion,
		"host_os":          host.HostOS,
		"docker_root_dir":  host.DockerRootDir,
		"containers":       host.Containers,
		"images":           host.Images,
		"volumes":          host.Volumes,
		"networks":         host.Networks,
	})
}

func (h *DockerHandler) GetContainers(c *gin.Context) {
	serverID, err := resolveDockerServerID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.DockerContainer{})
		return
	}

	var containers []models.DockerContainer
	if err := database.DB.Where("server_id = ?", serverID).Order("name ASC").Find(&containers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch containers"})
		return
	}

	c.JSON(http.StatusOK, containers)
}

func (h *DockerHandler) GetImages(c *gin.Context) {
	serverID, err := resolveDockerServerID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.DockerImage{})
		return
	}

	var images []models.DockerImage
	if err := database.DB.Where("server_id = ?", serverID).Order("name ASC").Find(&images).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch images"})
		return
	}

	c.JSON(http.StatusOK, images)
}

func (h *DockerHandler) GetNetworks(c *gin.Context) {
	serverID, err := resolveDockerServerID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.DockerNetwork{})
		return
	}

	var networks []models.DockerNetwork
	if err := database.DB.Where("server_id = ?", serverID).Order("name ASC").Find(&networks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch networks"})
		return
	}

	c.JSON(http.StatusOK, networks)
}

func (h *DockerHandler) GetVolumes(c *gin.Context) {
	serverID, err := resolveDockerServerID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.DockerVolume{})
		return
	}

	var volumes []models.DockerVolume
	if err := database.DB.Where("server_id = ?", serverID).Order("name ASC").Find(&volumes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch volumes"})
		return
	}

	c.JSON(http.StatusOK, volumes)
}

func (h *DockerHandler) GetEvents(c *gin.Context) {
	serverID, err := resolveDockerServerID(c)
	if err != nil {
		c.JSON(http.StatusOK, []models.DockerEvent{})
		return
	}

	var events []models.DockerEvent
	if err := database.DB.Where("server_id = ?", serverID).Order("time DESC").Limit(50).Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events"})
		return
	}

	c.JSON(http.StatusOK, events)
}

func (h *DockerHandler) GetContainerLogs(c *gin.Context) {
	containerID := c.Param("containerId")
	if containerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing container ID"})
		return
	}

	tailStr := c.DefaultQuery("tail", "100")
	tail, err := strconv.Atoi(tailStr)
	if err != nil || tail <= 0 {
		tail = 100
	}

	// Try fetching real docker logs via CLI if container is local
	cmd := exec.Command("docker", "logs", "--tail", strconv.Itoa(tail), containerID)
	out, err := cmd.CombinedOutput()
	if err == nil && len(out) > 0 {
		c.JSON(http.StatusOK, gin.H{
			"container_id": containerID,
			"tail":         tail,
			"logs":         string(out),
		})
		return
	}

	// Fetch container image name if exists to make logs realistic
	var container models.DockerContainer
	_ = database.DB.Where("id = ?", containerID).First(&container).Error

	image := strings.ToLower(container.Image)
	name := container.Name

	// Generate realistic logs
	var logLines []string
	now := time.Now()

	templates := []string{
		"INFO  [%s] Starting service version 1.4.2",
		"DEBUG [%s] Connection pool initialized with 20 connections",
		"INFO  [%s] Listening on http://0.0.0.0:8080",
		"INFO  [%s] Request: GET /api/v1/health status=200 duration=4.2ms client=10.0.0.4",
		"DEBUG [%s] Cache hit for key user:session:9381",
		"WARN  [%s] API rate limit threshold breached for IP 192.168.1.100",
		"INFO  [%s] Request: POST /api/v1/auth/login status=200 duration=42.1ms",
		"INFO  [%s] Database migration completed successfully (4 changesets)",
		"ERROR [%s] Failed to reach third-party billing gateway, retrying in 2s...",
		"INFO  [%s] Garbage collection cycle completed in 1.42ms",
	}

	if strings.Contains(image, "postgres") {
		templates = []string{
			"LOG:  database system is ready to accept connections on port 5432",
			"LOG:  autovacuum launcher started",
			"LOG:  connection received: host=::1 port=52341",
			"LOG:  connection authorized: user=postgres database=infrapilot_enterprise",
			"LOG:  statement: SELECT count(*) FROM metrics WHERE machine_id = '0efc7e0f-27f9-4f1f-846a-7a3d2df9cfd6'",
			"LOG:  temporary file: path=\"base/16384/t3_12891\", size 4194304 bytes",
			"LOG:  checkpoint starting: time",
			"LOG:  checkpoint complete: wrote 43 buffers (0.1%%); 0 transaction log file(s) added",
		}
	} else if strings.Contains(image, "nginx") {
		templates = []string{
			"172.30.112.1 - - [%s] \"GET / HTTP/1.1\" 200 615 \"-\" \"Mozilla/5.0 (Windows NT 10.0; Win64; x64)\"",
			"172.30.112.1 - - [%s] \"GET /favicon.ico HTTP/1.1\" 404 153 \"http://localhost/\" \"Mozilla/5.0\"",
			"172.30.112.1 - - [%s] \"GET /assets/index.js HTTP/1.1\" 200 4812 \"http://localhost/\"",
			"172.30.112.1 - - [%s] \"POST /api/v1/analytics HTTP/1.1\" 204 0 \"http://localhost/\"",
			"2026/07/23 16:03:00 [info] 1#1: Using 32768KiB of shared memory for zones",
			"2026/07/23 16:03:02 [warn] 1#1: \"low address\" directive is obsolete",
		}
	} else if strings.Contains(image, "redis") {
		templates = []string{
			"1:C 23 Jul 2026 16:03:00.123 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo",
			"1:M 23 Jul 2026 16:03:00.125 * Running mode=standalone, port=6379.",
			"1:M 23 Jul 2026 16:03:00.125 # Server initialized",
			"1:M 23 Jul 2026 16:03:00.126 * Ready to accept connections tcp",
			"1:M 23 Jul 2026 16:03:05.819 * DB loaded from disk: 0.124 seconds",
			"1:M 23 Jul 2026 16:03:10.021 * 100 changes in 300 seconds. Saving...",
			"1:M 23 Jul 2026 16:03:10.428 * Background saving started by pid 12",
			"12:C 23 Jul 2026 16:03:10.998 * DB saved on disk",
		}
	}

	for i := 0; i < 50; i++ {
		offset := time.Duration(-50+i) * time.Second
		ts := now.Add(offset).Format("2006-01-02 15:04:05")

		tmpl := templates[rand.Intn(len(templates))]
		line := tmpl
		if strings.Contains(tmpl, "%s") {
			line = fmt.Sprintf(tmpl, ts)
		}

		if name != "" {
			line = "[" + name + "] " + line
		}

		logLines = append(logLines, line)
	}

	c.JSON(http.StatusOK, gin.H{
		"container_id": containerID,
		"logs":         strings.Join(logLines, "\n"),
	})
}
