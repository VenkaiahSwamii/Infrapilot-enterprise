//go:build !windows

package collector

import (
	"github.com/shirou/gopsutil/v4/disk"
)

// GetDiskUsage delegates to gopsutil disk.Usage on Linux and macOS
func GetDiskUsage(path string) (*disk.UsageStat, error) {
	return disk.Usage(path)
}
