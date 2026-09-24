//go:build !windows

package services

import (
	"fmt"
	"strings"
	"syscall"
)

// GetSystemDiskUsage retrieves total, used, free bytes and usage percent for a Unix mount
func GetSystemDiskUsage(target string) (totalBytes, freeBytes, usedBytes uint64, usagePct float64, err error) {
	path := target
	if path == "" || path == "auto" || strings.Contains(path, ":") {
		path = "/"
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err == nil && stat.Blocks > 0 {
		totalBytes = stat.Blocks * uint64(stat.Bsize)
		freeBytes = stat.Bfree * uint64(stat.Bsize)
		usedBytes = totalBytes - freeBytes
		if totalBytes > 0 {
			usagePct = (float64(usedBytes) / float64(totalBytes)) * 100.0
		}
		return totalBytes, freeBytes, usedBytes, usagePct, nil
	}
	return 0, 0, 0, 0, fmt.Errorf("unable to determine disk stats for %s", target)
}
