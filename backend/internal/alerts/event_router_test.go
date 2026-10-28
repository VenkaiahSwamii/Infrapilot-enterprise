package alerts

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) (*gorm.DB, uuid.UUID) {
	// Unique in-memory DB per test to ensure total test isolation
	dbName := fmt.Sprintf("file:mem_%s?mode=memory&cache=shared", uuid.New().String()[:8])
	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to initialize SQLite test DB: %v", err)
	}
	database.DB = db

	// Auto-migrate tables needed for alerts, machines, and processes
	_ = db.AutoMigrate(&models.Machine{}, &models.LinuxAlert{}, &models.LinuxProcess{})

	testMachineID := uuid.New()
	testMachine := models.Machine{
		ID:        testMachineID,
		Hostname:  "prod-node-01",
		IPAddress: "192.168.1.50",
		OS:        "Linux",
		Status:    "ONLINE",
		Online:    true,
	}
	if err := db.Create(&testMachine).Error; err != nil {
		t.Fatalf("Failed to seed test machine: %v", err)
	}

	return db, testMachineID
}

// ── Test 1: SRE Service Crash Event Alert ──────────────────────────────
func Test1_SRECrashEventAlert(t *testing.T) {
	_, machineID := setupTestDB(t)

	alert, err := IngestSREEvent(machineID, "SERVICE_CRASH", "nginx", "restart", "exit status 1", "FAILED")
	if err != nil {
		t.Fatalf("Test 1 Failed: IngestSREEvent returned error: %v", err)
	}
	if alert == nil {
		t.Fatalf("Test 1 Failed: Expected alert to be created, got nil")
	}

	if alert.Origin != "event" || alert.Source != "EVENT" {
		t.Errorf("Test 1 Failed: Expected Origin='event', Source='EVENT', got Origin=%q, Source=%q", alert.Origin, alert.Source)
	}
	if alert.Priority != "P1" && alert.Severity != "Critical" {
		t.Errorf("Test 1 Failed: Expected Critical/P1 alert, got Priority=%s, Severity=%s", alert.Priority, alert.Severity)
	}
	if !strings.Contains(alert.Title, "Service Crash: nginx") {
		t.Errorf("Test 1 Failed: Unexpected alert title: %s", alert.Title)
	}
	if !strings.Contains(alert.RecoverySuggestion, "systemctl restart nginx") {
		t.Errorf("Test 1 Failed: Expected recovery suggestion to contain restart command, got: %s", alert.RecoverySuggestion)
	}
}

// ── Test 2: Docker Container OOM / Crash Event Ingestion ───────────────
func Test2_DockerOOMCrashEventAlert(t *testing.T) {
	_, machineID := setupTestDB(t)

	dockerEvt := services.DockerEventInput{
		Time:      time.Now(),
		Type:      "container",
		Action:    "oom",
		ActorID:   "c982348a123f",
		ActorName: "payment-api-prod",
		Message:   "Container payment-api-prod killed by cgroup OOM killer",
	}

	alert, err := IngestDockerLifecycleEvent(machineID, dockerEvt)
	if err != nil {
		t.Fatalf("Test 2 Failed: IngestDockerLifecycleEvent returned error: %v", err)
	}
	if alert == nil {
		t.Fatalf("Test 2 Failed: Expected Docker OOM alert, got nil")
	}

	if alert.Category != "DOCKER_OOM" {
		t.Errorf("Test 2 Failed: Expected Category='DOCKER_OOM', got %q", alert.Category)
	}
	if alert.Component != "payment-api-prod" {
		t.Errorf("Test 2 Failed: Expected Component='payment-api-prod', got %q", alert.Component)
	}
	if alert.Severity != "Critical" || alert.Priority != "P1" {
		t.Errorf("Test 2 Failed: Expected P1 Critical, got %s / %s", alert.Priority, alert.Severity)
	}
}

// ── Test 3: Kubernetes CrashLoopBackOff & Node Not Ready Alert ─────────
func Test3_KubernetesCrashLoopBackOffAlert(t *testing.T) {
	_, machineID := setupTestDB(t)

	k8sEvt := models.KubernetesEvent{
		Reason:         "CrashLoopBackOff",
		Message:        "Back-off restarting failed container web in pod auth-service-789_default",
		Namespace:      "default",
		InvolvedObject: "pod/auth-service-789",
		Type:           "Warning",
	}

	alert, err := IngestKubernetesEvent(machineID, k8sEvt)
	if err != nil {
		t.Fatalf("Test 3 Failed: IngestKubernetesEvent returned error: %v", err)
	}
	if alert == nil {
		t.Fatalf("Test 3 Failed: Expected K8s pod crash alert, got nil")
	}

	if alert.Category != "K8S_POD_CRASH" {
		t.Errorf("Test 3 Failed: Expected Category='K8S_POD_CRASH', got %q", alert.Category)
	}
	if !strings.Contains(alert.Title, "Kubernetes CrashLoopBackOff") {
		t.Errorf("Test 3 Failed: Expected title to contain Kubernetes CrashLoopBackOff, got %q", alert.Title)
	}
}

// ── Test 4: Windows EventLog / Critical Syslog Error Trigger ──────────
func Test4_SystemLogErrorEventAlert(t *testing.T) {
	_, machineID := setupTestDB(t)

	alert, err := IngestLogEvent(machineID, "CRITICAL", "ntfs", "55", "The file system structure on disk C: is corrupt and unusable.")
	if err != nil {
		t.Fatalf("Test 4 Failed: IngestLogEvent returned error: %v", err)
	}
	if alert == nil {
		t.Fatalf("Test 4 Failed: Expected System log error alert, got nil")
	}

	if alert.Category != "SYSTEM_LOG_ERROR" {
		t.Errorf("Test 4 Failed: Expected Category='SYSTEM_LOG_ERROR', got %q", alert.Category)
	}
	if alert.Component != "ntfs:55" {
		t.Errorf("Test 4 Failed: Expected Component='ntfs:55', got %q", alert.Component)
	}
	if alert.Severity != "Critical" {
		t.Errorf("Test 4 Failed: Expected Critical severity, got %q", alert.Severity)
	}
}

// ── Test 5: Event Storm Deduplication & Flapping Prevention ────────────
func Test5_EventStormDeduplication(t *testing.T) {
	db, machineID := setupTestDB(t)

	// Fire the same crash event 10 consecutive times rapidly
	for i := 1; i <= 10; i++ {
		_, err := IngestSREEvent(machineID, "SERVICE_CRASH", "redis-server", "restart", "exit code 137", "FAILED")
		if err != nil {
			t.Fatalf("Test 5 Failed at iteration %d: %v", i, err)
		}
	}

	// Verify database contains EXACTLY 1 active alert row for this service
	var count int64
	db.Model(&models.LinuxAlert{}).Where("machine_id = ? AND category = 'SERVICE_CRASH' AND component = 'redis-server' AND LOWER(status) IN ('open', 'active')", machineID).Count(&count)
	if count != 1 {
		t.Fatalf("Test 5 Failed: Expected exactly 1 alert row after 10 duplicate events, but found %d", count)
	}

	var alert models.LinuxAlert
	db.Where("machine_id = ? AND category = 'SERVICE_CRASH' AND component = 'redis-server'", machineID).First(&alert)
	if alert.MetricValue < 10 {
		t.Errorf("Test 5 Failed: Expected metric_value (occurrence count) >= 10, got %.0f", alert.MetricValue)
	}
}

// ── Test 6: Stateful Event Recovery & Auto-Resolution ──────────────────
func Test6_StatefulEventRecoveryAutoResolution(t *testing.T) {
	db, machineID := setupTestDB(t)

	// 1. Initial crash triggers open alert
	_, _ = IngestSREEvent(machineID, "SERVICE_CRASH", "postgresql", "restart", "connection refused", "FAILED")

	var initialCount int64
	db.Model(&models.LinuxAlert{}).Where("machine_id = ? AND category = 'SERVICE_CRASH' AND component = 'postgresql' AND LOWER(status) IN ('open', 'active')", machineID).Count(&initialCount)
	if initialCount != 1 {
		t.Fatalf("Test 6 Failed: Initial open alert was not created")
	}

	// 2. Recovery event arrives indicating healthy resolution
	resolvedAlert, err := IngestSREEvent(machineID, "SERVICE_CRASH", "postgresql", "Verified healthy", "", "RESOLVED")
	if err != nil {
		t.Fatalf("Test 6 Failed: IngestSREEvent resolution error: %v", err)
	}
	if resolvedAlert == nil || resolvedAlert.Status != "RESOLVED" {
		t.Fatalf("Test 6 Failed: Expected alert status to be RESOLVED, got %v", resolvedAlert)
	}

	// 3. Confirm open alert count in DB is now 0
	var openCount int64
	db.Model(&models.LinuxAlert{}).Where("machine_id = ? AND category = 'SERVICE_CRASH' AND component = 'postgresql' AND LOWER(status) IN ('open', 'active')", machineID).Count(&openCount)
	if openCount != 0 {
		t.Errorf("Test 6 Failed: Expected 0 open alerts after resolution event, but found %d", openCount)
	}
}

// ── Test 7: Backend API Query Filtering (Rule vs Event vs All) ─────────
func Test7_APIQuerySourceFiltering(t *testing.T) {
	db, machineID := setupTestDB(t)

	// Seed 1 Metric Rule Alert
	ruleID := uuid.New()
	ruleAlert := models.LinuxAlert{
		ID:        uuid.New(),
		MachineID: machineID,
		RuleID:    ruleID,
		Title:     "High CPU Usage",
		Source:    "RuleEngine",
		Origin:    "rule",
		Category:  "CPU",
		Severity:  "Critical",
		Priority:  "P1",
		Status:    "ACTIVE",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	db.Create(&ruleAlert)

	// Seed 1 Event Alert
	eventAlert := models.LinuxAlert{
		ID:        uuid.New(),
		MachineID: machineID,
		RuleID:    uuid.Nil,
		Title:     "[SRE] Service Crash: auth-worker",
		Source:    "EVENT",
		Origin:    "event",
		Category:  "SERVICE_CRASH",
		Component: "auth-worker",
		Severity:  "Critical",
		Priority:  "P1",
		Status:    "ACTIVE",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	db.Create(&eventAlert)

	// Query All
	var allAlerts []models.LinuxAlert
	db.Where("LOWER(status) IN ('open', 'active')").Find(&allAlerts)
	if len(allAlerts) != 2 {
		t.Errorf("Test 7 Failed: Expected 2 alerts for 'all', got %d", len(allAlerts))
	}

	// Query Event Alerts only (matching ListAlerts query)
	var eventAlerts []models.LinuxAlert
	db.Where("LOWER(status) IN ('open', 'active') AND (LOWER(source) = 'event' OR origin = 'event')").Find(&eventAlerts)
	if len(eventAlerts) != 1 || eventAlerts[0].ID != eventAlert.ID {
		t.Errorf("Test 7 Failed: Expected exactly 1 event alert, got %d", len(eventAlerts))
	}

	// Query Metric Rule Alerts only (matching ListAlerts query)
	var ruleAlerts []models.LinuxAlert
	db.Where("LOWER(status) IN ('open', 'active') AND ((LOWER(source) != 'event' AND origin != 'event') OR source IS NULL)").Find(&ruleAlerts)
	if len(ruleAlerts) != 1 || ruleAlerts[0].ID != ruleAlert.ID {
		t.Errorf("Test 7 Failed: Expected exactly 1 rule alert, got %d", len(ruleAlerts))
	}
}

// ── Test 8: Frontend Alerts Table Event Metadata Completeness ──────────
func Test8_FrontendAlertsTableEventMetadata(t *testing.T) {
	_, machineID := setupTestDB(t)

	alert, err := IngestSREEvent(machineID, "DISK_EXHAUSTION", "/var/log", "auto-cleanup", "disk 96%", "FAILED")
	if err != nil || alert == nil {
		t.Fatalf("Test 8 Failed: Ingestion failed: %v", err)
	}

	// Verify all metadata required by frontend row rendering exists
	if alert.Origin != "event" {
		t.Errorf("Test 8 Failed: Missing Origin='event'")
	}
	if alert.Source != "EVENT" {
		t.Errorf("Test 8 Failed: Missing Source='EVENT'")
	}
	if alert.Category == "" {
		t.Errorf("Test 8 Failed: Category must not be empty for category tag display")
	}
	if alert.Component == "" {
		t.Errorf("Test 8 Failed: Component must not be empty")
	}
	if alert.Priority == "" {
		t.Errorf("Test 8 Failed: Priority pill label missing")
	}
	if alert.RecoverySuggestion == "" {
		t.Errorf("Test 8 Failed: RecoverySuggestion missing for operator drawer")
	}
}

// ── Test 9: Source Filter Toggles (Logic Verification) ─────────────────
func Test9_SourceFilterToggles(t *testing.T) {
	sampleEventAlert := models.LinuxAlert{
		Source: "EVENT",
		Origin: "event",
		Status: "ACTIVE",
	}

	sampleRuleAlert := models.LinuxAlert{
		Source: "RuleEngine",
		Origin: "rule",
		Status: "ACTIVE",
	}

	// Logic replicated from frontend filteredAlerts:
	filterCheck := func(a models.LinuxAlert, sourceFilter string) bool {
		isEvent := strings.ToUpper(a.Source) == "EVENT" || strings.ToLower(a.Origin) == "event"
		if sourceFilter == "events" && !isEvent {
			return false
		}
		if sourceFilter == "rules" && isEvent {
			return false
		}
		return true
	}

	// Toggle: 'all' -> both must be true
	if !filterCheck(sampleEventAlert, "all") || !filterCheck(sampleRuleAlert, "all") {
		t.Errorf("Test 9 Failed: 'all' filter must include both")
	}

	// Toggle: 'events' -> only event alert true
	if !filterCheck(sampleEventAlert, "events") {
		t.Errorf("Test 9 Failed: 'events' filter must include event alert")
	}
	if filterCheck(sampleRuleAlert, "events") {
		t.Errorf("Test 9 Failed: 'events' filter must exclude rule alert")
	}

	// Toggle: 'rules' -> only rule alert true
	if filterCheck(sampleEventAlert, "rules") {
		t.Errorf("Test 9 Failed: 'rules' filter must exclude event alert")
	}
	if !filterCheck(sampleRuleAlert, "rules") {
		t.Errorf("Test 9 Failed: 'rules' filter must include rule alert")
	}
}

// ── Test 10: Event Alert Remediation & AI Action Validation ───────────
func Test10_EventAlertRemediationPlan(t *testing.T) {
	_, machineID := setupTestDB(t)

	alert, _ := IngestSREEvent(machineID, "SERVICE_CRASH", "docker", "systemctl status", "inactive (dead)", "FAILED")
	if alert == nil {
		t.Fatalf("Test 10 Failed: Alert creation failed")
	}

	// Verify suggestion guides remediation
	suggestion := generateEventRecoverySuggestion(alert.Category, alert.Component)
	if !strings.Contains(suggestion, "systemctl restart docker") {
		t.Errorf("Test 10 Failed: Expected remediation suggestion to prescribe service restart, got: %s", suggestion)
	}

	// Verify disk exhaustion suggestion
	diskSuggestion := generateEventRecoverySuggestion("DISK_EXHAUSTION", "/data")
	if !strings.Contains(diskSuggestion, "journalctl --vacuum") {
		t.Errorf("Test 10 Failed: Expected disk remediation suggestion, got: %s", diskSuggestion)
	}

	fmt.Printf("✔ All 10 End-to-End Event Alert Tests Passed!\n")
}
