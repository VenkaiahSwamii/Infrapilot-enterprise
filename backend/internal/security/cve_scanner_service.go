package security

import (
	"fmt"
	"strings"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// VulnerabilityItem represents a discovered CVE advisory for an installed software package
type VulnerabilityItem struct {
	ID                 string    `json:"id"`
	NodeID             string    `json:"node_id"`
	CVEID              string    `json:"cve_id"`              // e.g. CVE-2024-6387
	PackageName        string    `json:"package_name"`        // e.g. openssh-server
	InstalledVersion   string    `json:"installed_version"`   // e.g. 8.9p1-3ubuntu0.6
	FixedVersion       string    `json:"fixed_version"`       // e.g. 8.9p1-3ubuntu0.10
	Severity           string    `json:"severity"`            // CRITICAL, HIGH, MEDIUM, LOW
	CVSSScore          float64   `json:"cvss_score"`          // 0.0 - 10.0
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	RemediationCommand string    `json:"remediation_command"` // e.g. sudo apt-get install --only-upgrade openssh-server
	DiscoveredAt       time.Time `json:"discovered_at"`
}

type CVEScannerService struct {
	db *gorm.DB
}

func NewCVEScannerService(db *gorm.DB) *CVEScannerService {
	return &CVEScannerService{db: db}
}

// ScanNodeVulnerabilities dynamically audits package versions on a node and matches against CVE advisories.
// If installed package version is >= fixed version, the vulnerability is suppressed and marked CLEAN.
func (s *CVEScannerService) ScanNodeVulnerabilities(nodeID, os string) []VulnerabilityItem {
	now := time.Now().UTC()
	isWindows := strings.Contains(strings.ToLower(os), "windows")

	cves := make([]VulnerabilityItem, 0)
	packageMap := make(map[string]string)

	// 1. Fetch live installed software records for this node from database if available
	if s.db != nil && nodeID != "" {
		if nodeUUID, err := uuid.Parse(nodeID); err == nil {
			var softwareList []models.InstalledSoftware
			if err := s.db.Where("machine_id = ?", nodeUUID).Find(&softwareList).Error; err == nil {
				for _, sw := range softwareList {
					packageMap[strings.ToLower(sw.Name)] = sw.Version
				}
			}
		}
	}

	shortID := nodeID
	if len(shortID) > 4 {
		shortID = shortID[:4]
	}

	if isWindows {
		// Windows Node Dynamic Audit
		officeVer, hasOffice := packageMap["microsoft office"]
		if !hasOffice {
			officeVer, hasOffice = packageMap["microsoft outlook"]
		}

		if hasOffice && IsVulnerable(officeVer, "16.0.0", "16.0.14326.20458") {
			cves = append(cves, VulnerabilityItem{
				ID:                 fmt.Sprintf("vuln-%s-01", shortID),
				NodeID:             nodeID,
				CVEID:              "CVE-2024-21413",
				PackageName:        "Microsoft Outlook / Office MAPI",
				InstalledVersion:   officeVer,
				FixedVersion:       "16.0.14326.20458",
				Severity:           "HIGH",
				CVSSScore:          8.8,
				Title:              "Microsoft Office Moniker Remote Code Execution",
				Description:        "Allows remote attackers to bypass Protected View when parsing malicious hyperlinks.",
				RemediationCommand: "winget upgrade Microsoft.Office --all",
				DiscoveredAt:       now,
			})
		}
	} else {
		// Linux Node Dynamic Audit (Debian/Ubuntu/RHEL/CentOS)

		// 1. OpenSSH Server Check (CVE-2024-6387 regreSSHion)
		sshVer, hasSSH := packageMap["openssh-server"]
		if !hasSSH {
			sshVer, hasSSH = packageMap["openssh"]
		}

		if hasSSH {
			// regreSSHion affects 8.5p1 up to 9.7p1 (fixed in 9.8p1 or Ubuntu 8.9p1-3ubuntu0.10)
			if IsVulnerable(sshVer, "8.5p1", "8.9p1-3ubuntu0.10") && CompareVersions(sshVer, "9.8p1") < 0 {
				cves = append(cves, VulnerabilityItem{
					ID:                 fmt.Sprintf("vuln-%s-01", shortID),
					NodeID:             nodeID,
					CVEID:              "CVE-2024-6387",
					PackageName:        "openssh-server",
					InstalledVersion:   sshVer,
					FixedVersion:       "8.9p1-3ubuntu0.10 (or 9.8p1+)",
					Severity:           "CRITICAL",
					CVSSScore:          9.8,
					Title:              "regreSSHion: Remote Unauthenticated Code Execution in OpenSSH Server",
					Description:        "A signal handler race condition vulnerability in OpenSSH sshd process allows unauthenticated RCE with root privileges.",
					RemediationCommand: "sudo apt-get update && sudo apt-get install --only-upgrade openssh-server",
					DiscoveredAt:       now,
				})
			}
		}

		// 2. curl SOCKS5 Buffer Overflow Check (CVE-2023-38545)
		curlVer, hasCurl := packageMap["curl"]
		if !hasCurl {
			curlVer, hasCurl = packageMap["libcurl4"]
		}

		if hasCurl {
			// SOCKS5 heap overflow affects versions 7.69.0 up to 8.3.0 (fixed in 8.4.0)
			if IsVulnerable(curlVer, "7.69.0", "8.4.0") {
				cves = append(cves, VulnerabilityItem{
					ID:                 fmt.Sprintf("vuln-%s-02", shortID),
					NodeID:             nodeID,
					CVEID:              "CVE-2023-38545",
					PackageName:        "curl / libcurl",
					InstalledVersion:   curlVer,
					FixedVersion:       "8.4.0",
					Severity:           "HIGH",
					CVSSScore:          7.5,
					Title:              "SOCKS5 Heap Buffer Overflow in curl",
					Description:        "This flaw makes curl overflow a heap based buffer in the SOCKS5 proxy handshake.",
					RemediationCommand: "sudo apt-get install --only-upgrade curl libcurl4",
					DiscoveredAt:       now,
				})
			}
		}

		// 3. OpenSSL Punycode Buffer Overflow Check (CVE-2022-3602)
		sslVer, hasSSL := packageMap["openssl"]
		if hasSSL {
			if IsVulnerable(sslVer, "3.0.0", "3.0.7") {
				cves = append(cves, VulnerabilityItem{
					ID:                 fmt.Sprintf("vuln-%s-03", shortID),
					NodeID:             nodeID,
					CVEID:              "CVE-2022-3602",
					PackageName:        "openssl",
					InstalledVersion:   sslVer,
					FixedVersion:       "3.0.7",
					Severity:           "HIGH",
					CVSSScore:          7.5,
					Title:              "OpenSSL Punycode Buffer Overflow in X.509 Certificate Verification",
					Description:        "A 4-byte buffer overflow in X.509 certificate verification may lead to remote code execution or denial of service.",
					RemediationCommand: "sudo apt-get install --only-upgrade openssl libssl3",
					DiscoveredAt:       now,
				})
			}
		}

		// 4. Sudo Baron Samedit Check (CVE-2021-3156)
		sudoVer, hasSudo := packageMap["sudo"]
		if hasSudo {
			if IsVulnerable(sudoVer, "1.8.2", "1.9.5p2") {
				cves = append(cves, VulnerabilityItem{
					ID:                 fmt.Sprintf("vuln-%s-04", shortID),
					NodeID:             nodeID,
					CVEID:              "CVE-2021-3156",
					PackageName:        "sudo",
					InstalledVersion:   sudoVer,
					FixedVersion:       "1.9.5p2",
					Severity:           "HIGH",
					CVSSScore:          7.8,
					Title:              "Baron Samedit: Heap-based Buffer Overflow in Sudo",
					Description:        "Allows local unprivileged users to gain root privileges through argument parsing buffer overflow.",
					RemediationCommand: "sudo apt-get install --only-upgrade sudo",
					DiscoveredAt:       now,
				})
			}
		}
	}

	return cves
}

// GetAllVulnerabilities retrieves all detected CVEs across the entire fleet
func (s *CVEScannerService) GetAllVulnerabilities() ([]VulnerabilityItem, error) {
	var results []VulnerabilityItem
	if s.db == nil {
		return results, nil
	}

	type srvInfo struct {
		ID       string
		OS       string
		Hostname string
	}

	var servers []srvInfo
	s.db.Table("servers").Select("id, os, hostname").Find(&servers)

	for _, srv := range servers {
		nodeVulns := s.ScanNodeVulnerabilities(srv.ID, srv.OS)
		results = append(results, nodeVulns...)
	}

	return results, nil
}
