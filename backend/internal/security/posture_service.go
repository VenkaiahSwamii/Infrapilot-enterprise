package security

import (
	"strings"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NodeSecurityPosture represents the calculated security status of a single node
type NodeSecurityPosture struct {
	NodeID          string    `json:"node_id"`
	Hostname        string    `json:"hostname"`
	IPAddress       string    `json:"ip_address"`
	OS              string    `json:"os"`
	Status          string    `json:"status"` // ONLINE / OFFLINE
	Score           int       `json:"score"`  // 0 - 100
	RiskLevel       string    `json:"risk_level"` // COMPLIANT (>=80), WARNING (50-79), CRITICAL (<50)
	OpenPortsCount  int       `json:"open_ports_count"`
	CriticalPorts   int       `json:"critical_ports_count"`
	ActiveCVECount  int       `json:"active_cve_count"`
	CriticalCVEs    int       `json:"critical_cve_count"`
	FirewallActive  bool      `json:"firewall_active"`
	LastAuditedAt   time.Time `json:"last_audited_at"`
	SecuritySummary string    `json:"security_summary"`
}

// FleetSecurityPosture represents the aggregate posture across all infrastructure nodes
type FleetSecurityPosture struct {
	FleetScore       int                   `json:"fleet_score"`        // 0 - 100
	FleetRiskLevel   string                `json:"fleet_risk_level"`   // COMPLIANT, WARNING, CRITICAL
	TotalNodes       int                   `json:"total_nodes"`
	CompliantNodes   int                   `json:"compliant_nodes"`
	WarningNodes     int                   `json:"warning_nodes"`
	CriticalNodes    int                   `json:"critical_nodes"`
	TotalOpenPorts   int                   `json:"total_open_ports"`
	TotalActiveCVEs  int                   `json:"total_active_cves"`
	TotalCriticalCVE int                   `json:"total_critical_cves"`
	Nodes            []NodeSecurityPosture `json:"nodes"`
	GeneratedAt      time.Time             `json:"generated_at"`
}

type PostureService struct {
	db          *gorm.DB
	portScanner *PortScannerService
	cveScanner  *CVEScannerService
}

func NewPostureService(db *gorm.DB, portScanner *PortScannerService, cveScanner *CVEScannerService) *PostureService {
	return &PostureService{
		db:          db,
		portScanner: portScanner,
		cveScanner:  cveScanner,
	}
}

// CalculateFleetPosture calculates real-time security posture across all live servers
func (s *PostureService) CalculateFleetPosture(orgID uuid.UUID) (*FleetSecurityPosture, error) {
	var servers []models.Server
	if s.db != nil {
		s.db.Order("hostname asc").Find(&servers)
	}

	posture := &FleetSecurityPosture{
		Nodes:       make([]NodeSecurityPosture, 0),
		GeneratedAt: time.Now().UTC(),
	}

	if len(servers) == 0 {
		// Default empty fleet baseline posture
		posture.FleetScore = 100
		posture.FleetRiskLevel = "COMPLIANT"
		return posture, nil
	}

	totalScore := 0

	for _, srv := range servers {
		nodeID := srv.ID.String()
		hostname := srv.Hostname
		if hostname == "" {
			hostname = srv.Name
		}
		if hostname == "" {
			hostname = "node-" + nodeID[:8]
		}

		// 1. Check open ports for node
		var ports []ListeningPort
		if s.portScanner != nil {
			ports = s.portScanner.GetNodePorts(nodeID, srv.OS, srv.IPAddress)
		}
		openPorts := len(ports)
		criticalPorts := 0
		for _, p := range ports {
			if p.RiskLevel == "CRITICAL" || p.RiskLevel == "HIGH" {
				criticalPorts++
			}
		}

		// 2. Check active CVEs for node
		var cves []VulnerabilityItem
		if s.cveScanner != nil {
			cves = s.cveScanner.ScanNodeVulnerabilities(nodeID, srv.OS)
		}
		activeCVEs := len(cves)
		criticalCVEs := 0
		for _, c := range cves {
			if c.Severity == "CRITICAL" {
				criticalCVEs++
			}
		}

		// 3. Compute score (Base 100 with penalties)
		nodeScore := 100

		// Deduct for critical exposed ports
		nodeScore -= (criticalPorts * 15)

		// Deduct for active CVEs
		nodeScore -= (criticalCVEs * 25)
		nodeScore -= ((activeCVEs - criticalCVEs) * 8)

		// Offline penalty
		isOnline := strings.ToUpper(srv.Status) == "ONLINE"
		if !isOnline {
			nodeScore -= 10
		}

		// Clamp between 0 and 100
		if nodeScore < 0 {
			nodeScore = 0
		}
		if nodeScore > 100 {
			nodeScore = 100
		}

		// Risk level classification
		riskLevel := "COMPLIANT"
		summary := "All primary security controls healthy."
		if nodeScore < 50 {
			riskLevel = "CRITICAL"
			summary = "Multiple critical exposures detected. Urgent remediation required."
		} else if nodeScore < 80 {
			riskLevel = "WARNING"
			summary = "Moderate exposure detected. Review open listening sockets & CVE advisories."
		}

		nodePosture := NodeSecurityPosture{
			NodeID:          nodeID,
			Hostname:        hostname,
			IPAddress:       srv.IPAddress,
			OS:              srv.OS,
			Status:          srv.Status,
			Score:           nodeScore,
			RiskLevel:       riskLevel,
			OpenPortsCount:  openPorts,
			CriticalPorts:   criticalPorts,
			ActiveCVECount:  activeCVEs,
			CriticalCVEs:    criticalCVEs,
			FirewallActive:  true,
			LastAuditedAt:   time.Now().UTC(),
			SecuritySummary: summary,
		}

		posture.Nodes = append(posture.Nodes, nodePosture)
		totalScore += nodeScore
		posture.TotalOpenPorts += openPorts
		posture.TotalActiveCVEs += activeCVEs
		posture.TotalCriticalCVE += criticalCVEs

		switch riskLevel {
		case "COMPLIANT":
			posture.CompliantNodes++
		case "WARNING":
			posture.WarningNodes++
		case "CRITICAL":
			posture.CriticalNodes++
		}
	}

	posture.TotalNodes = len(servers)
	if posture.TotalNodes > 0 {
		posture.FleetScore = totalScore / posture.TotalNodes
	}

	if posture.FleetScore >= 80 {
		posture.FleetRiskLevel = "COMPLIANT"
	} else if posture.FleetScore >= 50 {
		posture.FleetRiskLevel = "WARNING"
	} else {
		posture.FleetRiskLevel = "CRITICAL"
	}

	return posture, nil
}
