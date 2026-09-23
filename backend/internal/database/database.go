package database

import (
	"fmt"
	"strings"
	"time"

	"infrapilot/backend/internal/config"
	"infrapilot/backend/internal/logger"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/search"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

// Connect initializes the database connection
func Connect() {
	cfg := config.Get()
	dsn := cfg.GetDSN()

	logger.Info("Connecting to PostgreSQL",
		"host", cfg.DBHost,
		"port", cfg.DBPort,
		"database", cfg.DBName,
	)

	var db *gorm.DB
	var err error

	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Warn),
	})

	if err != nil {
		logger.Warn("PostgreSQL unavailable on port 5432, falling back to local SQLite database (infrapilot.db)...",
			"error", err,
		)
		db, err = gorm.Open(sqlite.Open("infrapilot.db"), &gorm.Config{
			Logger: gormLogger.Default.LogMode(gormLogger.Warn),
		})
		if err != nil {
			logger.Fatal("Database connection failed",
				"error", err,
			)
		}
		logger.Info("Successfully connected to local SQLite database (infrapilot.db)")
	}

	if db.Dialector.Name() == "postgres" {
		// Pre-create servers table if it doesn't exist
		if !db.Migrator().HasTable("servers") {
		logger.Info("Creating servers table...")
		err := db.Exec(`
			CREATE TABLE servers (
				id uuid PRIMARY KEY,
				name varchar(255),
				hostname varchar(255),
				ip_address varchar(255),
				os varchar(255),
				operating_system varchar(255),
				platform varchar(255),
				agent_version varchar(255),
				resource_type varchar(255) DEFAULT 'windows',
				organization varchar(255) DEFAULT 'Default Organization',
				kernel varchar(255),
				architecture varchar(255),
				mac_address varchar(255),
				cpu_model varchar(255),
				total_memory_gb bigint,
				total_disk_gb bigint,
				gpu varchar(255),
				virtualization varchar(255),
				cloud_provider varchar(255),
				status varchar(255) DEFAULT 'ONLINE',
				online boolean,
				health_score numeric DEFAULT 100,
				last_seen timestamp with time zone,
				retry_count bigint DEFAULT 0,
				api_key varchar(255) UNIQUE,
				key_version bigint DEFAULT 1,
				last_key_rotate timestamp with time zone,
				created_at timestamp with time zone,
				updated_at timestamp with time zone
			);
		`).Error
		if err != nil {
			logger.Error("Failed to create servers table", "error", err)
		}
	}

	// Always pre-populate empty servers table from machines table if machines has records
	if db.Migrator().HasTable("servers") && db.Migrator().HasTable("machines") {
		var serverCount int64
		db.Table("servers").Count(&serverCount)
		if serverCount == 0 {
			var machineCount int64
			db.Table("machines").Count(&machineCount)
			if machineCount > 0 {
				logger.Info("Pre-populating empty servers table from machines table...")
				err := db.Exec(`
					INSERT INTO servers (
						id, name, hostname, ip_address, os, operating_system, platform, agent_version,
						resource_type, organization, kernel, architecture, mac_address, cpu_model,
						total_memory_gb, total_disk_gb, gpu, virtualization, cloud_provider,
						status, online, health_score, last_seen, retry_count, api_key, key_version,
						last_key_rotate, created_at, updated_at
					)
					SELECT 
						id, name, hostname, ip_address, os, operating_system, platform, agent_version,
						resource_type, organization, kernel, architecture, mac_address, cpu_model,
						total_memory_gb, total_disk_gb, gpu, virtualization, cloud_provider,
						status, online, health_score, last_seen, retry_count, api_key, key_version,
						last_key_rotate, created_at, updated_at
					FROM machines
					ON CONFLICT (id) DO NOTHING;
				`).Error
				if err != nil {
					logger.Error("Failed to copy data from machines to servers", "error", err)
				} else {
					logger.Info("Successfully pre-populated servers table.")
				}
			}
		}
	}

	if db.Migrator().HasTable("servers") {
		_ = db.Exec("ALTER TABLE servers ALTER COLUMN id DROP DEFAULT;").Error
		_ = db.Exec(`
			ALTER TABLE servers 
			ALTER COLUMN id TYPE uuid 
			USING (
				CASE 
					WHEN id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
					THEN id::text::uuid 
					ELSE gen_random_uuid() 
				END
			);
		`).Error
		_ = db.Exec("UPDATE servers SET api_key = NULL WHERE api_key = '';").Error
	}

	// Ensure incidents table organization_id column exists and handles NULL values before AutoMigrate adds NOT NULL constraint
	if db.Migrator().HasTable("incidents") {
		if !db.Migrator().HasColumn("incidents", "organization_id") {
			logger.Info("Adding nullable organization_id column to incidents table...")
			_ = db.Exec("ALTER TABLE incidents ADD COLUMN organization_id uuid;").Error
		}
		_ = db.Exec(`
			UPDATE incidents
			SET organization_id = COALESCE(
				(SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1),
				'00000000-0000-0000-0000-000000000000'::uuid
			)
			WHERE organization_id IS NULL;
		`).Error
	}

	// Ensure audit_logs table id and machine_id are UUID
	if db.Migrator().HasTable("audit_logs") {
		_ = db.Exec("ALTER TABLE audit_logs ALTER COLUMN id DROP DEFAULT;").Error
		_ = db.Exec(`
			ALTER TABLE audit_logs 
			ALTER COLUMN id TYPE uuid 
			USING (
				CASE 
					WHEN id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
					THEN id::text::uuid 
					ELSE gen_random_uuid() 
				END
			);
		`).Error
		_ = db.Exec(`
			ALTER TABLE audit_logs 
			ALTER COLUMN machine_id TYPE uuid 
			USING (
				CASE 
					WHEN machine_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
					THEN machine_id::text::uuid 
					ELSE '00000000-0000-0000-0000-000000000000'::uuid 
				END
			);
		`).Error
	}

	// Ensure users table columns exist and handle NULL values before AutoMigrate adds NOT NULL constraints
	if db.Migrator().HasTable("users") {
		_ = db.Exec("ALTER TABLE users ALTER COLUMN id DROP DEFAULT;").Error
		_ = db.Exec(`
			ALTER TABLE users 
			ALTER COLUMN id TYPE uuid 
			USING (
				CASE 
					WHEN id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
					THEN id::text::uuid 
					ELSE gen_random_uuid() 
				END
			);
		`).Error
		_ = db.Exec("DROP TABLE IF EXISTS user_host_permissions CASCADE;").Error

		if !db.Migrator().HasColumn("users", "password") {
			logger.Info("Adding nullable password column to users table...")
			_ = db.Exec("ALTER TABLE users ADD COLUMN password text;").Error
		}
		_ = db.Exec("UPDATE users SET password = '$2a$10$defaultPasswordHashPlaceholder' WHERE password IS NULL OR password = '';").Error

		if !db.Migrator().HasColumn("users", "username") {
			logger.Info("Adding nullable username column to users table...")
			_ = db.Exec("ALTER TABLE users ADD COLUMN username varchar(100);").Error
		}
		_ = db.Exec("UPDATE users SET username = COALESCE(email, 'user_' || id::text) WHERE username IS NULL OR username = '';").Error

		if !db.Migrator().HasColumn("users", "role") {
			logger.Info("Adding nullable role column to users table...")
			_ = db.Exec("ALTER TABLE users ADD COLUMN role varchar(50) DEFAULT 'Viewer';").Error
		}
		_ = db.Exec("UPDATE users SET role = 'Viewer' WHERE role IS NULL OR role = '';").Error
	}

	cleanLegacyUniqueConstraints(db)
	}

	err = db.AutoMigrate(
		&models.User{},
		&models.UserHostPermission{},
		&models.EnrollmentToken{},
		&models.Server{},
		&models.DecommissionedHost{},
		&models.Metric{},
		&models.LinuxServer{},
		&models.LinuxMetric{},
		&models.LinuxProcess{},
		&models.LinuxService{},
		&models.LinuxNetwork{},
		&models.LinuxStorage{},
		&models.LinuxAlert{},
		&models.HistoricalMetric{},
		&models.QueuedMetric{},
		&models.Organization{},
		&models.OrganizationUser{},
		&models.OrganizationSettings{},
		&models.OrganizationInvitation{},
		&models.OrganizationBilling{},
		&models.OrganizationQuota{},
		&models.OrganizationSSO{},
		&models.AlertRule{},
		&models.LinuxDocker{},
		&models.LinuxKubernetes{},
		&models.KubernetesCluster{},
		&models.KubernetesNode{},
		&models.KubernetesPod{},
		&models.KubernetesDeployment{},
		&models.KubernetesStatefulSet{},
		&models.KubernetesDaemonSet{},
		&models.KubernetesService{},
		&models.KubernetesNamespace{},
		&models.KubernetesStorage{},
		&models.KubernetesEvent{},
		&models.LinuxLog{},
		&models.AuditLog{},
		&models.Report{},
		&models.DockerHost{},
		&models.AIIncident{},
		&models.AIRecommendation{},
		&models.AIPrediction{},
		&models.AIHealthScore{},
		&models.AIChatMessage{},
		&models.DockerContainer{},
		&models.DockerImage{},
		&models.DockerVolume{},
		&models.DockerNetwork{},
		&models.DockerEvent{},
		&models.Notification{},
		&models.NotificationPolicy{},
		&models.SREActionPolicy{},
		&models.Incident{},
		&models.IncidentTimeline{},
		&models.IncidentAlert{},
		&models.RemediationPolicy{},
		&models.RemediationJob{},
		&models.Workflow{},
		&models.WorkflowStep{},
		&models.WorkflowExecution{},
		&models.WorkflowLog{},
		&models.BackupRecord{},
		&models.RestoreRecord{},
		&models.DRTestRecord{},
		&models.AnomalyRecord{},
		&models.PredictionRecord{},
		&models.CapacityForecastRecord{},
		&models.RootCauseRecord{},
		&models.AIRecommendationRecord{},
		&models.SLARecord{},
		&models.SecurityAnalyticRecord{},
		&models.CostOptimizationRecord{},
		&models.PolicyRuleRecord{},
		&models.MFASettingRecord{},
		&models.ImmutableAuditRecord{},
		&models.CertificateRecord{},
		&models.ComplianceFrameworkRecord{},
		&models.SecretVaultRecord{},
		&search.SearchIndex{},
		&search.SavedSearch{},
		&search.RecentSearch{},
		&search.SearchAnalytics{},
		&models.APIRequest{},
		&models.ServiceMetric{},
		&models.Command{},
		&models.BlockedCommand{},
		&models.FileOperation{},
		&models.TerminalSession{},
		&models.TerminalCommand{},
		&models.RemoteDeploymentRecord{},
	)

	if err != nil {
		logger.Fatal("Migration failed",
			"error", err,
		)
	}

	DB = db

	if sqlDB, err := db.DB(); err == nil {
		sqlDB.SetMaxIdleConns(25)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(15 * time.Minute)
	}

	seedDefaultAdmin(db)
	cleanupDuplicateServers(db)
	updateSREActionPoliciesRecipient(db)

	logger.Info("PostgreSQL connected successfully",
		"host", cfg.DBHost,
		"database", cfg.DBName,
	)
}

func cleanupDuplicateServers(db *gorm.DB) {
	if db == nil {
		return
	}

	if db.Dialector.Name() == "postgres" {
		_ = db.Exec("ALTER TABLE servers ALTER COLUMN username DROP NOT NULL").Error
		_ = db.Exec("ALTER TABLE servers ALTER COLUMN username SET DEFAULT ''").Error
	}
	_ = db.Exec("UPDATE servers SET username = '' WHERE username IS NULL").Error

	type ServerRow struct {
		ID        uuid.UUID
		Hostname  string
		IPAddress string
		OS        string
		Status    string
		LastSeen  time.Time
	}

	var servers []ServerRow
	// Order by ONLINE status first, then most recent last_seen
	if err := db.Table("servers").
		Order("CASE WHEN UPPER(status) = 'ONLINE' THEN 1 ELSE 2 END, last_seen DESC, created_at DESC").
		Find(&servers).Error; err != nil {
		return
	}

	seen := make(map[string]uuid.UUID)
	for _, s := range servers {
		key := strings.ToLower(strings.TrimSpace(s.Hostname)) + "_" + strings.ToLower(strings.TrimSpace(s.IPAddress)) + "_" + strings.ToLower(strings.TrimSpace(s.OS))
		if strings.TrimSpace(s.Hostname) == "" {
			continue
		}
		if keeperID, exists := seen[key]; exists {
			// Older duplicate detected: migrate any foreign key references to keeperID
			tablesWithMachineID := []string{"metrics", "linux_metrics", "file_operations", "commands", "alerts", "notifications"}
			for _, tbl := range tablesWithMachineID {
				if db.Migrator().HasTable(tbl) {
					_ = db.Exec(fmt.Sprintf("UPDATE %s SET machine_id = ? WHERE machine_id = ?", tbl), keeperID, s.ID).Error
				}
			}

			// Tables with server_id foreign key to servers table
			tablesWithServerID := []string{"linux_kubernetes", "linux_dockers", "linux_processes", "linux_services", "linux_networks", "linux_storages", "linux_alerts", "linux_logs", "historical_metrics"}
			for _, tbl := range tablesWithServerID {
				if db.Migrator().HasTable(tbl) {
					_ = db.Exec(fmt.Sprintf("UPDATE %s SET server_id = ? WHERE server_id = ?", tbl), keeperID, s.ID).Error
					_ = db.Exec(fmt.Sprintf("DELETE FROM %s WHERE server_id = ?", tbl), s.ID).Error
				}
			}

			if db.Migrator().HasTable("agent_logs") {
				_ = db.Exec("UPDATE agent_logs SET machine_id = ? WHERE machine_id = ?", keeperID, s.ID).Error
			}

			// Delete duplicate server record
			_ = db.Exec("DELETE FROM servers WHERE id = ?", s.ID).Error
		} else {
			seen[key] = s.ID
		}
	}
}

func seedDefaultAdmin(db *gorm.DB) {
	var user models.User
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	if err == nil {
		if err := db.Where("email = ?", "admin@infrapilot.com").First(&user).Error; err != nil {
			adminUser := models.User{
				ID:        uuid.New(),
				Username:  "Admin",
				Email:     "admin@infrapilot.com",
				Password:  string(hashedPassword),
				Role:      models.RoleSuperAdmin,
				IsActive:  true,
				CreatedAt: time.Now(),
			}
			_ = db.Create(&adminUser).Error
		} else {
			_ = db.Model(&models.User{}).Where("email = ?", "admin@infrapilot.com").Update("password", string(hashedPassword)).Error
		}
	}

	// Also ensure infrapilotadmin@gmail.com is seeded with Admin@123
	hashedAdminPass, errAdmin := bcrypt.GenerateFromPassword([]byte("Admin@123"), bcrypt.DefaultCost)
	if errAdmin == nil {
		var enterpriseAdmin models.User
		if err := db.Where("email = ?", "infrapilotadmin@gmail.com").First(&enterpriseAdmin).Error; err != nil {
			newAdmin := models.User{
				ID:        uuid.New(),
				Username:  "InfraPilot Admin",
				Email:     "infrapilotadmin@gmail.com",
				Password:  string(hashedAdminPass),
				Role:      models.RoleSuperAdmin,
				IsActive:  true,
				CreatedAt: time.Now(),
			}
			_ = db.Create(&newAdmin).Error
		} else {
			_ = db.Model(&models.User{}).Where("email = ?", "infrapilotadmin@gmail.com").Updates(map[string]interface{}{
				"password":  string(hashedAdminPass),
				"role":      models.RoleSuperAdmin,
				"is_active": true,
			}).Error
		}
	}
}

func cleanLegacyUniqueConstraints(db *gorm.DB) {
	type constraintResult struct {
		TableName      string `gorm:"column:table_name"`
		ConstraintName string `gorm:"column:constraint_name"`
	}

	var results []constraintResult
	query := `
		SELECT tc.table_name, tc.constraint_name 
		FROM information_schema.table_constraints tc
		WHERE tc.constraint_type = 'UNIQUE' 
		  AND tc.table_schema = CURRENT_SCHEMA()
		  AND tc.constraint_name NOT LIKE 'uni_%';
	`
	if err := db.Raw(query).Scan(&results).Error; err == nil {
		for _, res := range results {
			dropSQL := fmt.Sprintf(`ALTER TABLE "%s" DROP CONSTRAINT IF EXISTS "%s";`, res.TableName, res.ConstraintName)
			_ = db.Exec(dropSQL).Error
		}
	}
}

func updateSREActionPoliciesRecipient(db *gorm.DB) {
	if db == nil {
		return
	}
	if db.Migrator().HasTable("sre_action_policies") {
		_ = db.Exec(`
			UPDATE sre_action_policies 
			SET recipient_email = 'infrapilotadmin@gmail.com' 
			WHERE recipient_email IS NULL 
			   OR recipient_email = '' 
			   OR recipient_email = 'admin@company.com';
		`).Error
	}
}

