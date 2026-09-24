//go:build windows

package services

import (
	"strings"
	"syscall"
	"unsafe"
)

// GetSystemDiskUsage retrieves total, used, free bytes and usage percent for a Windows drive
func GetSystemDiskUsage(target string) (totalBytes, freeBytes, usedBytes uint64, usagePct float64, err error) {
	drive := target
	if drive == "" || drive == "/" || drive == "auto" {
		drive = "C:\\"
	}
	if !strings.HasSuffix(drive, "\\") {
		drive = drive + "\\"
	}

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes uint64
	ptr, _ := syscall.UTF16PtrFromString(drive)
	r1, _, callErr := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(ptr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if r1 != 0 && totalNumberOfBytes > 0 {
		totalBytes = totalNumberOfBytes
		freeBytes = totalNumberOfFreeBytes
		usedBytes = totalNumberOfBytes - totalNumberOfFreeBytes
		usagePct = (float64(usedBytes) / float64(totalBytes)) * 100.0
		return totalBytes, freeBytes, usedBytes, usagePct, nil
	}
	return 0, 0, 0, 0, callErr
}
