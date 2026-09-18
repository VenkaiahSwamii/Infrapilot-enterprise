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
	wd, err := os.Getwd()
	if err != nil {
		return "config.json"
	}
	osSpecific := filepath.Join(wd, fmt.Sprintf("config_%s.json", runtime.GOOS))
	if _, err := os.Stat(osSpecific); err == nil {
		return osSpecific
	}
	baseConfig := filepath.Join(wd, "config.json")
	if data, err := os.ReadFile(baseConfig); err == nil {
		var peek struct {
			OS string `json:"os"`
		}
		if err := json.Unmarshal(data, &peek); err == nil && peek.OS != "" && !strings.EqualFold(peek.OS, runtime.GOOS) {
			return osSpecific
		}
	}
	return baseConfig
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
