package config

import (
	"runtime"
	"testing"

	"github.com/pelletier/go-toml/v2"
)

// TestAgentConfigSourceOfTruth verifies that agent reads exclusively from config.toml
// and does NOT fall back to obsolete hardcoded service arrays.
func TestAgentConfigSourceOfTruth(t *testing.T) {
	t.Run("Agent dynamically parses custom services from TOML and ignores legacy hardcoding", func(t *testing.T) {
		customTOML := `
[services]
windows = ["CustomAppWindows99", "UniqueSvcWin88"]
linux = ["custom-linux-daemon.service", "unique-app.service"]
accept_list = ["CustomAppWindows99", "custom-linux-daemon.service"]
`
		var cfg Config
		err := toml.Unmarshal([]byte(customTOML), &cfg)
		if err != nil {
			t.Fatalf("Failed to unmarshal custom TOML: %v", err)
		}

		monitored := cfg.GetMonitoredServices()
		if runtime.GOOS == "windows" {
			if len(monitored) != 2 || monitored[0] != "CustomAppWindows99" || monitored[1] != "UniqueSvcWin88" {
				t.Fatalf("Expected Windows custom services from config, got: %v", monitored)
			}
			// Verify it does NOT contain old hardcoded Spooler if not configured
			for _, s := range monitored {
				if s == "Spooler" {
					t.Fatalf("Found unexpected hardcoded 'Spooler' in monitored services!")
				}
			}
		} else {
			if len(monitored) != 2 || monitored[0] != "custom-linux-daemon.service" {
				t.Fatalf("Expected Linux custom services from config, got: %v", monitored)
			}
			// Verify it does NOT contain old hardcoded ssh.service if not configured
			for _, s := range monitored {
				if s == "ssh.service" {
					t.Fatalf("Found unexpected hardcoded 'ssh.service' in monitored services!")
				}
			}
		}

		// Verify accept list
		acceptList := cfg.GetAcceptList()
		hasCustom := false
		for _, a := range acceptList {
			if a == "CustomAppWindows99" || a == "custom-linux-daemon.service" {
				hasCustom = true
			}
		}
		if !hasCustom {
			t.Fatalf("Expected accept list to contain custom services, got: %v", acceptList)
		}

		// Verify that unconfigured service is NOT in accept list
		for _, a := range acceptList {
			if a == "unconfigured-unknown-service" {
				t.Fatalf("Found unconfigured service in accept list!")
			}
		}
	})
}
