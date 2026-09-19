package sremonitor

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type DiskConfig struct {
	TargetMountPoint    string
	ReactiveThreshold   float64
	PredictiveHours     float64
	DryRun              bool
	InteractiveApproval bool
	LogRetentionDays    int
	DiskDenyList        []string
	OnTriggered         func(reason string)
}

type DiskIOStat struct {
	ReadBytesPerSec  float64
	WriteBytesPerSec float64
	ReadIOPS         float64
	WriteIOPS        float64
}

type DiskController interface {
	GetDiskUsage(mountPoint string) (float64, float64, float64, error)
	GetAllDiskUsage() map[string]float64
	GetDiskIOStats() (map[string]DiskIOStat, error)
	GetDfOutput() string
	FindAllowlistedFiles() ([]string, error)
	IsFileInUse(path string) bool
	DeleteFile(path string) (int64, error)
	Audit(msg string)
	Escalate(args ...string)
	SendRemoteEvent(eventType, target, actionTaken string, success bool, errorMsg, phase string)
}


type DiskMonitor struct {
	config DiskConfig
	sys    DiskController
	mu     sync.Mutex

	lastFreeMB float64
	lastCheck  time.Time

	ApprovedBy string

	totalCleanups   int
	lastFreedMB     float64
	lastReason      string
	lastCleanupTime time.Time
}

type DiskReportStats struct {
	TotalCleanups   int
	LastFreedMB     float64
	LastReason      string
	LastCleanupTime time.Time
}

func (d *DiskMonitor) GetStats() DiskReportStats {
	d.mu.Lock()
	defer d.mu.Unlock()
	return DiskReportStats{
		TotalCleanups:   d.totalCleanups,
		LastFreedMB:     d.lastFreedMB,
		LastReason:      d.lastReason,
		LastCleanupTime: d.lastCleanupTime,
	}
}

func NewDiskMonitor(cfg DiskConfig, sys DiskController) *DiskMonitor {
	return &DiskMonitor{
		config: cfg,
		sys:    sys,
	}
}

func (d *DiskMonitor) Approve(user string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.config.DryRun = false
	d.ApprovedBy = user
}

func (d *DiskMonitor) Check() (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	usedPercent, _, freeMB, err := d.sys.GetDiskUsage(d.config.TargetMountPoint)
	if err != nil {
		return false, fmt.Errorf("failed to check disk usage: %w", err)
	}

	now := time.Now()

	needsRemediation := false
	reason := ""

	if usedPercent > d.config.ReactiveThreshold {
		needsRemediation = true
		reason = fmt.Sprintf("Reactive threshold breached (%.1f%% > %.1f%%)", usedPercent, d.config.ReactiveThreshold)
		d.lastReason = reason
	} else if !d.lastCheck.IsZero() {
		timeDeltaMinutes := now.Sub(d.lastCheck).Minutes()
		if timeDeltaMinutes >= 5.0 {
			consumptionRateMBPerMin := (d.lastFreeMB - freeMB) / timeDeltaMinutes
			if consumptionRateMBPerMin > 10.0 {
				minutesUntilFull := freeMB / consumptionRateMBPerMin
				if minutesUntilFull < (d.config.PredictiveHours * 60) {
					needsRemediation = true
					if minutesUntilFull < 60 {
						reason = fmt.Sprintf("Predictive threshold breached (Full in %.1f minutes at %.1f MB/min)", minutesUntilFull, consumptionRateMBPerMin)
					} else {
						reason = fmt.Sprintf("Predictive threshold breached (Full in %.1f hours at %.1f MB/min)", minutesUntilFull/60, consumptionRateMBPerMin)
					}
					d.lastReason = reason
				}
			}
			d.lastFreeMB = freeMB
			d.lastCheck = now
		}
	}

	if d.lastCheck.IsZero() || needsRemediation {
		d.lastFreeMB = freeMB
		d.lastCheck = now
	}

	if !needsRemediation {
		return false, nil
	}

	if d.config.OnTriggered != nil {
		d.config.OnTriggered(reason)
	}

	d.sys.Audit(fmt.Sprintf("DISK EXHAUSTION DETECTED: %s", reason))

	preDf := d.sys.GetDfOutput()
	d.sys.Audit("Pre-cleanup disk state:\n" + preDf)

	filesToDelete, err := d.sys.FindAllowlistedFiles()
	if err != nil {
		d.sys.Escalate(fmt.Sprintf("Failed to list files for cleanup: %v", err))
		d.sys.SendRemoteEvent("DISK_EXHAUSTION", "/", "Attempted cleanup", false, err.Error(), "FAILED")
		return false, err
	}

	if len(filesToDelete) == 0 {
		d.sys.Escalate("Disk is full but no allowlisted files found to delete!")
		d.sys.SendRemoteEvent("DISK_EXHAUSTION", "/", "Attempted cleanup", false, "no safe files to clean", "FAILED")
		return false, errors.New("no safe files to clean")
	}

	var totalBytesFreed int64 = 0
	deletedFiles := []string{}

	if d.config.DryRun {
		d.sys.Audit(fmt.Sprintf("[DRY-RUN] Would delete %d files", len(filesToDelete)))
	} else {
		type fileInfo struct {
			path string
			size int64
		}
		var candidateFiles []fileInfo

		for _, path := range filesToDelete {
			denied := false
			baseName := strings.ToLower(filepath.Base(path))
			normalizedPath := strings.ToLower(filepath.ToSlash(path))

			for _, denyWord := range d.config.DiskDenyList {
				if denyWord == "" {
					continue
				}
				dLower := strings.ToLower(denyWord)
				if strings.Contains(baseName, dLower) ||
					strings.Contains(normalizedPath, "/"+dLower+"/") ||
					strings.HasSuffix(normalizedPath, "/"+dLower) {
					denied = true
					break
				}
			}
			if denied {
				continue
			}

			info, err := os.Stat(path)
			if err == nil {
				candidateFiles = append(candidateFiles, fileInfo{path: path, size: info.Size()})
			}
		}

		sort.Slice(candidateFiles, func(i, j int) bool {
			return candidateFiles[i].size > candidateFiles[j].size
		})

		_, totalMB, freeMB, err := d.sys.GetDiskUsage(d.config.TargetMountPoint)
		if err != nil {
			return false, err
		}

		targetFreeMB := totalMB * 0.20 // Drop to 80% usage
		currentFreeMB := freeMB

		if currentFreeMB >= targetFreeMB {
			targetFreeMB = currentFreeMB + (totalMB * 0.05)
		}

		for _, cf := range candidateFiles {
			if currentFreeMB >= targetFreeMB {
				break
			}

			path := cf.path
			if d.sys.IsFileInUse(path) {
				d.sys.Audit(fmt.Sprintf("Skipping active file: %s", path))
				continue
			}

			freed, err := d.sys.DeleteFile(path)
			if err == nil {
				totalBytesFreed += freed
				currentFreeMB += float64(freed) / (1024 * 1024)
				deletedFiles = append(deletedFiles, path)
			}
		}

		freedMB := float64(totalBytesFreed) / (1024 * 1024)

		hostname, _ := os.Hostname()
		if hostname == "" {
			hostname = "unknown-server"
		}

		auditMsg := fmt.Sprintf("[Server: %s] Successfully deleted %d files, freeing %.2f MB", hostname, len(deletedFiles), freedMB)
		if d.ApprovedBy != "" {
			auditMsg = fmt.Sprintf("Approved by %s: %s", d.ApprovedBy, auditMsg)
		}
		d.sys.Audit(auditMsg)

		d.totalCleanups++
		d.lastFreedMB = freedMB
		d.lastCleanupTime = now

		postDf := d.sys.GetDfOutput()
		d.sys.Audit("Post-cleanup disk state:\n" + postDf)

		postUsedPercent, _, _, err := d.sys.GetDiskUsage(d.config.TargetMountPoint)
		if err == nil {
			if postUsedPercent <= 80.5 {
				d.sys.Audit(fmt.Sprintf("Verification passed: disk usage is now %.1f%% (<= 80.5%%)", postUsedPercent))
				d.sys.SendRemoteEvent("DISK_EXHAUSTION", "/", "Cleaned volatile files", true, "", "RESOLVED")
			} else {
				d.sys.Escalate(fmt.Sprintf("Verification failed: disk usage is still %.1f%% (> 80.5%%) after cleanup", postUsedPercent))
				d.sys.SendRemoteEvent("DISK_EXHAUSTION", "/", "Cleaned volatile files", false, "Verification failed, usage >= 80%", "FAILED")
			}
		} else {
			d.sys.Escalate(fmt.Sprintf("Failed to verify post-cleanup disk usage: %v", err))
			d.sys.SendRemoteEvent("DISK_EXHAUSTION", "/", "Cleaned volatile files", false, err.Error(), "FAILED")
		}

		if d.config.InteractiveApproval {
			d.ApprovedBy = ""
		}
	}

	return true, nil
}
