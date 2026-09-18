package handlers

import (
	"encoding/json"
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
	"gorm.io/gorm"
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
	TotalMemoryGB   float64 `json:"total_memory_gb"`
	TotalDiskGB     float64 `json:"total_disk_gb"`
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

	// RBAC Machine-level filtering for assigned users
	userIDStr := c.GetString("userId")
	if userIDStr != "" {
		if uid, err := uuid.Parse(userIDStr); err == nil {
			var u models.User
			if err := database.DB.First(&u, "id = ?", uid).Error; err == nil {
				if u.Role != models.RoleAdmin && u.Role != models.RoleSuperAdmin && u.AllowedMachines != "" && u.AllowedMachines != "all" {
					allowedMap := make(map[string]bool)
					var list []string
					if jsonErr := json.Unmarshal([]byte(u.AllowedMachines), &list); jsonErr == nil {
						for _, item := range list {
							allowedMap[strings.ToLower(item)] = true
						}
					} else {
						for _, part := range strings.Split(u.AllowedMachines, ",") {
							allowedMap[strings.ToLower(strings.TrimSpace(part))] = true
						}
					}

					filtered := make([]models.ServerSnapshot, 0)
					for _, s := range servers {
						if allowedMap[strings.ToLower(s.ID.String())] || allowedMap[strings.ToLower(s.Hostname)] {
							filtered = append(filtered, s)
						}
					}
					c.JSON(http.StatusOK, filtered)
					return
				}
			}
		}
	}

	c.JSON(http.StatusOK, servers)
}

func (h *ServerHandler) GetServerByID(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing server ID"})
		return
	}

	// RBAC Machine-level authorization check
	userIDStr := c.GetString("userId")
	if userIDStr != "" {
		if uid, err := uuid.Parse(userIDStr); err == nil {
			var u models.User
			if err := database.DB.First(&u, "id = ?", uid).Error; err == nil {
				if u.Role != models.RoleAdmin && u.Role != models.RoleSuperAdmin && u.AllowedMachines != "" && u.AllowedMachines != "all" {
					allowedMap := make(map[string]bool)
					var list []string
					if jsonErr := json.Unmarshal([]byte(u.AllowedMachines), &list); jsonErr == nil {
						for _, item := range list {
							allowedMap[strings.ToLower(item)] = true
						}
					} else {
						for _, part := range strings.Split(u.AllowedMachines, ",") {
							allowedMap[strings.ToLower(strings.TrimSpace(part))] = true
						}
					}

					if !allowedMap[strings.ToLower(idStr)] {
						c.JSON(http.StatusForbidden, gin.H{"error": "Access to this machine is restricted by your administrator"})
						return
					}
				}
			}
		}
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
	var sUUID uuid.UUID
	var hostname string
	if err == nil && server != nil {
		sUUID = server.ID
		hostname = server.Hostname
	} else if parsed, parseErr := uuid.Parse(idStr); parseErr == nil {
		sUUID = parsed
		hostname = idStr
	}

	if database.DB != nil {
		txErr := database.DB.Transaction(func(tx *gorm.DB) error {
			if sUUID != uuid.Nil {
				strID := sUUID.String()
				// Child tables referencing machine_id / server_id
				tx.Exec("DELETE FROM linux_metrics WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_dockers WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_kubernetes WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_processes WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_services WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_logs WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_alerts WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_networks WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_storages WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM linux_servers WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM metrics WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM historical_metrics WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM audit_logs WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM user_host_permissions WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM terminal_commands WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM terminal_sessions WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM commands WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM file_operations WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM remediation_jobs WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM workflow_executions WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM incidents WHERE machine_id = ?", sUUID)
				tx.Exec("DELETE FROM remote_deployment_records WHERE machine_id = ?", strID)
				tx.Exec("DELETE FROM aiops_anomalies WHERE machine_id = ?", strID)
				tx.Exec("DELETE FROM aiops_predictions WHERE machine_id = ?", strID)
				tx.Exec("DELETE FROM aiops_recommendations WHERE machine_id = ?", strID)
				tx.Exec("DELETE FROM docker_containers WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM docker_images WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM docker_volumes WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM docker_networks WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM docker_events WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM docker_hosts WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM kubernetes_clusters WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM ai_recommendations WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM ai_predictions WHERE server_id = ?", sUUID)
				tx.Exec("DELETE FROM ai_health_scores WHERE server_id = ?", sUUID)
				// Finally delete the server record itself
				if err := tx.Exec("DELETE FROM servers WHERE id = ?", sUUID).Error; err != nil {
					return err
				}
			}
			if hostname != "" {
				tx.Exec("DELETE FROM servers WHERE LOWER(hostname) = LOWER(?)", hostname)
			}
			return nil
		})
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": txErr.Error()})
			return
		}
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

