package sremonitor

import (
	"os"
	"path/filepath"
	"testing"
)

type mockDiskController struct {
	usedPercent float64
	totalMB     float64
	freeMB      float64
	files       []string
	audits      []string
	escalations []string
}

func (m *mockDiskController) GetDiskUsage(mountPoint string) (float64, float64, float64, error) {
	return m.usedPercent, m.totalMB, m.freeMB, nil
}

func (m *mockDiskController) GetAllDiskUsage() map[string]float64 {
	return map[string]float64{"/": m.usedPercent}
}

func (m *mockDiskController) GetDiskIOStats() (map[string]DiskIOStat, error) {
	return map[string]DiskIOStat{}, nil
}

func (m *mockDiskController) GetDfOutput() string {
	return "Filesystem Size Used Avail Use% Mounted\nroot 100000M 92000M 8000M 92% /"
}

func (m *mockDiskController) FindAllowlistedFiles() ([]string, error) {
	return m.files, nil
}

func (m *mockDiskController) IsFileInUse(path string) bool {
	return false
}

func (m *mockDiskController) DeleteFile(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 1024 * 1024 * 50, nil // Mock 50MB
	}
	_ = os.Remove(path)
	return info.Size(), nil
}

func (m *mockDiskController) Audit(msg string) {
	m.audits = append(m.audits, msg)
}

func (m *mockDiskController) Escalate(args ...string) {
	m.escalations = append(m.escalations, args...)
}

func (m *mockDiskController) SendRemoteEvent(eventType, target, actionTaken string, success bool, errorMsg, phase string) {
}

func TestDiskMonitor_ReactiveBreach(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "sre_disk_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create a safe volatile test file and a protected database file
	safeFile := filepath.Join(tempDir, "temp_cache.log")
	_ = os.WriteFile(safeFile, make([]byte, 1024*1024*10), 0644) // 10MB

	protectedFile := filepath.Join(tempDir, "mysql_db.ibdata")
	_ = os.WriteFile(protectedFile, make([]byte, 1024*1024*20), 0644) // 20MB

	mockCtrl := &mockDiskController{
		usedPercent: 93.0,
		totalMB:     10000.0,
		freeMB:      700.0,
		files:       []string{safeFile, protectedFile},
	}

	cfg := DiskConfig{
		TargetMountPoint:  "/",
		ReactiveThreshold: 90.0,
		PredictiveHours:   4.0,
		DryRun:            false,
		DiskDenyList:      []string{"mysql", "postgres", "db", "data"},
	}

	mon := NewDiskMonitor(cfg, mockCtrl)

	triggered, err := mon.Check()
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}
	if !triggered {
		t.Errorf("Expected reactive breach to trigger remediation")
	}

	// Verify safe file was deleted while protected DB file was preserved
	if _, err := os.Stat(safeFile); !os.IsNotExist(err) {
		t.Errorf("Expected safe temp file to be deleted")
	}
	if _, err := os.Stat(protectedFile); err != nil {
		t.Errorf("Expected protected db file to NOT be deleted: %v", err)
	}
}

func TestDiskMonitor_DryRun(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "sre_disk_dryrun_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	testFile := filepath.Join(tempDir, "test.tmp")
	_ = os.WriteFile(testFile, []byte("some temp data"), 0644)

	mockCtrl := &mockDiskController{
		usedPercent: 95.0,
		totalMB:     10000.0,
		freeMB:      500.0,
		files:       []string{testFile},
	}

	cfg := DiskConfig{
		TargetMountPoint:  "/",
		ReactiveThreshold: 90.0,
		PredictiveHours:   4.0,
		DryRun:            true,
		DiskDenyList:      []string{"db"},
	}

	mon := NewDiskMonitor(cfg, mockCtrl)
	triggered, err := mon.Check()
	if err != nil {
		t.Fatalf("Check error: %v", err)
	}
	if !triggered {
		t.Errorf("Expected check to trigger")
	}

	// File should NOT be deleted in DryRun mode
	if _, err := os.Stat(testFile); err != nil {
		t.Errorf("File was deleted in DryRun mode!")
	}
}

func TestDiskMonitor_Stats(t *testing.T) {
	mockCtrl := &mockDiskController{
		usedPercent: 40.0,
		totalMB:     10000.0,
		freeMB:      6000.0,
	}

	mon := NewDiskMonitor(DiskConfig{
		TargetMountPoint:  "/",
		ReactiveThreshold: 90.0,
		PredictiveHours:   4.0,
	}, mockCtrl)

	triggered, err := mon.Check()
	if err != nil || triggered {
		t.Errorf("Check should not trigger on 40%% disk usage")
	}

	stats := mon.GetStats()
	if stats.TotalCleanups != 0 {
		t.Errorf("Expected 0 cleanups, got %d", stats.TotalCleanups)
	}
}
