package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func TestExecuteRealDiskCleanup_DryRunAndLive(t *testing.T) {
	testDir := t.TempDir()
	dummyFile1 := filepath.Join(testDir, "test_cache_file_1.tmp")
	dummyFile2 := filepath.Join(testDir, "test_cache_file_2.tmp")
	_ = os.WriteFile(dummyFile1, []byte("temporary data content 1"), 0644)
	_ = os.WriteFile(dummyFile2, []byte("temporary data content 2"), 0644)

	// 1. Test Dry Run
	dryRes, err := ExecuteRealDiskCleanupWithDirs(uuid.New(), "auto", true, []string{testDir})
	if err != nil {
		t.Fatalf("Dry run cleanup failed: %v", err)
	}
	if dryRes.Status != "DRY_RUN_SIMULATION" {
		t.Errorf("Expected DRY_RUN_SIMULATION status, got %s", dryRes.Status)
	}
	if dryRes.FilesDeleted != 0 {
		t.Errorf("Expected 0 files deleted in dry-run, got %d", dryRes.FilesDeleted)
	}

	// 2. Test Live Execution on testDir
	res, err := ExecuteRealDiskCleanupWithDirs(uuid.Nil, "auto", false, []string{testDir})
	if err != nil {
		t.Fatalf("Live cleanup failed: %v", err)
	}
	if res.Status != "VERIFIED_PASSED" {
		t.Errorf("Expected VERIFIED_PASSED status, got %s", res.Status)
	}
	if res.FilesDeleted != 2 {
		t.Errorf("Expected 2 files deleted, got %d", res.FilesDeleted)
	}
	if res.TotalGB <= 0 {
		t.Errorf("Expected TotalGB > 0, got %.2f", res.TotalGB)
	}
}
