package app

import (
	"context"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"infrapilot/agent/internal/cache"
	"infrapilot/agent/internal/client"
	"infrapilot/agent/internal/collector"
	logscollector "infrapilot/agent/internal/collector/logs"
	"infrapilot/agent/internal/commands"
	"infrapilot/agent/internal/config"
	"infrapilot/agent/internal/discovery"
	"infrapilot/agent/internal/heartbeat"
	"infrapilot/agent/internal/reconnect"
	"infrapilot/agent/internal/register"
	"infrapilot/agent/internal/sender"
	"infrapilot/agent/internal/sremonitor"
)


func RunAgent() {
	cfgPath := config.DefaultConfigPath()
	logDir := filepath.Join(filepath.Dir(cfgPath), "logs")
	_ = os.MkdirAll(logDir, 0755)
	if logFile, err := os.OpenFile(filepath.Join(logDir, "agent.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
		log.SetOutput(io.MultiWriter(os.Stderr, logFile))
	}

	log.Println("Starting InfraPilot Monitoring Agent...")

	cache.Init(filepath.Join(filepath.Dir(cfgPath), "offline_queue.json"))

	store := config.NewConfigStore(cfgPath)

	var cfg *config.EnterpriseConfig

	if store.Exists() {
		// config.json exists, attempt to load it
		var loadErr error
		cfg, loadErr = store.Load()
		if loadErr != nil {
			log.Printf("Warning: Failed to parse existing config.json: %v. Will re-enroll.", loadErr)
			cfg = nil
		} else if cfg.MetricsInterval == 0 {
			cfg.MetricsInterval = 5
		}
		if cfg != nil && cfg.HeartbeatInterval == 0 {
			cfg.HeartbeatInterval = 15
		}
	}

	// Load configuration, honoring --config flag or existing AppConfig if already initialized
	var tomlCfg *config.Config
	if config.AppConfig != nil && config.AppConfig.BackendURL != "" {
		tomlCfg = config.AppConfig
	} else {
		for i, arg := range os.Args {
			if (arg == "--config" || arg == "-config") && i+1 < len(os.Args) {
				if t, err := config.LoadConfig(os.Args[i+1]); err == nil && t != nil {
					tomlCfg = t
					break
				}
			} else if strings.HasPrefix(arg, "--config=") {
				cfgFile := strings.TrimPrefix(arg, "--config=")
				if t, err := config.LoadConfig(cfgFile); err == nil && t != nil {
					tomlCfg = t
					break
				}
			}
		}
		if tomlCfg == nil {
			if t, err := config.LoadConfig("config.toml"); err == nil && t != nil {
				tomlCfg = t
			} else if y, err := config.LoadConfig("config.yaml"); err == nil && y != nil {
				tomlCfg = y
			}
		}
	}

	// If config.json already exists and config.toml specifies a backend_url, ensure they stay in sync
	if cfg != nil && tomlCfg != nil && tomlCfg.BackendURL != "" && cfg.Server != tomlCfg.BackendURL {
		log.Printf("Updating agent backend URL from config.toml: %s -> %s", cfg.Server, tomlCfg.BackendURL)
		cfg.Server = tomlCfg.BackendURL
		_ = store.Save(cfg)
	}

	for cfg == nil || cfg.MachineID == "" || cfg.APIKey == "" {
		// config.json does not exist or lacks credentials, run agent self-registration/enrollment
		backendURL := "http://localhost:8080"
		if tomlCfg != nil && tomlCfg.BackendURL != "" {
			backendURL = tomlCfg.BackendURL
		} else if cfg != nil && cfg.Server != "" {
			backendURL = cfg.Server
		}

		enrollmentToken := ""
		if tomlCfg != nil {
			enrollmentToken = tomlCfg.EnrollmentToken
		}

		log.Printf("Agent credentials missing. Enrolling machine with backend at %s...", backendURL)

		metrics, err := collector.GetMetrics()
		if err != nil {
			log.Printf("Failed to fetch initial system metrics for enrollment: %v. Retrying in 5s...", err)
			time.Sleep(5 * time.Second)
			continue
		}

		// Sprint 6.5 Enrollment Request Payload
		regPayload := map[string]interface{}{
			"enrollment_token": enrollmentToken,
			"hostname":         metrics.Hostname,
			"os":               metrics.OS,
			"platform":         metrics.Platform,
			"ip_address":       metrics.IPAddress,
			"kernel":           metrics.Kernel,
			"architecture":     runtime.GOARCH,
			"cpu_model":        metrics.CPUModel,
			"cpu_cores":        metrics.CPUCores,
			"total_memory_gb":  metrics.MemoryTotal / 1024 / 1024 / 1024,
			"total_disk_gb":    metrics.DiskTotal / 1024 / 1024 / 1024,
			"memory":           metrics.MemoryTotal / 1024 / 1024 / 1024,
		}

		// Perform enrollment call using the isolated register package
		result, regErr := register.RegisterAgent(backendURL, regPayload, enrollmentToken)
		if regErr != nil {
			log.Printf("Enrollment attempt failed: %v. Retrying in 5 seconds...", regErr)
			time.Sleep(5 * time.Second)
			continue
		}

		cfg = &config.EnterpriseConfig{
			Server:            backendURL,
			MachineID:         result["machine_id"],
			APIKey:            result["api_key"],
			Organization:      result["organization_id"],
			MetricsInterval:   5,
			HeartbeatInterval: 15,
			OS:                runtime.GOOS,
		}

		if err := store.Save(cfg); err != nil {
			log.Printf("Warning: Failed to save config.json: %v", err)
		}

		log.Println("Enrollment successful. Machine ID:", cfg.MachineID)
		log.Println("Configuration saved in config.json")
		break
	}

	// Initialize AppConfig in config package, preserving config.toml as source of truth
	if tomlCfg != nil {
		config.AppConfig = tomlCfg
		if cfg != nil {
			if config.AppConfig.BackendURL == "" && cfg.Server != "" {
				config.AppConfig.BackendURL = cfg.Server
			}
			if cfg.MachineID != "" {
				config.AppConfig.MachineID = cfg.MachineID
			}
			if cfg.APIKey != "" {
				config.AppConfig.APIKey = cfg.APIKey
			}
			if cfg.KeyVersion != 0 {
				config.AppConfig.KeyVersion = cfg.KeyVersion
			}
			if cfg.MetricsInterval != 0 {
				config.AppConfig.Interval = cfg.MetricsInterval
			}
		}
	} else {
		config.AppConfig = &config.Config{
			BackendURL: cfg.Server,
			MachineID:  cfg.MachineID,
			APIKey:     cfg.APIKey,
			KeyVersion: cfg.KeyVersion,
			Interval:   cfg.MetricsInterval,
		}
	}

	// Initialize the shared client
	if err := client.InitHTTPClient(); err != nil {
		log.Printf("Failed to initialize HTTP client: %v", err)
	}

	log.Printf("Agent initialized. Backend: %s, Machine ID: %s, Org: %s", cfg.Server, cfg.MachineID, cfg.Organization)

	// API key rotation poller
	go commands.PollKeyRotation(cfg.Server, cfg.MachineID, cfg.APIKey, store)

	// Heartbeat loop with reconnection and UDP auto-discovery
	go func() {
		consecutiveFailures := 0
		reconnect.ExecuteWithBackoff(nil, reconnect.DefaultRetryStrategy(), "Heartbeat")
		for {
			err := heartbeat.Send(cfg.Server, cfg.MachineID, cfg.APIKey)
			if err != nil {
				consecutiveFailures++
				log.Printf("Heartbeat Error (Failure %d): %v", consecutiveFailures, err)
				if consecutiveFailures >= 2 {
					newURL := discovery.DiscoverServerURL(config.DefaultConfigPath(), cfg.Server)
					if newURL != "" {
						cfg.Server = newURL
						consecutiveFailures = 0
						log.Printf("[AutoDiscovery] Switched agent active server URL to: %s", cfg.Server)
					}
				}
			} else {
				consecutiveFailures = 0
			}
			time.Sleep(time.Duration(cfg.HeartbeatInterval) * time.Second)
		}
	}()

	// Poll and execute remote commands in a background thread
	go commands.PollAndExecute(cfg.Server, cfg.MachineID, cfg.APIKey)

	// Initialize Agent v2 Modular Collector Manager
	ctx := context.Background()
	mgr := collector.NewManager(5 * time.Second)
	mgr.Register(logscollector.NewCollector(cfg.MachineID, cfg.Server))
	go mgr.Start(ctx)

	// Start SREMonitor background crash, disk, and latency monitors
	ctrl := sremonitor.NewAgentController(cfg.Server, cfg.APIKey, cfg.MachineID)

	crashMon := sremonitor.NewMonitor(sremonitor.Config{
		ServiceName:    "ssh.service",
		AcceptList:     sremonitor.DefaultAcceptList,
		MaxRestarts:    2,
		RestartWindow:  10 * time.Minute,
		VerifyDuration: 5 * time.Second,
	}, ctrl)

	diskCfg := config.Get().Disk
	targetMount := config.AutoDetectMountPoint(diskCfg.TargetMountPoint)
	reactiveThresh := 90.0
	if diskCfg.ReactiveThresholdPercent > 0 {
		reactiveThresh = diskCfg.ReactiveThresholdPercent
	}
	predHours := 4.0
	if diskCfg.PredictiveHours > 0 {
		predHours = diskCfg.PredictiveHours
	}

	diskMon := sremonitor.NewDiskMonitor(sremonitor.DiskConfig{
		TargetMountPoint:  targetMount,
		ReactiveThreshold: reactiveThresh,
		PredictiveHours:   predHours,
		DiskDenyList:      diskCfg.DenyList,
	}, ctrl)

	latCfg := config.Get().Latency
	baseP95 := 40.0
	if latCfg.BaselineP95Ms > 0 {
		baseP95 = latCfg.BaselineP95Ms
	}
	threshMult := 3.0
	if latCfg.ThresholdMultiplier > 0 {
		threshMult = latCfg.ThresholdMultiplier
	}
	alertWin := 5 * time.Minute
	if latCfg.AlertWindowMinutes > 0 {
		alertWin = time.Duration(latCfg.AlertWindowMinutes) * time.Minute
	}

	latencyMon := sremonitor.NewLatencyMonitor(sremonitor.LatencyConfig{
		ServiceName:         "ssh.service",
		AcceptList:          latCfg.AcceptList,
		BaselineP95:         baseP95,
		ThresholdMultiplier: threshMult,
		AlertWindow:         alertWin,
	}, ctrl)

	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			_, _ = crashMon.Check()
			_, _ = diskMon.Check()
			_ = latencyMon.Check(time.Now())
		}
	}()

	// Metrics collection loop with reconnection
	reconnect.ExecuteWithBackoff(nil, reconnect.DefaultRetryStrategy(), "Metrics")
	for {
		metrics, err := collector.GetMetrics()
		if err != nil {
			log.Printf("Metrics Collection Error: %v", err)
			time.Sleep(time.Duration(cfg.MetricsInterval) * time.Second)
			continue
		}

		err = sender.SendMetrics(cfg.Server, cfg.MachineID, cfg.APIKey, metrics)
		if err != nil {
			log.Printf("Sender Error: %v", err)
		} else {
			log.Println("Metrics successfully delivered.")
		}

		time.Sleep(time.Duration(cfg.MetricsInterval) * time.Second)
	}
}

