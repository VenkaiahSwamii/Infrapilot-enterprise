package services

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/utils"
	"infrapilot/backend/internal/websocket"

	"github.com/google/uuid"
)

type DiskCleanupRequest struct {
	MachineID  string `json:"machine_id"`
	MountPoint string `json:"mount_point"`
	DryRun     bool   `json:"dry_run"`
}

type DiskCleanupResult struct {
	Success      bool    `json:"success"`
	FilesScanned int     `json:"files_scanned"`
	FilesDeleted int     `json:"files_deleted"`
	BytesFreed   int64   `json:"bytes_freed"`
	FreedGB      float64 `json:"freed_gb"`
	PreUsedGB    float64 `json:"pre_used_gb"`
	PostUsedGB   float64 `json:"post_used_gb"`
	PreFreeGB    float64 `json:"pre_free_gb"`
	PostFreeGB   float64 `json:"post_free_gb"`
	TotalGB      float64 `json:"total_gb"`
	PreUsagePct  float64 `json:"pre_usage_pct"`
	PostUsagePct float64 `json:"post_usage_pct"`
	MountPoint   string  `json:"mount_point"`
	DryRun       bool    `json:"dry_run"`
	Status       string  `json:"status"`
	Message      string  `json:"message"`
	Timestamp    string  `json:"timestamp"`
}

var defaultDenyList = []string{
	"db", "mysql", "postgres", "data", ".git", ".env", "node_modules", "config", "certs", "server.key", "agent.key",
}

func roundFloat(val float64, precision int) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(val*ratio) / ratio
}

// ExecuteRealDiskCleanup runs safe cache/temp cleanup on system drives
func ExecuteRealDiskCleanup(mID uuid.UUID, targetMount string, dryRun bool) (*DiskCleanupResult, error) {
	return ExecuteRealDiskCleanupWithDirs(mID, targetMount, dryRun, nil)
}

// ExecuteRealDiskCleanupWithDirs allows specifying custom directory targets (useful for testing)
func ExecuteRealDiskCleanupWithDirs(mID uuid.UUID, targetMount string, dryRun bool, customDirs []string) (*DiskCleanupResult, error) {
	now := time.Now()
	cleanMount := targetMount
	if cleanMount == "" || cleanMount == "auto" {
		if runtime.GOOS == "windows" {
			cleanMount = "C:"
		} else {
			cleanMount = "/"
		}
	}

	preTotal, preFree, preUsed, prePct, _ := GetSystemDiskUsage(cleanMount)

	// Determine cache directories to clean
	targetDirs := customDirs
	if len(targetDirs) == 0 {
		if runtime.GOOS == "windows" {
			tempDir := os.TempDir()
			if tempDir != "" {
				targetDirs = append(targetDirs, tempDir)
			}
			if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
				targetDirs = append(targetDirs, filepath.Join(localAppData, "Temp"))
				targetDirs = append(targetDirs, filepath.Join(localAppData, "CrashDumps"))
				targetDirs = append(targetDirs, filepath.Join(localAppData, "Microsoft", "Windows", "INetCache"))
				targetDirs = append(targetDirs, filepath.Join(localAppData, "go-build"))
				targetDirs = append(targetDirs, filepath.Join(localAppData, "npm-cache"))
				targetDirs = append(targetDirs, filepath.Join(localAppData, "pip", "cache"))
			}
			if winDir := os.Getenv("SystemRoot"); winDir != "" {
				targetDirs = append(targetDirs, filepath.Join(winDir, "Temp"))
				targetDirs = append(targetDirs, filepath.Join(winDir, "SoftwareDistribution", "Download"))
			}
		} else {
			targetDirs = []string{"/tmp", "/var/tmp", "/var/cache"}
			if home := os.Getenv("HOME"); home != "" {
				targetDirs = append(targetDirs, filepath.Join(home, ".cache"))
			}
		}
	}

	scannedCount := 0
	deletedCount := 0

	for _, dir := range targetDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			scannedCount++
			name := entry.Name()
			nameLower := strings.ToLower(name)
			fullPath := filepath.Join(dir, name)

			// DenyList protection check
			isDenied := false
			for _, deny := range defaultDenyList {
				if strings.Contains(nameLower, strings.ToLower(deny)) {
					isDenied = true
					break
				}
			}
			if isDenied {
				continue
			}

			if dryRun {
				continue
			}

			// Attempt safe removal
			err := os.RemoveAll(fullPath)
			if err == nil {
				deletedCount++
			}
		}
	}

	// Also safely empty Windows Recycle Bin & Temp caches if on Windows, not dry-run and not testing customDirs
	if runtime.GOOS == "windows" && !dryRun && len(customDirs) == 0 {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Get-ChildItem -Path $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue")
		_ = cmd.Run()
		cancel()
	}

	// Measure real post-cleanup usage directly from OS
	postTotal, postFree, postUsed, postPct, _ := GetSystemDiskUsage(cleanMount)

	var bytesFreed int64 = 0
	if postFree > preFree {
		bytesFreed = int64(postFree - preFree)
	}

	if postTotal == 0 {
		postTotal = preTotal
		postFree = preFree
		postUsed = preUsed
		postPct = prePct
	}

	freedGB := float64(bytesFreed) / (1024 * 1024 * 1024)

	preUsedGB := float64(preUsed) / (1024 * 1024 * 1024)
	postUsedGB := float64(postUsed) / (1024 * 1024 * 1024)
	preFreeGB := float64(preFree) / (1024 * 1024 * 1024)
	postFreeGB := float64(postFree) / (1024 * 1024 * 1024)
	totGB := float64(postTotal) / (1024 * 1024 * 1024)

	statusStr := "VERIFIED_PASSED"
	if postPct > 90.0 {
		if bytesFreed > 0 {
			statusStr = "PARTIAL_RECLEANED"
		} else {
			statusStr = "THRESHOLD_EXCEEDED"
		}
	}

	res := &DiskCleanupResult{
		Success:      true,
		FilesScanned: scannedCount,
		FilesDeleted: deletedCount,
		BytesFreed:   bytesFreed,
		FreedGB:      roundFloat(freedGB, 2),
		PreUsedGB:    roundFloat(preUsedGB, 1),
		PostUsedGB:   roundFloat(postUsedGB, 1),
		PreFreeGB:    roundFloat(preFreeGB, 1),
		PostFreeGB:   roundFloat(postFreeGB, 1),
		TotalGB:      roundFloat(totGB, 1),
		PreUsagePct:  roundFloat(prePct, 1),
		PostUsagePct: roundFloat(postPct, 1),
		MountPoint:   cleanMount,
		DryRun:       dryRun,
		Status:       statusStr,
		Timestamp:    now.Format("15:04:05"),
	}

	if dryRun {
		res.Status = "DRY_RUN_SIMULATION"
		res.Message = fmt.Sprintf("Dry-Run: Scanned %d candidate files across cache directories. 0 deleted.", scannedCount)
	} else if bytesFreed > 0 {
		res.Message = fmt.Sprintf("Purged %d cache files and reclaimed %.2f GB on %s. Saturation: %.1f%% -> %.1f%%.",
			deletedCount, freedGB, cleanMount, prePct, postPct)
	} else {
		res.Message = fmt.Sprintf("Scanned %d files (%d purged). Operating system saturation currently at %.1f%% (%.1f GB used / %.1f GB free).",
			scannedCount, deletedCount, postPct, postUsedGB, postFreeGB)
	}

	// Persist RemediationJob and Audit Log in DB
	if database.DB != nil {
		compTime := time.Now()
		job := models.RemediationJob{
			ID:           uuid.New(),
			MachineID:    mID,
			ActionType:   "cleanup_disk",
			Command:      "powershell/native safe temp cache cleanup",
			Status:       res.Status,
			RetryAttempt: 0,
			MaxRetries:   2,
			Output:       res.Message,
			StartedAt:    now,
			CompletedAt:  &compTime,
			CreatedAt:    now,
			UpdatedAt:    compTime,
		}
		_ = database.DB.Create(&job)

		utils.LogAudit("SREDiskRemediation", mID, res.Message, "Success")

		// Also record updated metric entry so server charts update immediately
		if mID != uuid.Nil {
			met := models.Metric{
				ID:          uuid.New(),
				MachineID:   mID,
				DiskUsage:   res.PostUsagePct,
				DiskPercent: res.PostUsagePct,
				DiskTotal:   postTotal,
				DiskUsed:    postUsed,
				CreatedAt:   time.Now(),
			}
			_ = database.DB.Create(&met)

			database.DB.Model(&models.Server{}).Where("id = ?", mID).Updates(map[string]interface{}{
				"total_disk_gb": res.TotalGB,
			})
		}

	}

	// Broadcast completion via WebSockets
	if websocket.WS != nil {
		websocket.WS.Broadcast(map[string]interface{}{
			"event":   "remediation_completed",
			"type":    "remediation_completed",
			"data":    res,
			"machine": mID.String(),
		})
	}

	return res, nil
}
