package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ConfigStore persists and loads agent config in JSON format at the agent's config path
type ConfigStore struct {
	configPath string
}

// NewConfigStore creates a store pointing at the given config file
func NewConfigStore(configPath string) *ConfigStore {
	return &ConfigStore{configPath: configPath}
}

// DefaultConfigPath returns the default path for config.json, isolating per-OS if needed
func DefaultConfigPath() string {
	osSpecificName := fmt.Sprintf("config_%s.json", runtime.GOOS)
	if resolved := FindConfigFile(osSpecificName); resolved != osSpecificName {
		if _, err := os.Stat(resolved); err == nil {
			return resolved
		}
	}
	if resolved := FindConfigFile("config.json"); resolved != "config.json" {
		if _, err := os.Stat(resolved); err == nil {
			return resolved
		}
	}

	// If running alongside executable in an installed directory or custom folder
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		if !strings.Contains(strings.ToLower(exeDir), "system32") {
			return filepath.Join(exeDir, "config.json")
		}
	}

	if runtime.GOOS == "windows" {
		progFiles := os.Getenv("ProgramFiles")
		if progFiles == "" {
			progFiles = `C:\Program Files`
		}
		installDir := filepath.Join(progFiles, "InfraPilot")
		if _, err := os.Stat(installDir); err == nil {
			return filepath.Join(installDir, "config.json")
		}
	}

	wd, err := os.Getwd()
	if err != nil {
		return "config.json"
	}
	return filepath.Join(wd, "config.json")
}

// EnterpriseConfig is the runtime configuration for the agent
type EnterpriseConfig struct {
	Server            string `json:"backend_url"`
	MachineID         string `json:"machine_id"`
	APIKey            string `json:"api_key"`
	KeyVersion        int    `json:"key_version"`
	Organization      string `json:"organization"`
	MetricsInterval   int    `json:"interval"`
	HeartbeatInterval int    `json:"heartbeat_interval"`
	OS                string `json:"os,omitempty"`
}

// Load loads config.json into EnterpriseConfig
func (s *ConfigStore) Load() (*EnterpriseConfig, error) {
	data, err := os.ReadFile(s.configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config: %w", err)
	}
	var cfg EnterpriseConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}
	return &cfg, nil
}

// Save writes EnterpriseConfig to config.json
func (s *ConfigStore) Save(cfg *EnterpriseConfig) error {
	if cfg.OS == "" {
		cfg.OS = runtime.GOOS
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}
	if err := os.WriteFile(s.configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}
	return nil
}

// Exists checks if the config file exists
func (s *ConfigStore) Exists() bool {
	_, err := os.Stat(s.configPath)
	return err == nil
}
