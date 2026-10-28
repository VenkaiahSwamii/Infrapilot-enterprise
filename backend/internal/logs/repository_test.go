package logs

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test in-memory SQLite: %v", err)
	}

	err = db.AutoMigrate(&models.LogEntry{})
	if err != nil {
		t.Fatalf("Failed to auto-migrate: %v", err)
	}

	database.DB = db
	return db
}

func TestAccurateLogFilteringAndStats(t *testing.T) {
	db := setupTestDB(t)
	repo := NewRepository()

	machine1 := uuid.New()
	machine2 := uuid.New()
	now := time.Now()

	// Seed real test logs across different levels, services, and timestamps
	logsToSeed := []models.Log{
		{
			ID:        uuid.New(),
			MachineID: machine1,
			Hostname:  "postgres-primary",
			Platform:  "linux",
			OS:        "Ubuntu 24.04",
			Level:     "INFO",
			Source:    "database",
			Service:   "postgresql",
			Namespace: "production",
			Message:   "checkpoint starting: time",
			Timestamp: now.Add(-5 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machine1,
			Hostname:  "postgres-primary",
			Platform:  "linux",
			OS:        "Ubuntu 24.04",
			Level:     "WARNING",
			Source:    "database",
			Service:   "postgresql",
			Namespace: "production",
			Message:   "connection pool nearing saturation: 88 connections active",
			Timestamp: now.Add(-3 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machine1,
			Hostname:  "postgres-primary",
			Platform:  "linux",
			OS:        "Ubuntu 24.04",
			Level:     "ERROR",
			Source:    "database",
			Service:   "postgresql",
			Namespace: "production",
			Message:   "fatal: remaining connection slots are reserved for non-replication superuser connections",
			Timestamp: now.Add(-1 * time.Minute),
		},
		{
			ID:        uuid.New(),
			MachineID: machine2,
			Hostname:  "backend-worker-01",
			Platform:  "linux",
			OS:        "Debian 12",
			Level:     "ERROR",
			Source:    "application",
			Service:   "backend-api",
			Namespace: "staging",
			Message:   "failed to acquire connection from pool: timeout after 5000ms",
			Timestamp: now.Add(-30 * time.Second),
		},
	}

	for _, l := range logsToSeed {
		if err := db.Create(&l).Error; err != nil {
			t.Fatalf("Failed to seed log: %v", err)
		}
	}

	// Test 1: Stats Aggregation Accuracy (Ensures Warnings & Errors are NOT zeroed by GORM chaining)
	t.Run("Stats aggregation counts Info, Warning, Error correctly", func(t *testing.T) {
		stats, err := repo.GetLogStats(LogFilter{})
		if err != nil {
			t.Fatalf("GetLogStats failed: %v", err)
		}

		if stats.Total != 4 {
			t.Errorf("Expected 4 total logs, got %d", stats.Total)
		}
		if stats.Info != 1 {
			t.Errorf("Expected 1 INFO log, got %d", stats.Info)
		}
		if stats.Warning != 1 {
			t.Errorf("Expected 1 WARNING log, got %d", stats.Warning)
		}
		if stats.Error != 2 {
			t.Errorf("Expected 2 ERROR logs, got %d", stats.Error)
		}
	})

	// Test 2: Multi-Word Tokenized Search Accuracy
	t.Run("Multi-word search finds logs regardless of intermediate words", func(t *testing.T) {
		logs, total, err := repo.GetLogs(LogFilter{
			Query: "connection slots",
		})
		if err != nil {
			t.Fatalf("GetLogs with multi-word query failed: %v", err)
		}
		if total != 1 || len(logs) != 1 {
			t.Fatalf("Expected exactly 1 log matching 'connection slots', got total=%d len=%d", total, len(logs))
		}
		if logs[0].Hostname != "postgres-primary" {
			t.Errorf("Expected postgres-primary log, got %s", logs[0].Hostname)
		}
	})

	// Test 3: Missing Fields Filtering (OS & Namespace)
	t.Run("Filter by Namespace matches accurately", func(t *testing.T) {
		logs, total, err := repo.GetLogs(LogFilter{
			Namespace: "staging",
		})
		if err != nil {
			t.Fatalf("GetLogs by namespace failed: %v", err)
		}
		if total != 1 {
			t.Fatalf("Expected 1 log in staging namespace, got %d", total)
		}
		if logs[0].Service != "backend-api" {
			t.Errorf("Expected backend-api log, got %s", logs[0].Service)
		}
	})

	// Test 4: Legitimate 0 results returns empty slice, not fake mock logs
	t.Run("Zero result returns empty slice, NOT mock logs", func(t *testing.T) {
		logs, total, err := repo.GetLogs(LogFilter{
			Query: "non_existent_random_unmatched_error_xyz_123",
		})
		if err != nil {
			t.Fatalf("GetLogs failed: %v", err)
		}
		if total != 0 {
			t.Errorf("Expected 0 total for non-existent query, got %d", total)
		}
		if len(logs) != 0 {
			t.Errorf("Expected 0 logs (no mock logs injected), got %d logs", len(logs))
		}
	})

	// Test 5: Deterministic Pagination
	t.Run("Deterministic pagination orders by timestamp desc, id desc", func(t *testing.T) {
		p1, _, _ := repo.GetLogs(LogFilter{Limit: 2, Offset: 0})
		p2, _, _ := repo.GetLogs(LogFilter{Limit: 2, Offset: 2})

		if len(p1) != 2 || len(p2) != 2 {
			t.Fatalf("Pagination lengths incorrect: p1=%d, p2=%d", len(p1), len(p2))
		}
		// Ensure no overlapping IDs between pages
		if p1[0].ID == p2[0].ID || p1[1].ID == p2[0].ID {
			t.Errorf("Pagination yielded overlapping items across offset boundaries")
		}
	})
}
