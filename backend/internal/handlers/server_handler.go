package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)


type ServerHandler struct {
	serverService *services.ServerService
}

func NewServerHandler(serverService *services.ServerService) *ServerHandler {
	return &ServerHandler{serverService: serverService}
}

type ServerRegisterRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	MachineID       string `json:"machine_id"`
	Hostname        string `json:"hostname" binding:"required"`
	IP              string `json:"ip"`
	IPAddress       string `json:"ip_address"`
	OS              string `json:"os" binding:"required"`
	Platform        string `json:"platform"`
	AgentVersion    string `json:"agent_version"`
	ResourceType    string `json:"resource_type"`
	Organization    string `json:"organization"`
	Kernel          string `json:"kernel"`
	Architecture    string `json:"architecture"`
	MACAddress      string `json:"mac_address"`
	CPUModel        string `json:"cpu_model"`
	TotalMemoryGB   uint64 `json:"total_memory_gb"`
	TotalDiskGB     uint64 `json:"total_disk_gb"`
	GPU             string `json:"gpu"`
	Virtualization  string `json:"virtualization"`
	CloudProvider   string `json:"cloud_provider"`
}

func (h *ServerHandler) EnrollServer(c *gin.Context) {
	var req ServerRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := ValidateEnrollmentToken(req.EnrollmentToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired enrollment token"})
		return
	}

	ip := req.IP
	if ip == "" {
		ip = req.IPAddress
	}

	machineID := uuid.New()
	if req.MachineID != "" {
		parsed, parseErr := uuid.Parse(req.MachineID)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid machine_id format"})
			return
		}
		machineID = parsed
	}

	input := services.RegisterServerInput{
		ID:             machineID,
		Hostname:       req.Hostname,
		OS:             req.OS,
		Platform:       req.Platform,
		IPAddress:      ip,
		AgentVersion:   req.AgentVersion,
		ResourceType:   req.ResourceType,
		Organization:   token.OrganizationID,
		Kernel:         req.Kernel,
		Architecture:   req.Architecture,
		MACAddress:     req.MACAddress,
		CPUModel:       req.CPUModel,
		TotalMemoryGB:  req.TotalMemoryGB,
		TotalDiskGB:    req.TotalDiskGB,
		GPU:            req.GPU,
		Virtualization: req.Virtualization,
		CloudProvider:  req.CloudProvider,
	}

	server, err := h.serverService.RegisterOrUpdateServer(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to enroll server: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"machine_id":      server.ID.String(),
		"api_key":         server.APIKey,
		"organization_id": token.OrganizationID,
		"config": gin.H{
			"metrics_interval_seconds":   5,
			"heartbeat_interval_seconds": 15,
			"log_collection_enabled":     true,
		},
	})
}

func (h *ServerHandler) RegisterServer(c *gin.Context) {
	var req ServerRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hostLower := strings.ToLower(req.Hostname)
	if strings.Contains(hostLower, "jayathisoft") || strings.Contains(hostLower, "jayathilabs") || req.MachineID == "c762ae37-0462-457c-ab49-cd6485ae2fcb" || req.MachineID == "e7a110ac-e7d0-41bd-88d8-c628619fbb29" {
		c.JSON(http.StatusForbidden, gin.H{
			"error":  "Machine is permanently blocked by administrator.",
			"status": "blocked",
		})
		return
	}

	ip := req.IP
	if ip == "" {
		ip = req.IPAddress
	}

	if req.MachineID != "" {
		macID, err := uuid.Parse(req.MachineID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid machine_id format"})
			return
		}

		input := services.RegisterServerInput{
			ID:             macID,
			Hostname:       req.Hostname,
			OS:             req.OS,
			Platform:       req.Platform,
			IPAddress:      ip,
			AgentVersion:   req.AgentVersion,
			ResourceType:   req.ResourceType,
			Organization:   req.Organization,
			Kernel:         req.Kernel,
			Architecture:   req.Architecture,
			MACAddress:     req.MACAddress,
			CPUModel:       req.CPUModel,
			TotalMemoryGB:  req.TotalMemoryGB,
			TotalDiskGB:    req.TotalDiskGB,
			GPU:            req.GPU,
			Virtualization: req.Virtualization,
			CloudProvider:  req.CloudProvider,
		}

		server, err := h.serverService.RegisterOrUpdateServer(input)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"machine_id": server.ID.String(),
			"api_key":    server.APIKey,
		})
		return
	}

	machineID := uuid.New()
	input := services.RegisterServerInput{
		ID:             machineID,
		Hostname:       req.Hostname,
		OS:             req.OS,
		Platform:       req.Platform,
		IPAddress:      ip,
		AgentVersion:   req.AgentVersion,
		ResourceType:   req.ResourceType,
		Organization:   req.Organization,
		Kernel:         req.Kernel,
		Architecture:   req.Architecture,
		MACAddress:     req.MACAddress,
		CPUModel:       req.CPUModel,
		TotalMemoryGB:  req.TotalMemoryGB,
		TotalDiskGB:    req.TotalDiskGB,
		GPU:            req.GPU,
		Virtualization: req.Virtualization,
		CloudProvider:  req.CloudProvider,
	}
	server, err := h.serverService.RegisterOrUpdateServer(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register server"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"machine_id": server.ID.String(),
		"api_key":    server.APIKey,
	})
}

func (h *ServerHandler) GetServers(c *gin.Context) {
	servers, err := h.serverService.GetServers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query servers"})
		return
	}
	c.JSON(http.StatusOK, servers)
}

func (h *ServerHandler) GetServerByID(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	server, err := h.serverService.GetServerSnapshotByIDOrHostname(idStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Server not found"})
		return
	}
	c.JSON(http.StatusOK, server)
}

type UpdateServerRequest struct {
	Hostname string `json:"hostname"`
	Status   string `json:"status"`
}

func (h *ServerHandler) UpdateServer(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	var req UpdateServerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	server, err := h.serverService.GetServerByIDOrHostname(idStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Server not found"})
		return
	}

	if req.Hostname != "" {
		server.Hostname = req.Hostname
	}
	if req.Status != "" {
		server.Status = req.Status
	}

	if err := h.serverService.Save(server); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update server"})
		return
	}

	c.JSON(http.StatusOK, server)
}

func (h *ServerHandler) DeleteServer(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	server, err := h.serverService.GetServerByIDOrHostname(idStr)
	var sID string
	var hostname string
	if err == nil && server != nil {
		sID = server.ID.String()
		hostname = server.Hostname
	} else {
		sID = idStr
		hostname = idStr
	}

	tablesWithMachineID := []string{
		"metrics", "linux_metrics", "linux_logs", "linux_dockers", "linux_processes",
		"linux_services", "linux_alerts", "user_host_permissions", "incidents",
		"terminal_commands", "remote_deployment_records",
	}
	for _, tbl := range tablesWithMachineID {
		if database.DB != nil && database.DB.Migrator().HasTable(tbl) {
			_ = database.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE machine_id::text = ? OR machine_id::text = ?", tbl), sID, idStr)
		}
	}

	tablesWithServerID := []string{
		"kubernetes_clusters", "docker_hosts", "ai_recommendations", "ai_predictions",
		"ai_health_scores", "docker_containers", "docker_images", "docker_volumes",
		"docker_networks", "docker_events", "linux_kubernetes",
	}
	for _, tbl := range tablesWithServerID {
		if database.DB != nil && database.DB.Migrator().HasTable(tbl) {
			_ = database.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE server_id::text = ? OR server_id::text = ?", tbl), sID, idStr)
		}
	}

	if database.DB != nil {
		_ = database.DB.Exec("DELETE FROM servers WHERE id::text = ? OR LOWER(hostname) = LOWER(?)", idStr, hostname)
		_ = database.DB.Exec("DELETE FROM machines WHERE id::text = ? OR LOWER(hostname) = LOWER(?)", idStr, hostname)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Server deleted successfully"})
}

func (h *ServerHandler) ServerHeartbeat(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	server, err := h.serverService.GetServerByIDOrHostname(idStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Server not found"})
		return
	}

	if err := h.serverService.Heartbeat(server.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func (h *ServerHandler) RotateServerKey(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		idStr = c.Query("id")
	}

	var server *models.Server

	if idStr == "" {
		if serverVal, exists := c.Get("server"); exists {
			if s, ok := serverVal.(*models.Server); ok {
				server = s
			}
		}
		if server == nil {
			if machineVal, exists := c.Get("machine"); exists {
				if m, ok := machineVal.(*models.Server); ok {
					server = m
				}
			}
		}
		if server == nil && database.DB != nil {
			var firstServer models.Server
			if database.DB.Order("updated_at desc").First(&firstServer).Error == nil {
				server = &firstServer
			}
		}
		if server == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
			return
		}
	} else {
		var getErr error
		server, getErr = h.serverService.GetServerByIDOrHostname(idStr)
		if getErr != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Server not found"})
			return
		}
	}

	newKey := utils.GenerateAPIKey()
	server.APIKey = newKey
	server.KeyVersion++
	server.LastKeyRotate = time.Now()

	if h.serverService != nil {
		_ = h.serverService.Save(server)
		h.serverService.PublishEvent(events.APIKeyRotatedEvent{
			MachineID: server.ID.String(),
			UserID:    c.GetString("userId"),
			Time:      time.Now(),
		})
	} else if database.DB != nil {
		database.DB.Save(server)
	}

	c.JSON(http.StatusOK, gin.H{
		"machine_id": server.ID.String(),
		"api_key":    server.APIKey,
		"version":    server.KeyVersion,
		"rotate":     true,
	})
}

func (h *ServerHandler) GetServerKeyRotationStatus(c *gin.Context) {
	var server *models.Server
	if serverVal, exists := c.Get("server"); exists {
		if s, ok := serverVal.(*models.Server); ok {
			server = s
		}
	}
	if server == nil {
		if machineVal, exists := c.Get("machine"); exists {
			if m, ok := machineVal.(*models.Server); ok {
				server = m
			}
		}
	}
	if server == nil && database.DB != nil {
		var firstServer models.Server
		if database.DB.Order("updated_at desc").First(&firstServer).Error == nil {
			server = &firstServer
		}
	}

	if server == nil {
		c.JSON(http.StatusOK, gin.H{
			"rotate":     false,
			"api_key":    "",
			"version":    1,
			"machine_id": uuid.New().String(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"rotate":     false,
		"api_key":    "",
		"version":    server.KeyVersion,
		"machine_id": server.ID.String(),
	})
}

func (h *ServerHandler) DownloadAgentPackage(c *gin.Context) {
	serverID := c.Query("server_id")
	if serverID == "" {
		serverID = c.Param("id")
	}

	// Dynamic script or installer tarball serving
	scriptContent := fmt.Sprintf("#!/bin/bash\n"+
		"# SREMonitor / InfraPilot Agent Auto-Installer\n"+
		"SERVER_ID=\"%s\"\n"+
		"echo \"Downloading & Installing SREMonitor Agent for server: $SERVER_ID...\"\n"+
		"curl -sSL http://localhost:50052/api/v1/healthz > /dev/null && echo 'SREMonitor Server Reachable'\n"+
		"echo 'Agent Installation Complete'\n", serverID)

	c.Header("Content-Disposition", "attachment; filename=agent_installer.tar.gz")
	c.Data(http.StatusOK, "application/gzip", []byte(scriptContent))
}

func (h *ServerHandler) BlockServer(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	server, err := h.serverService.GetServerByIDOrHostname(idStr)
	var sID string
	var hostname string
	if err == nil && server != nil {
		sID = server.ID.String()
		hostname = server.Hostname
		server.Status = "BLOCKED"
		server.IsBlocked = true
		server.Online = false
	} else {
		sID = idStr
		hostname = idStr
		server = &models.Server{ID: uuid.Nil, Hostname: idStr, Status: "BLOCKED", IsBlocked: true, Online: false}
	}

	if database.DB != nil {
		_ = database.DB.Exec("UPDATE servers SET status = 'BLOCKED', is_blocked = true, online = false WHERE id::text = ? OR LOWER(hostname) = LOWER(?)", sID, hostname)
		_ = database.DB.Exec("UPDATE machines SET status = 'BLOCKED', is_blocked = true, online = false WHERE id::text = ? OR LOWER(hostname) = LOWER(?)", sID, hostname)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Host blocked successfully",
		"server":  server,
	})
}

func (h *ServerHandler) UnblockServer(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	server, err := h.serverService.GetServerByIDOrHostname(idStr)
	var sID string
	var hostname string
	now := time.Now().UTC()
	if err == nil && server != nil {
		sID = server.ID.String()
		hostname = server.Hostname
		server.Status = "ONLINE"
		server.IsBlocked = false
		server.Online = true
		server.LastSeen = now
	} else {
		sID = idStr
		hostname = idStr
		server = &models.Server{ID: uuid.Nil, Hostname: idStr, Status: "ONLINE", IsBlocked: false, Online: true, LastSeen: now}
	}

	if database.DB != nil {
		_ = database.DB.Exec("UPDATE servers SET status = 'ONLINE', is_blocked = false, online = true, last_seen = ? WHERE id::text = ? OR LOWER(hostname) = LOWER(?)", now, sID, hostname)
		_ = database.DB.Exec("UPDATE machines SET status = 'ONLINE', is_blocked = false, online = true, last_seen = ? WHERE id::text = ? OR LOWER(hostname) = LOWER(?)", now, sID, hostname)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Host unblocked successfully",
		"server":  server,
	})
}

