package handlers

import (
	"net/http"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/security"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SecuritySuiteHandler struct {
	postureService *security.PostureService
	portScanner    *security.PortScannerService
	cveScanner     *security.CVEScannerService
}

func NewSecuritySuiteHandler() *SecuritySuiteHandler {
	portScanner := security.NewPortScannerService(database.DB)
	cveScanner := security.NewCVEScannerService(database.DB)
	postureService := security.NewPostureService(database.DB, portScanner, cveScanner)

	return &SecuritySuiteHandler{
		postureService: postureService,
		portScanner:    portScanner,
		cveScanner:     cveScanner,
	}
}

// GetFleetPosture returns calculated Fleet Security Score & Node Risk Matrix
func (h *SecuritySuiteHandler) GetFleetPosture(c *gin.Context) {
	var orgID uuid.UUID
	orgIDStr := c.Query("organization_id")
	if orgIDStr != "" {
		if parsed, err := uuid.Parse(orgIDStr); err == nil {
			orgID = parsed
		}
	}

	posture, err := h.postureService.CalculateFleetPosture(orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to calculate fleet posture", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, posture)
}

// GetListeningPorts returns active listening sockets radar
func (h *SecuritySuiteHandler) GetListeningPorts(c *gin.Context) {
	nodeID := c.Query("node_id")
	if nodeID != "" {
		os := c.DefaultQuery("os", "linux")
		ip := c.DefaultQuery("ip_address", "127.0.0.1")
		ports := h.portScanner.GetNodePorts(nodeID, os, ip)
		c.JSON(http.StatusOK, gin.H{"ports": ports, "count": len(ports), "node_id": nodeID})
		return
	}

	ports, err := h.portScanner.GetAllListeningPorts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan listening ports", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ports": ports, "count": len(ports)})
}

// GetVulnerabilities returns CVE vulnerability items & remediation guidance
func (h *SecuritySuiteHandler) GetVulnerabilities(c *gin.Context) {
	nodeID := c.Query("node_id")
	if nodeID != "" {
		os := c.DefaultQuery("os", "linux")
		cves := h.cveScanner.ScanNodeVulnerabilities(nodeID, os)
		c.JSON(http.StatusOK, gin.H{"vulnerabilities": cves, "count": len(cves), "node_id": nodeID})
		return
	}

	cves, err := h.cveScanner.GetAllVulnerabilities()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve vulnerabilities", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"vulnerabilities": cves, "count": len(cves)})
}
