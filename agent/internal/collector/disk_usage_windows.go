//go:build windows

package collector

import (
	"strings"
	"syscall"
	"unsafe"

	"github.com/shirou/gopsutil/v4/disk"
)

var (
	modkernel32             = syscall.NewLazyDLL("kernel32.dll")
	procGetDiskFreeSpaceExW = modkernel32.NewProc("GetDiskFreeSpaceExW")
)

// GetDiskUsage retrieves accurate volume statistics on Windows.
// It prioritizes lpFreeBytesAvailable so user-accessible free space aligns
// 100% with Windows File Explorer (accounting for reserved OS clusters and restore points).
func GetDiskUsage(path string) (*disk.UsageStat, error) {
	cleanPath := path
	if cleanPath == "" {
		cleanPath = `C:\`
	} else if len(cleanPath) == 2 && cleanPath[1] == ':' {
		cleanPath += `\`
	} else if !strings.HasSuffix(cleanPath, `\`) && !strings.HasSuffix(cleanPath, `/`) {
		cleanPath += `\`
	}

	pathPtr, err := syscall.UTF16PtrFromString(cleanPath)
	if err != nil {
		return disk.Usage(path)
	}

	var freeBytesAvailable uint64
	var totalNumberOfBytes uint64
	var totalNumberOfFreeBytes uint64

	r1, _, _ := procGetDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if r1 == 0 || totalNumberOfBytes == 0 {
		return disk.Usage(path)
	}

	free := freeBytesAvailable
	total := totalNumberOfBytes
	var used uint64
	if total >= free {
		used = total - free
	}
	usedPercent := 0.0
	if total > 0 {
		usedPercent = (float64(used) / float64(total)) * 100.0
	}

	return &disk.UsageStat{
		Path:        path,
		Total:       total,
		Used:        used,
		Free:        free,
		UsedPercent: usedPercent,
	}, nil
}
