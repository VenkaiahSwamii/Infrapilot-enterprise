package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infrapilot/backend/internal/auth"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/handlers"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/repository"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	wsProto "github.com/gorilla/websocket"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestPipelineIntegration(t *testing.T) {
	// 1. Setup in-memory GORM database with SQLite
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to initialize SQLite memory DB: %v", err)
	}

	// Override global database pointer
	database.DB = db

	// Auto-migrate Server table (no postgres-specific defaults)
	err = db.AutoMigrate(&models.Server{})
	if err != nil {
		t.Fatalf("AutoMigration failed: %v", err)
	}

	// Create metrics table manually in SQLite to bypass the postgres gen_random_uuid() default clause
	err = db.Exec(`
		CREATE TABLE metrics (
			id TEXT PRIMARY KEY,
			machine_id TEXT,
			cpu_usage REAL,
			memory_usage REAL,
			disk_usage REAL,
			memory_percent REAL,
			disk_percent REAL,
			latency_ms REAL,
			upload_mbps REAL,
			download_mbps REAL,
			uptime INTEGER,
			created_at DATETIME,
			hostname TEXT,
			ip_address TEXT,
			os TEXT,
			cpu_temperature REAL,
			cpu_cores INTEGER,
			cpu_model TEXT,
			total_memory INTEGER,
			free_memory INTEGER,
			memory_total INTEGER,
			memory_used INTEGER,
			disk_total INTEGER,
			disk_used INTEGER
		)
	`).Error
	if err != nil {
		t.Fatalf("Failed to create metrics table: %v", err)
	}

	// 2. Initialize test machine and GORM records (macos OS to skip Linux telemetry table writes)
	machineID := uuid.New()
	testMachine := &models.Machine{
		ID:             machineID,
		Name:           "integration-test-machine",
		Hostname:       "test-pipeline-hostname",
		APIKey:         "test-ingestion-api-key-999",
		OrganizationID: "org-123",
		OS:             "macos",
		Platform:       "macos",
		ResourceType:   "macos",
		Online:         true,
	}
	if err := database.DB.Create(testMachine).Error; err != nil {
		t.Fatalf("Failed to create mock machine record: %v", err)
	}

	// 3. Initialize WebSocket Hub
	hub := websocket.WS
	go hub.Run()

	// Initialize the dynamically decoupled org lookup callback
	websocket.ServerOrgLookup = func(serverID string) (string, error) {
		var s models.Server
		if err := database.DB.Select("organization_id").Where("id = ?", serverID).First(&s).Error; err != nil {
			return "", err
		}
		return s.OrganizationID, nil
	}

	// 4. Initialize Handlers and Services
	metricRepo := repository.NewMetricRepository()
	machineRepo := repository.NewMachineRepository()
	metricService := services.NewMetricService(metricRepo, machineRepo)
	eventBus := events.NewEventBus()
	metricHandler := handlers.NewMetricHandler(metricService, hub, eventBus)

	// 5. Setup Gin Router
	gin.SetMode(gin.TestMode)
	router := gin.New()

	router.POST("/api/v1/servers/:id", metricHandler.ReceiveMetrics)
	router.GET("/ws", func(c *gin.Context) {
		hub.Handle(c.Writer, c.Request)
	})

	server := httptest.NewServer(router)
	defer server.Close()

	// 6. Connect WebSocket Client (Tenant org-123, Role viewer)
	token, err := auth.GenerateToken("viewer-uid", "viewer-uname", "viewer@test.com", "viewer", "org-123")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=" + token
	conn, _, err := wsProto.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial WebSocket server: %v", err)
	}
	defer conn.Close()

	// Start asynchronous reader loop for the client socket
	msgChan := make(chan []byte, 10)
	go func() {
		for {
			_, msgBytes, err := conn.ReadMessage()
			if err != nil {
				return
			}
			msgChan <- msgBytes
		}
	}()

	// 7. Subscribe client to global events room
	subMsg := websocket.ClientMessage{
		Event: "subscribe",
		Room:  "global",
	}
	subBytes, _ := json.Marshal(subMsg)
	_ = conn.WriteMessage(wsProto.TextMessage, subBytes)

	// Wait for subscription confirmation
	select {
	case rxConfirm := <-msgChan:
		var confirm map[string]interface{}
		_ = json.Unmarshal(rxConfirm, &confirm)
		if confirm["event"] != "subscribed" || confirm["room"] != "global" {
			t.Fatalf("Expected subscribed confirmation, got: %v", confirm)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Timeout waiting for subscription confirmation")
	}

	// 8. Post Telemetry Metric Ingestion Request (Simulating Agent)
	reqPayload := handlers.MetricsRequest{
		APIKey:        "test-ingestion-api-key-999",
		Hostname:      "test-pipeline-hostname",
		IPAddress:     "127.0.0.1",
		OS:            "macos",
		CPUUsage:      84.5,
		MemoryPercent: 72.1,
		DiskPercent:   44.9,
		UploadMbps:    12.4,
		DownloadMbps:  34.8,
		Uptime:        3600,
	}
	payloadBytes, _ := json.Marshal(reqPayload)

	postURL := server.URL + "/api/v1/servers/" + machineID.String()
	resp, err := http.Post(postURL, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		t.Fatalf("HTTP POST request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK, got %d", resp.StatusCode)
	}

	// 9. Verify persistence of metric in GORM DB
	var metricRecord models.Metric
	err = database.DB.Where("machine_id = ?", machineID).Order("created_at desc").First(&metricRecord).Error
	if err != nil {
		t.Fatalf("Failed to query persisted metric record: %v", err)
	}

	if metricRecord.CPUUsage != 84.5 {
		t.Errorf("Expected CPUUsage 84.5, got %.1f", metricRecord.CPUUsage)
	}
	if metricRecord.MemoryPercent != 72.1 {
		t.Errorf("Expected MemoryPercent 72.1, got %.1f", metricRecord.MemoryPercent)
	}

	// 10. Verify event broadcast arrival via WebSocket client
	// The client receives two messages: the legacy raw JSON and the structured permission-checked event.
	var receivedLegacy, receivedStructured bool

	for i := 0; i < 2; i++ {
		select {
		case rxBytes := <-msgChan:
			t.Logf("WS Received message %d: %s", i+1, string(rxBytes))

			// Check for legacy JSON metrics format
			var legacyPayload map[string]interface{}
			_ = json.Unmarshal(rxBytes, &legacyPayload)
			if legacyPayload["type"] == "metrics_update" {
				receivedLegacy = true
				if legacyPayload["cpu_usage"] != 84.5 {
					t.Errorf("Expected legacy CPU 84.5, got %v", legacyPayload["cpu_usage"])
				}
				continue
			}

			// Check for structured Event format
			var rxEvt websocket.Event
			_ = json.Unmarshal(rxBytes, &rxEvt)
			if rxEvt.Event == "metric.updated" {
				receivedStructured = true
				payloadMap, ok := rxEvt.Payload.(map[string]interface{})
				if !ok {
					t.Fatalf("Failed to decode event payload: %v", rxEvt.Payload)
				}
				if payloadMap["cpu_usage"] != 84.5 {
					t.Errorf("Expected structured event CPU 84.5, got %v", payloadMap["cpu_usage"])
				}
				if payloadMap["machine_id"] != machineID.String() {
					t.Errorf("Expected structured event machine_id %s, got %v", machineID.String(), payloadMap["machine_id"])
				}
			}
		case <-time.After(1000 * time.Millisecond):
			t.Fatalf("Timeout waiting for message %d", i+1)
		}
	}

	if !receivedLegacy {
		t.Error("Did not receive legacy metrics_update broadcast")
	}
	if !receivedStructured {
		t.Error("Did not receive structured metric.updated event")
	}
}
