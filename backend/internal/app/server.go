package app

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"infrapilot/backend/internal/archival"
	"infrapilot/backend/internal/cache"
	"infrapilot/backend/internal/config"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/events"
	"infrapilot/backend/internal/logger"
	"infrapilot/backend/internal/middleware"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/observability"
	"infrapilot/backend/internal/pubsub"
	"infrapilot/backend/internal/queue"
	"infrapilot/backend/internal/routes"
	"infrapilot/backend/internal/scheduler"
	"infrapilot/backend/internal/security"
	"infrapilot/backend/internal/services"
	"infrapilot/backend/internal/subscribers"
	transportgrpc "infrapilot/backend/internal/transport/grpc"
	"infrapilot/backend/internal/websocket"
	"infrapilot/backend/internal/workers"

	"github.com/gin-gonic/gin"
)

var EventBus *events.EventBus

func RunAPI() error {
	cfg := config.Get()

	if err := cfg.Validate(); err != nil {
		logger.Fatal("Configuration validation failed", "error", err)
	}

	logLevel := parseLogLevel(cfg.LogLevel)
	logger.Init(logLevel, cfg.LogJSON, nil)
	logger.Info("Starting InfraPilot Enterprise",
		"version", "1.0.0",
		"mode", cfg.ServerMode,
		"port", cfg.ServerPort,
	)

	database.Connect()
	if err := cache.ConnectRedis(); err != nil {
		logger.Warn("Redis connection unavailable (proceeding in standalone local mode)", "error", err)
	} else {
		defer cache.CloseRedis()
		if err := pubsub.Initialize(); err != nil {
			logger.Warn("Redis Pub/Sub initialization skipped", "error", err)
		}
	}

	EventBus = events.NewEventBus()
	logger.Info("Event Bus initialized")

	messageQueue := queue.NewQueue()

	metricPool := workers.NewWorkerPool("metrics", workers.ProcessMetric, cfg.MetricWorkers, cfg.QueueBuffer, messageQueue, queue.MetricStream, "metric-workers")
	alertPool := workers.NewWorkerPool("alerts", workers.ProcessAlert, cfg.AlertWorkers, cfg.QueueBuffer/2, messageQueue, queue.AlertStream, "alert-workers")
	logPool := workers.NewWorkerPool("logs", workers.ProcessLog, cfg.LogWorkers, cfg.QueueBuffer, messageQueue, queue.LogStream, "log-workers")
	discoveryPool := workers.NewWorkerPool("discovery", workers.ProcessDiscovery, cfg.DiscoveryWorkers, cfg.QueueBuffer/2, messageQueue, queue.DiscoveryStream, "discovery-workers")
	aiPool := workers.NewWorkerPool("ai", workers.ProcessAI, cfg.AIWorkers, cfg.QueueBuffer/2, messageQueue, queue.AIStream, "ai-workers")
	inventoryPool := workers.NewWorkerPool("inventory", workers.ProcessInventory, cfg.InventoryWorkers, cfg.QueueBuffer/2, messageQueue, queue.InventoryStream, "inventory-workers")

	metricPool.Start()
	alertPool.Start()
	logPool.Start()
	discoveryPool.Start()
	aiPool.Start()
	inventoryPool.Start()

	logger.Info("Worker pools started",
		"metric_workers", cfg.MetricWorkers,
		"alert_workers", cfg.AlertWorkers,
		"log_workers", cfg.LogWorkers,
	)

	if tp, err := observability.InitTracing(); err != nil {
		logger.Warn("Failed to initialize tracing", "error", err)
	} else if tp != nil {
		defer observability.ShutdownTracing(tp)
	}

	observability.InitHealthChecks()
	scheduler.InitScheduler()
	registerSubscribers()

	// Setup WebSocket database lookup callback to decouple dependencies (Sprint 10.2 / RoadMap Priority 4)
	websocket.ServerOrgLookup = func(serverID string) (string, error) {
		if database.DB == nil {
			return "", errors.New("database not initialized")
		}
		var s models.Server
		if err := database.DB.Select("organization_id").Where("id = ?", serverID).First(&s).Error; err != nil {
			return "", err
		}
		orgID := s.OrganizationID
		if orgID == "" {
			orgID = "default"
		}
		return orgID, nil
	}

	hub := websocket.WS
	go hub.Run()

	offlineMonitor := services.NewOfflineMonitor(hub, 30*time.Second, 45*time.Second)
	offlineMonitor.Start()

	// Sprint 8.1, 8.2 & 8.5: Real-Time Machine Status Monitor & Live Status Checker
	services.StartStatusMonitorWithHub(hub)
	services.StartMachineStatusChecker()

	router := gin.Default()
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.AuditMiddleware())

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"project":       "InfraPilot Enterprise",
			"edition":       "Enterprise",
			"version":       "1.0.0",
			"status":        "Running",
			"documentation": "/api/v1/docs",
			"health":        "/api/v1/healthz",
			"dashboard":     "/",
			"metrics":       "/metrics",
		})
	})

	router.GET("/healthz", observability.HealthHandler)
	router.GET("/readyz", observability.ReadinessHandler)
	router.GET("/livez", observability.LivenessHandler)
	router.GET("/metrics", observability.MetricsHandler)

	// Robustly locate InfraPilot-Release, scripts, and installer directories
	releaseCandidates := []string{
		"../InfraPilot-Release",
		"./InfraPilot-Release",
		"../../InfraPilot-Release",
		"d:/InfraPilot-Enterprise/InfraPilot-Release",
		"D:\\InfraPilot-Enterprise\\InfraPilot-Release",
		"./scripts",
		"./installer",
		"../scripts",
		"../installer",
		".",
	}
	activeReleaseDir := "../InfraPilot-Release"
	for _, cand := range releaseCandidates {
		if stat, err := os.Stat(cand); err == nil && stat.IsDir() {
			activeReleaseDir = cand
			break
		}
	}
	serveDownloadScript := func(c *gin.Context, scriptName string) {
		serverParam := c.Query("server")
		if serverParam == "" {
			scheme := "http"
			if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
				scheme = "https"
			}
			host := c.Request.Host
			if host == "" {
				host = "192.168.1.2:8080"
			}
			serverParam = fmt.Sprintf("%s://%s", scheme, host)
		}
		serverParam = strings.TrimRight(serverParam, "/")

		for _, cand := range releaseCandidates {
			fullPath := filepath.Join(cand, scriptName)
			if stat, err := os.Stat(fullPath); err == nil && !stat.IsDir() {
				contentBytes, err := os.ReadFile(fullPath)
				if err == nil {
					contentStr := string(contentBytes)
					// Dynamically template backend URL so piped one-liners execute immediately with target server
					contentStr = strings.ReplaceAll(contentStr, "http://192.168.1.2:8080", serverParam)
					contentStr = strings.ReplaceAll(contentStr, "http://localhost:8080", serverParam)
					c.Header("Content-Type", "text/plain; charset=utf-8")
					c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
					c.String(http.StatusOK, contentStr)
					return
				}
			}
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "script not found in release directory", "requested": scriptName})
	}

	// Dynamic script delivery endpoints
	router.GET("/api/v1/install.ps1", func(c *gin.Context) { serveDownloadScript(c, "agent-install.ps1") })
	router.GET("/api/v1/install.sh", func(c *gin.Context) { serveDownloadScript(c, "agent-install.sh") })
	router.GET("/api/v1/agent/install.ps1", func(c *gin.Context) { serveDownloadScript(c, "agent-install.ps1") })
	router.GET("/api/v1/agent/install.sh", func(c *gin.Context) { serveDownloadScript(c, "agent-install.sh") })

	handleDownload := func(c *gin.Context) {
		relPath := strings.TrimPrefix(c.Param("filepath"), "/")
		if relPath == "install.ps1" || relPath == "agent-install.ps1" {
			serveDownloadScript(c, "agent-install.ps1")
			return
		}
		if relPath == "install.sh" || relPath == "agent-install.sh" {
			serveDownloadScript(c, "agent-install.sh")
			return
		}
		if relPath == "ca.crt" {
			certPaths := []string{"certs/ca.crt", "../certs/ca.crt", "./certs/ca.crt"}
			for _, cp := range certPaths {
				if stat, err := os.Stat(cp); err == nil && !stat.IsDir() {
					c.Header("Content-Type", "application/x-x509-ca-cert")
					c.File(cp)
					return
				}
			}
		}
		for _, cand := range releaseCandidates {
			fullPath := filepath.Join(cand, relPath)
			if stat, err := os.Stat(fullPath); err == nil && !stat.IsDir() {
				c.Header("Content-Type", "application/octet-stream")
				c.Header("Accept-Ranges", "bytes")
				c.File(fullPath)
				return
			}
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found in release directory", "requested": relPath})
	}

	// Direct file delivery for /downloads/*filepath (GET & HEAD)
	router.GET("/downloads/*filepath", handleDownload)
	router.HEAD("/downloads/*filepath", handleDownload)
	logger.Info("Serving agent binary downloads", "dir", activeReleaseDir)

	routes.Setup(router, hub, EventBus)

	// Start UDP Auto-Discovery Service for self-healing agent reconnects
	go startUDPDiscoveryListener()

	// Start enterprise mTLS gRPC Transport Security Server
	grpcPort := 50051
	if portStr := os.Getenv("GRPC_PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			grpcPort = p
		}
	}
	certPath := os.Getenv("SERVER_CERT_PATH")
	keyPath := os.Getenv("SERVER_KEY_PATH")
	caPath := os.Getenv("CA_CERT_PATH")
	if certPath == "" {
		certPath = "certs/server.crt"
	}
	if keyPath == "" {
		keyPath = "certs/server.key"
	}
	if caPath == "" {
		caPath = "certs/ca.crt"
	}
	_, _ = transportgrpc.StartGRPCServer(grpcPort, certPath, keyPath, caPath, false)

	// Start periodic AWS Lambda Cold Storage Archival background ticker
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if database.DB != nil {
				_ = archival.RunArchivalPipeline(database.DB)
			}
		}
	}()

	for _, route := range router.Routes() {
		logger.Debug("Route registered",
			"method", route.Method,
			"path", route.Path,
		)
	}

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		logger.Info("Shutting down gracefully...")

		metricPool.Stop()
		alertPool.Stop()
		logPool.Stop()
		discoveryPool.Stop()
		aiPool.Stop()
		inventoryPool.Stop()

		scheduler.GetScheduler().Stop()
		cache.CloseRedis()

		logger.Info("Shutdown complete")
	}()

	logger.Info("Server listening", "port", cfg.ServerPort)

	// Sprint 8.8: TLS & mTLS support
	if cfg.TLSEnabled {
		if srv, err := security.NewTLSServer(router); err == nil {
			logger.Info("TLS enabled", "port", cfg.TLSPort, "mtls", cfg.MTLSEnabled)
			go func() {
				if err := srv.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
					logger.Error("TLS server failed", "error", err)
				}
			}()
		} else {
			logger.Warn("TLS enabled in configuration but certificate loading failed, continuing with HTTP only", "error", err)
		}
	}

	return router.Run(":" + cfg.ServerPort)
}

func registerSubscribers() {
	logger.Info("Registering event subscribers...")

	EventBus.Subscribe("metric.received", subscribers.SaveMetric)
	EventBus.Subscribe("metric.received", subscribers.SendWebSocket)
	EventBus.Subscribe("metric.received", subscribers.CheckAlerts)
	EventBus.Subscribe("metric.received", subscribers.RunAI)
	EventBus.Subscribe("metric.received", subscribers.SaveAuditLog)

	EventBus.Subscribe("machine.registered", subscribers.SendWebSocket)
	EventBus.Subscribe("machine.registered", subscribers.SaveAuditLog)
	EventBus.Subscribe("machine.offline", subscribers.SendWebSocket)
	EventBus.Subscribe("machine.offline", subscribers.SaveAuditLog)

	EventBus.Subscribe("alert.created", subscribers.SendWebSocket)
	EventBus.Subscribe("alert.created", subscribers.SaveAuditLog)

	EventBus.Subscribe("command.executed", subscribers.WriteAudit)
	EventBus.Subscribe("terminal.opened", subscribers.WriteAudit)
	EventBus.Subscribe("terminal.closed", subscribers.WriteAudit)
	EventBus.Subscribe("file.uploaded", subscribers.WriteAudit)
	EventBus.Subscribe("file.deleted", subscribers.WriteAudit)
	EventBus.Subscribe("docker.container.stopped", subscribers.WriteAudit)
	EventBus.Subscribe("kubernetes.pod.failed", subscribers.WriteAudit)

	EventBus.Subscribe("user.login", subscribers.WriteAudit)
	EventBus.Subscribe("user.logout", subscribers.WriteAudit)

	logger.Info("All event subscribers registered successfully", "count", 18)
}

func parseLogLevel(level string) logger.Level {
	switch level {
	case "debug":
		return logger.DEBUG
	case "info":
		return logger.INFO
	case "warn":
		return logger.WARN
	case "error":
		return logger.ERROR
	default:
		return logger.INFO
	}
}

func startUDPDiscoveryListener() {
	addr, err := net.ResolveUDPAddr("udp4", ":50052")
	if err != nil {
		logger.Error("Failed to resolve UDP discovery address", "error", err)
		return
	}

	conn, err := net.ListenUDP("udp4", addr)
	if err != nil {
		logger.Error("Failed to start UDP discovery listener", "error", err)
		return
	}
	defer conn.Close()

	logger.Info("InfraPilot LAN UDP Auto-Discovery Service active", "port", 50052)

	buf := make([]byte, 1024)
	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			continue
		}

		reqStr := strings.TrimSpace(string(buf[:n]))
		if reqStr == "INFRAPILOT_DISCOVERY_PING" {
			hostIP := getPrimaryHostIP()
			respStr := fmt.Sprintf("INFRAPILOT_DISCOVERY_PONG:http://%s:8080", hostIP)
			_, _ = conn.WriteToUDP([]byte(respStr), remoteAddr)
			logger.Info("Responded to agent UDP auto-discovery ping", "agent_addr", remoteAddr.String(), "served_ip", hostIP)
		}
	}
}

func getPrimaryHostIP() string {
	addrs, err := net.InterfaceAddrs()
	if err == nil {
		for _, address := range addrs {
			if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil {
					return ipnet.IP.String()
				}
			}
		}
	}
	return "192.168.1.86"
}
