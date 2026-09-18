package database_test

import (
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"infrapilot/backend/internal/database"
)

func TestDropAndMigrate(t *testing.T) {
	dsn := "host=localhost user=postgres password=Venky@8686 dbname=infrapilot_enterprise port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Skipf("PostgreSQL not running, skipping drop and migrate test: %v", err)
		return
	}

	// Drop tables cascade
	tables := []string{"incident_comments", "incident_timelines", "incidents"}
	for _, table := range tables {
		if err := db.Exec("DROP TABLE IF EXISTS " + table + " CASCADE;").Error; err != nil {
			t.Fatalf("Failed to drop table %s: %v", table, err)
		}
	}

	// Now run Connect to auto-migrate cleanly
	database.Connect()
}
