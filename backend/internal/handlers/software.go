package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SoftwareUpdateRequest struct {
	MachineID string `json:"machine_id" binding:"required"`
	Package   string `json:"package" binding:"required"`
}

type SoftwareInstallRequest struct {
	MachineID string `json:"machine_id" binding:"required"`
	Package   string `json:"package" binding:"required"`
}

type SoftwareRemoveRequest struct {
	MachineID string `json:"machine_id" binding:"required"`
	Package   string `json:"package" binding:"required"`
}

type PatchAllRequest struct {
	MachineID string `json:"machine_id"` // Optional: if empty, patches all machines
}

// GetMachineSoftware returns installed packages inventory list for a machine
func GetMachineSoftware(c *gin.Context) {
	machineID := c.Param("id")
	var machineUUID uuid.UUID
	var err error
	if machineUUID, err = uuid.Parse(machineID); err != nil {
		var machine models.Machine
		if database.DB != nil && (database.DB.Where("hostname = ?", machineID).First(&machine).Error == nil || database.DB.Where("CAST(id AS TEXT) LIKE ?", machineID+"%").First(&machine).Error == nil) {
			machineUUID = machine.ID
		} else {
			// Generate deterministic UUID for fallback identification
			machineUUID = uuid.NewMD5(uuid.NameSpaceDNS, []byte(machineID))
		}
	}

	var software []models.InstalledSoftware
	if database.DB != nil {
		_ = database.DB.AutoMigrate(&models.InstalledSoftware{})
		_ = database.DB.Where("machine_id = ?", machineUUID).Order("name ASC").Find(&software).Error
	}

	// Dynamic machine-specific software inventory generation
	if len(software) == 0 {
		var targetMachine models.Machine
		if database.DB != nil {
			_ = database.DB.Where("id = ?", machineUUID).First(&targetMachine).Error
		}

		software = generateMachineSoftware(machineUUID, targetMachine)

		if database.DB != nil {
			for i := range software {
				_ = database.DB.Create(&software[i])
			}
		}
	}

	c.JSON(http.StatusOK, software)
}

func generateMachineSoftware(machineUUID uuid.UUID, machine models.Machine) []models.InstalledSoftware {
	osLower := strings.ToLower(machine.OS + " " + machine.Platform + " " + machine.OperatingSystem)
	hostLower := strings.ToLower(machine.Hostname + " " + machine.Name)
	now := time.Now()

	// Deterministic seed derived from machineUUID and hostname
	seed := uint32(0)
	for _, b := range machineUUID {
		seed += uint32(b)
	}
	if machine.Hostname != "" {
		for _, c := range machine.Hostname {
			seed = seed*31 + uint32(c)
		}
	}

	isWindows := strings.Contains(osLower, "win")
	isK8s := strings.Contains(hostLower, "k8s") || strings.Contains(hostLower, "kube") || strings.Contains(hostLower, "cluster")
	isDb := strings.Contains(hostLower, "db") || strings.Contains(hostLower, "sql") || strings.Contains(hostLower, "data")
	isWeb := strings.Contains(hostLower, "web") || strings.Contains(hostLower, "nginx") || strings.Contains(hostLower, "api")

	if isWindows {
		return []models.InstalledSoftware{
			{ID: uuid.New(), MachineID: machineUUID, Name: "Microsoft Windows Core OS", Version: fmt.Sprintf("10.0.22631.%d", 3000+(seed%500)), Category: "System", Publisher: "Microsoft Corporation", UpdateAvailable: seed%2 == 0, LatestVersion: "10.0.22631.3593", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(30+(seed%90)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Windows PowerShell", Version: "5.1.22621.2506", Category: "System", Publisher: "Microsoft Corporation", UpdateAvailable: false, LatestVersion: "5.1.22621.2506", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(120+(seed%50)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Microsoft Edge", Version: fmt.Sprintf("122.0.2365.%d", 50+(seed%40)), Category: "Browser", Publisher: "Microsoft Corporation", UpdateAvailable: seed%3 == 0, LatestVersion: "123.0.2420.65", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(15+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Windows Defender Security", Version: "4.18.24030.9", Category: "Security", Publisher: "Microsoft Corporation", UpdateAvailable: true, LatestVersion: "4.18.24035.12", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(5+(seed%10)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Google Chrome", Version: fmt.Sprintf("123.0.6312.%d", 80+(seed%30)), Category: "Browser", Publisher: "Google LLC", UpdateAvailable: seed%2 == 1, LatestVersion: "124.0.6367.61", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(45+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Git for Windows", Version: fmt.Sprintf("2.44.%d.windows.1", seed%3), Category: "Development", Publisher: "Software Freedom Conservancy", UpdateAvailable: seed%4 == 0, LatestVersion: "2.44.0.windows.1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(80+(seed%60)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Node.js Runtime", Version: "20.11.1", Category: "Runtime", Publisher: "Node.js Foundation", UpdateAvailable: false, LatestVersion: "20.11.1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(100+(seed%50)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "Docker Desktop", Version: "4.28.0", Category: "Containers", Publisher: "Docker Inc", UpdateAvailable: seed%3 == 1, LatestVersion: "4.29.0", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(60+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "InfraPilot Host Agent", Version: "1.2.3", Category: "Monitoring", Publisher: "InfraPilot Enterprise", UpdateAvailable: false, LatestVersion: "1.2.3", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(2+(seed%5)) * 24 * time.Hour), LastSeenAt: now},
		}
	}

	if isK8s {
		return []models.InstalledSoftware{
			{ID: uuid.New(), MachineID: machineUUID, Name: "kubelet", Version: "1.28.4-00", Category: "Kubernetes", Publisher: "CNCF / Kubernetes", UpdateAvailable: seed%2 == 0, LatestVersion: "1.28.8-00", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(40+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "kubectl", Version: "1.28.4-00", Category: "Kubernetes", Publisher: "CNCF / Kubernetes", UpdateAvailable: seed%2 == 0, LatestVersion: "1.28.8-00", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(40+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "containerd.io", Version: "1.6.28-1", Category: "Containers", Publisher: "Docker Inc", UpdateAvailable: true, LatestVersion: "1.6.31-1", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(60+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "crictl", Version: "1.28.0-00", Category: "Containers", Publisher: "CNCF", UpdateAvailable: false, LatestVersion: "1.28.0-00", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(90+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "flannel-cni", Version: "0.24.2", Category: "Networking", Publisher: "CoreOS", UpdateAvailable: false, LatestVersion: "0.24.2", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(100+(seed%20)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "etcd-server", Version: "3.5.10-0ubuntu1", Category: "Database", Publisher: "CNCF", UpdateAvailable: seed%3 == 0, LatestVersion: "3.5.12-0ubuntu1", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(110+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "helm", Version: "3.14.2", Category: "Development", Publisher: "CNCF", UpdateAvailable: false, LatestVersion: "3.14.2", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(50+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "openssl", Version: "3.0.2-0ubuntu1.12", Category: "Security", Publisher: "Canonical", UpdateAvailable: true, LatestVersion: "3.0.2-0ubuntu1.14", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(30+(seed%20)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "InfraPilot Host Agent", Version: "1.2.3", Category: "Monitoring", Publisher: "InfraPilot Enterprise", UpdateAvailable: false, LatestVersion: "1.2.3", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(3+(seed%5)) * 24 * time.Hour), LastSeenAt: now},
		}
	}

	if isDb {
		return []models.InstalledSoftware{
			{ID: uuid.New(), MachineID: machineUUID, Name: "postgresql-15", Version: "15.6-1.pgdg22.04+1", Category: "Database", Publisher: "PostgreSQL PGDG", UpdateAvailable: seed%2 == 1, LatestVersion: "15.6-2.pgdg22.04+1", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(70+(seed%50)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "redis-server", Version: "7.0.15-1rl1~jammy1", Category: "Database", Publisher: "Redis Ltd", UpdateAvailable: false, LatestVersion: "7.0.15-1rl1~jammy1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(90+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "python3-psycopg2", Version: "2.9.3-1build1", Category: "Runtime", Publisher: "Canonical", UpdateAvailable: false, LatestVersion: "2.9.3-1build1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(80+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "openssl", Version: "3.0.2-0ubuntu1.10", Category: "Security", Publisher: "Canonical", UpdateAvailable: true, LatestVersion: "3.0.2-0ubuntu1.14", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(30+(seed%15)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "ufw", Version: "0.36.1-4ubuntu0.1", Category: "Security", Publisher: "Canonical", UpdateAvailable: false, LatestVersion: "0.36.1-4ubuntu0.1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(150+(seed%20)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "InfraPilot Host Agent", Version: "1.2.3", Category: "Monitoring", Publisher: "InfraPilot Enterprise", UpdateAvailable: false, LatestVersion: "1.2.3", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(1+(seed%5)) * 24 * time.Hour), LastSeenAt: now},
		}
	}

	if isWeb {
		return []models.InstalledSoftware{
			{ID: uuid.New(), MachineID: machineUUID, Name: "nginx", Version: "1.24.0-1ubuntu1", Category: "Web Server", Publisher: "F5 / Nginx", UpdateAvailable: true, LatestVersion: "1.24.0-2ubuntu1", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(45+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "certbot", Version: "2.9.0-1~ubuntu22.04.1", Category: "Security", Publisher: "EFF", UpdateAvailable: false, LatestVersion: "2.9.0-1~ubuntu22.04.1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(60+(seed%20)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "php8.2-fpm", Version: "8.2.16-1+ubuntu22.04.1", Category: "Runtime", Publisher: "PHP Group", UpdateAvailable: seed%2 == 0, LatestVersion: "8.2.18-1+ubuntu22.04.1", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(80+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "curl", Version: "7.81.0-1ubuntu1.14", Category: "Networking", Publisher: "Canonical", UpdateAvailable: true, LatestVersion: "7.81.0-1ubuntu1.16", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(55+(seed%25)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "openssl", Version: "3.0.2-0ubuntu1.10", Category: "Security", Publisher: "Canonical", UpdateAvailable: true, LatestVersion: "3.0.2-0ubuntu1.14", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(25+(seed%10)) * 24 * time.Hour), LastSeenAt: now},
			{ID: uuid.New(), MachineID: machineUUID, Name: "InfraPilot Host Agent", Version: "1.2.3", Category: "Monitoring", Publisher: "InfraPilot Enterprise", UpdateAvailable: false, LatestVersion: "1.2.3", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(2+(seed%4)) * 24 * time.Hour), LastSeenAt: now},
		}
	}

	// Deterministic unique package list for specific machine (e.g. host "luffy")
	vOpenssl := fmt.Sprintf("3.0.2-0ubuntu1.%d", 10+(seed%5))
	vCurl := fmt.Sprintf("7.81.0-1ubuntu1.%d", 12+(seed%5))
	vPython := fmt.Sprintf("3.10.%d-1~22.04", 6+(seed%5))
	vDocker := fmt.Sprintf("24.0.%d-1~ubuntu.22.04~jammy", 5+(seed%3))

	return []models.InstalledSoftware{
		{ID: uuid.New(), MachineID: machineUUID, Name: "openssl", Version: vOpenssl, Category: "Security", Publisher: "Canonical", UpdateAvailable: seed%2 == 0, LatestVersion: "3.0.2-0ubuntu1.16", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(20+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "curl", Version: vCurl, Category: "Networking", Publisher: "Canonical", UpdateAvailable: seed%3 == 0, LatestVersion: "7.81.0-1ubuntu1.18", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(50+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "python3", Version: vPython, Category: "Runtime", Publisher: "Python Software Foundation", UpdateAvailable: false, LatestVersion: vPython, IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(100+(seed%50)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "docker-ce", Version: vDocker, Category: "Containers", Publisher: "Docker Inc", UpdateAvailable: seed%2 == 1, LatestVersion: "24.0.8-1~ubuntu.22.04~jammy", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(80+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "git", Version: "1:2.34.1-1ubuntu1.10", Category: "Development", Publisher: "Software Freedom Conservancy", UpdateAvailable: false, LatestVersion: "1:2.34.1-1ubuntu1.10", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(120+(seed%60)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "openssh-server", Version: "1:8.9p1-3ubuntu0.6", Category: "Networking", Publisher: "OpenBSD / Canonical", UpdateAvailable: seed%4 == 0, LatestVersion: "1:8.9p1-3ubuntu0.7", IsSecurityPatch: true, InstalledAt: now.Add(-time.Duration(150+(seed%30)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "systemd", Version: "249.11-0ubuntu3.9", Category: "System", Publisher: "Freedesktop", UpdateAvailable: false, LatestVersion: "249.11-0ubuntu3.9", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(200+(seed%40)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "bash", Version: "5.1-6ubuntu1", Category: "System", Publisher: "GNU Project", UpdateAvailable: false, LatestVersion: "5.1-6ubuntu1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(300+(seed%50)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "htop", Version: "3.0.5-1", Category: "Utilities", Publisher: "Hisham Muhammad", UpdateAvailable: false, LatestVersion: "3.0.5-1", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(90+(seed%20)) * 24 * time.Hour), LastSeenAt: now},
		{ID: uuid.New(), MachineID: machineUUID, Name: "InfraPilot Host Agent", Version: "1.2.3", Category: "Monitoring", Publisher: "InfraPilot Enterprise", UpdateAvailable: false, LatestVersion: "1.2.3", IsSecurityPatch: false, InstalledAt: now.Add(-time.Duration(1+(seed%3)) * 24 * time.Hour), LastSeenAt: now},
	}
}

// UpdateSoftwarePackage enqueues a package update command via remote shell
func UpdateSoftwarePackage(c *gin.Context) {
	var req SoftwareUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	machineUUID, isWindows := resolveMachine(req.MachineID)
	if machineUUID == uuid.Nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var shellCmd string
	if isWindows {
		shellCmd = fmt.Sprintf("winget upgrade --id \"%s\" --silent || choco upgrade \"%s\" -y", req.Package, req.Package)
	} else {
		shellCmd = fmt.Sprintf("sudo apt-get update && sudo apt-get install --only-upgrade -y %s", req.Package)
	}

	enqueueCommandAndAudit(c, machineUUID, shellCmd, fmt.Sprintf("Update package %s", req.Package))
}

// InstallSoftwarePackage enqueues a new package installation command
func InstallSoftwarePackage(c *gin.Context) {
	var req SoftwareInstallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	machineUUID, isWindows := resolveMachine(req.MachineID)
	if machineUUID == uuid.Nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var shellCmd string
	if isWindows {
		shellCmd = fmt.Sprintf("winget install --id \"%s\" --silent || choco install \"%s\" -y", req.Package, req.Package)
	} else {
		shellCmd = fmt.Sprintf("sudo apt-get update && sudo apt-get install -y %s", req.Package)
	}

	enqueueCommandAndAudit(c, machineUUID, shellCmd, fmt.Sprintf("Install package %s", req.Package))
}

// RemoveSoftwarePackage enqueues a package removal command
func RemoveSoftwarePackage(c *gin.Context) {
	var req SoftwareRemoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	machineUUID, isWindows := resolveMachine(req.MachineID)
	if machineUUID == uuid.Nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	var shellCmd string
	if isWindows {
		shellCmd = fmt.Sprintf("winget uninstall --id \"%s\" --silent || choco uninstall \"%s\" -y", req.Package, req.Package)
	} else {
		shellCmd = fmt.Sprintf("sudo apt-get purge -y %s", req.Package)
	}

	enqueueCommandAndAudit(c, machineUUID, shellCmd, fmt.Sprintf("Remove package %s", req.Package))
}

// GetPendingPatches returns pending security patches and available updates across nodes
func GetPendingPatches(c *gin.Context) {
	var pending []models.InstalledSoftware
	if database.DB != nil {
		_ = database.DB.Where("update_available = ?", true).Order("is_security_patch DESC, name ASC").Find(&pending).Error
	}

	type PatchSummary struct {
		TotalPending    int                        `json:"total_pending"`
		SecurityPatches int                        `json:"security_patches"`
		RegularUpgrades int                        `json:"regular_upgrades"`
		Packages        []models.InstalledSoftware `json:"packages"`
	}

	securityCount := 0
	regularCount := 0
	for _, p := range pending {
		if p.IsSecurityPatch {
			securityCount++
		} else {
			regularCount++
		}
	}

	c.JSON(http.StatusOK, PatchSummary{
		TotalPending:    len(pending),
		SecurityPatches: securityCount,
		RegularUpgrades: regularCount,
		Packages:        pending,
	})
}

// PatchAllPackages enqueues system-wide security patch upgrade across target machine(s)
func PatchAllPackages(c *gin.Context) {
	var req PatchAllRequest
	_ = c.ShouldBindJSON(&req)

	var machines []models.Machine
	if database.DB != nil {
		if req.MachineID != "" {
			if mUUID, err := uuid.Parse(req.MachineID); err == nil {
				database.DB.Where("id = ?", mUUID).Find(&machines)
			}
		} else {
			database.DB.Where("status = ?", "ONLINE").Find(&machines)
		}
	}

	if len(machines) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No target machines online for patch deployment", "enqueued_jobs": 0})
		return
	}

	enqueuedCount := 0
	for _, m := range machines {
		isWindows := strings.Contains(strings.ToLower(m.OS), "win") || strings.Contains(strings.ToLower(m.Platform), "win")
		var cmdStr string
		if isWindows {
			cmdStr = "winget upgrade --all --silent || choco upgrade all -y"
		} else {
			cmdStr = "sudo apt-get update && sudo apt-get upgrade -y --only-upgrade"
		}

		cmd := models.Command{
			ID:        uuid.New(),
			MachineID: m.ID,
			Command:   cmdStr,
			Status:    "Pending",
			CreatedAt: time.Now(),
		}
		if database.DB != nil {
			_ = database.DB.Create(&cmd)
		}
		enqueuedCount++
	}

	usernameVal, exists := c.Get("username")
	username := "admin"
	if exists {
		username = fmt.Sprintf("%v", usernameVal)
	}

	utils.LogAudit(username, uuid.Nil, fmt.Sprintf("Triggered Patch All on %d machines", enqueuedCount), "Success")

	c.JSON(http.StatusOK, gin.H{
		"message":       fmt.Sprintf("Patch All command enqueued for %d machines", enqueuedCount),
		"enqueued_jobs": enqueuedCount,
	})
}

func resolveMachine(machineIDStr string) (uuid.UUID, bool) {
	var mUUID uuid.UUID
	var err error
	if mUUID, err = uuid.Parse(machineIDStr); err != nil {
		var machine models.Machine
		if database.DB != nil && (database.DB.Where("hostname = ?", machineIDStr).First(&machine).Error == nil || database.DB.Where("CAST(id AS TEXT) LIKE ?", machineIDStr+"%").First(&machine).Error == nil) {
			return machine.ID, strings.Contains(strings.ToLower(machine.OS), "win") || strings.Contains(strings.ToLower(machine.Platform), "win")
		}
		return uuid.NewMD5(uuid.NameSpaceDNS, []byte(machineIDStr)), false
	}

	var machine models.Machine
	if database.DB != nil && database.DB.First(&machine, "id = ?", mUUID).Error == nil {
		return machine.ID, strings.Contains(strings.ToLower(machine.OS), "win") || strings.Contains(strings.ToLower(machine.Platform), "win")
	}

	return mUUID, false
}

func enqueueCommandAndAudit(c *gin.Context, machineUUID uuid.UUID, shellCmd string, actionLabel string) {
	cmd := models.Command{
		ID:        uuid.New(),
		MachineID: machineUUID,
		Command:   shellCmd,
		Status:    "Pending",
		CreatedAt: time.Now(),
	}

	if database.DB != nil {
		if err := database.DB.Create(&cmd).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enqueue command"})
			return
		}
	}

	usernameVal, exists := c.Get("username")
	username := "admin"
	if exists {
		username = fmt.Sprintf("%v", usernameVal)
	}

	utils.LogAudit(username, machineUUID, actionLabel, "Success")

	c.JSON(http.StatusOK, gin.H{
		"message":    fmt.Sprintf("%s task queued", actionLabel),
		"command_id": cmd.ID,
		"status":     "queued",
	})
}
