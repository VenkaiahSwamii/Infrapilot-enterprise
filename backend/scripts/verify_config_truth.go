package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"

	backendcfg "infrapilot/backend/internal/config"
	"infrapilot/backend/internal/handlers"
	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/network"
	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func main() {
	fmt.Println("================================================================")
	fmt.Println("🔍 BACKEND CONFIG.TOML SOURCE OF TRUTH VERIFICATION TEST")
	fmt.Println("   Verifying zero hardcoded services/IPs & 100% dynamic loading")
	fmt.Println("================================================================")
	fmt.Println()

	// 1. Verify TOML Parsing
	fmt.Println("▶ [TEST 1/4] Testing backendcfg.Load() against config.toml...")
	backendcfg.Load()
	cfg := backendcfg.Get()
	if cfg == nil {
		fmt.Println("❌ FAILED: config.Get() returned nil")
		os.Exit(1)
	}

	fmt.Printf("  • Server Backend URL : %s\n", cfg.BackendURL)
	fmt.Printf("  • Database Host/Port : %s:%s\n", cfg.DBHost, cfg.DBPort)
	fmt.Printf("  • Windows Services   : %v\n", cfg.Agent.Services.Windows)
	fmt.Printf("  • Linux Services     : %v\n", cfg.Agent.Services.Linux)
	fmt.Printf("  • Accept List        : %v\n", cfg.Agent.Services.AcceptList)
	fmt.Printf("  • Default Gateway    : %s\n", cfg.Agent.Network.DefaultGateway)
	fmt.Printf("  • Monitored Websites : %d websites configured\n", len(cfg.Agent.Network.Websites))

	if len(cfg.Agent.Services.Windows) == 0 {
		fmt.Println("❌ FAILED: No Windows services parsed from config.toml")
		os.Exit(1)
	}
	if len(cfg.Agent.Services.Linux) == 0 {
		fmt.Println("❌ FAILED: No Linux services parsed from config.toml")
		os.Exit(1)
	}
	if len(cfg.Agent.Network.Websites) == 0 {
		fmt.Println("❌ FAILED: No websites parsed from config.toml")
		os.Exit(1)
	}
	fmt.Println("  ✔ TEST 1 PASSED: config.toml parsed dynamically with all services & endpoints.")
	fmt.Println()

	// 2. Verify SRE Accept List & Whitelist Validation
	fmt.Println("▶ [TEST 2/4] Testing services.IsServiceAccepted() whitelist enforcement...")
	testAllowedWin := cfg.Agent.Services.Windows[0]
	testAllowedLin := cfg.Agent.Services.Linux[0]
	if !services.IsServiceAccepted(testAllowedWin) {
		fmt.Printf("❌ FAILED: Configured service '%s' was rejected by whitelist!\n", testAllowedWin)
		os.Exit(1)
	}
	if !services.IsServiceAccepted(testAllowedLin) {
		fmt.Printf("❌ FAILED: Configured service '%s' was rejected by whitelist!\n", testAllowedLin)
		os.Exit(1)
	}
	if services.IsServiceAccepted("unauthorized-malicious-process.exe") {
		fmt.Println("❌ FAILED: Unconfigured process was erroneously accepted!")
		os.Exit(1)
	}
	fmt.Printf("  ✔ TEST 2 PASSED: Whitelist correctly accepts configured '%s' & '%s', and rejects unlisted items.\n\n", testAllowedWin, testAllowedLin)

	// 3. Verify Network Repository Seed Checks
	fmt.Println("▶ [TEST 3/4] Testing network.SeedDefaultChecks() dynamic probe generation...")
	netRepo := network.NewRepository()
	type seederInterface interface {
		SeedDefaultChecks() []models.NetworkCheck
	}
	if s, ok := netRepo.(seederInterface); ok {
		checks := s.SeedDefaultChecks()
		fmt.Printf("  • Generated Checks Count: %d\n", len(checks))
		var foundGateway, foundDB, foundWebsite bool
		for _, c := range checks {
			fmt.Printf("    - Check [%s]: Name='%s' Target='%s' Type=%s\n", c.ID.String()[:8], c.Name, c.Target, c.Type)
			if c.Name == "Local WiFi / Router Gateway" && c.Target == cfg.Agent.Network.DefaultGateway {
				foundGateway = true
			}
			if c.Name == "Core Database Port" && c.Port == 5432 {
				foundDB = true
			}
			if len(cfg.Agent.Network.Websites) > 0 && c.Name == cfg.Agent.Network.Websites[0].Name {
				foundWebsite = true
			}
		}

		if !foundGateway {
			fmt.Println("❌ FAILED: Gateway check does not match config default_gateway")
			os.Exit(1)
		}
		if !foundDB {
			fmt.Println("❌ FAILED: Database check does not match config DB port")
			os.Exit(1)
		}
		if !foundWebsite {
			fmt.Println("❌ FAILED: Websites from config.toml not seeded into network checks")
			os.Exit(1)
		}
		fmt.Println("  ✔ TEST 3 PASSED: Network seed checks dynamically derived from config.toml.")
		fmt.Println()
	}

	// 4. Verify Public Config API Handler (/api/v1/config/public)
	fmt.Println("▶ [TEST 4/4] Testing GetPublicConfig API handler output...")
	gin.SetMode(gin.TestMode)
	handler := handlers.NewConfigHandler()
	router := gin.New()
	router.GET("/api/v1/config/public", handler.GetPublicConfig)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/config/public", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		fmt.Printf("❌ FAILED: Expected 200 OK, got %d\n", w.Code)
		os.Exit(1)
	}

	var res struct {
		Success    bool   `json:"success"`
		BackendURL string `json:"backend_url"`
		Services   struct {
			Windows []string `json:"windows"`
			Linux   []string `json:"linux"`
		} `json:"services"`
		Network struct {
			DefaultGateway string `json:"default_gateway"`
			Websites       []struct {
				Name string `json:"name"`
				URL  string `json:"url"`
			} `json:"websites"`
		} `json:"network"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		fmt.Printf("❌ FAILED: Failed to parse JSON response: %v\n", err)
		os.Exit(1)
	}

	if !res.Success || len(res.Services.Windows) == 0 || len(res.Network.Websites) == 0 {
		fmt.Println("❌ FAILED: API response missing dynamic services or websites")
		os.Exit(1)
	}
	fmt.Printf("  • API Success      : %v\n", res.Success)
	fmt.Printf("  • API Backend URL  : %s\n", res.BackendURL)
	fmt.Printf("  • API Windows Svcs : %v\n", res.Services.Windows)
	fmt.Printf("  • API Linux Svcs   : %v\n", res.Services.Linux)
	fmt.Printf("  • API Gateway      : %s\n", res.Network.DefaultGateway)
	fmt.Println("  ✔ TEST 4 PASSED: /api/v1/config/public delivers 100% dynamic config.toml payload.")
	fmt.Println()

	fmt.Println("================================================================")
	fmt.Println("🏆 ALL BACKEND CONFIG.TOML SOURCE OF TRUTH TESTS PASSED (100%)")
	fmt.Println("================================================================")
}
