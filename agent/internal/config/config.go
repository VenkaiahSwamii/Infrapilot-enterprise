package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"
)

type TLSConfig struct {
	TLSEnabled  bool   `yaml:"tls_enabled" json:"tls_enabled" toml:"tls_enabled"`
	MTLSEnabled bool   `yaml:"mtls_enabled" json:"mtls_enabled" toml:"mtls_enabled"`
	CACert      string `yaml:"ca_cert" json:"ca_cert" toml:"ca_cert"`
	AgentCert   string `yaml:"agent_cert" json:"agent_cert" toml:"agent_cert"`
	AgentKey    string `yaml:"agent_key" json:"agent_key" toml:"agent_key"`
	CAPath      string `yaml:"ca_path" json:"ca_path" toml:"ca_path"`
	CertPath    string `yaml:"cert_path" json:"cert_path" toml:"cert_path"`
	KeyPath     string `yaml:"key_path" json:"key_path" toml:"key_path"`
}

type DiskTOMLConfig struct {
	TargetMountPoint         string   `yaml:"target_mount_point" json:"target_mount_point" toml:"target_mount_point"`
	ReactiveThresholdPercent float64  `yaml:"reactive_threshold_percent" json:"reactive_threshold_percent" toml:"reactive_threshold_percent"`
	PredictiveHours          float64  `yaml:"predictive_hours" json:"predictive_hours" toml:"predictive_hours"`
	DenyList                 []string `yaml:"deny_list" json:"deny_list" toml:"deny_list"`
}

type ServicesTOMLConfig struct {
	AcceptList []string `yaml:"accept_list" json:"accept_list" toml:"accept_list"`
}

type LatencyTOMLConfig struct {
	TargetGateway       string   `yaml:"target_gateway" json:"target_gateway" toml:"target_gateway"`
	BaselineP95Ms       float64  `yaml:"baseline_p95_ms" json:"baseline_p95_ms" toml:"baseline_p95_ms"`
	ThresholdMultiplier float64  `yaml:"threshold_multiplier" json:"threshold_multiplier" toml:"threshold_multiplier"`
	AlertWindowMinutes  int      `yaml:"alert_window_minutes" json:"alert_window_minutes" toml:"alert_window_minutes"`
	AcceptList          []string `yaml:"accept_list" json:"accept_list" toml:"accept_list"`
}

type LoggingTOMLConfig struct {
	LogLevel      string `yaml:"log_level" json:"log_level" toml:"log_level"`
	LogFormat     string `yaml:"log_format" json:"log_format" toml:"log_format"`
	LogPath       string `yaml:"log_path" json:"log_path" toml:"log_path"`
	DailyRotation bool   `yaml:"daily_rotation" json:"daily_rotation" toml:"daily_rotation"`
	MaxAgeDays    int    `yaml:"max_age_days" json:"max_age_days" toml:"max_age_days"`
	MaxSizeMB     int    `yaml:"max_size_mb" json:"max_size_mb" toml:"max_size_mb"`
}

type CollectorsTOMLConfig struct {
	System    bool `yaml:"system" json:"system" toml:"system"`
	Processes bool `yaml:"processes" json:"processes" toml:"processes"`
	Docker    bool `yaml:"docker" json:"docker" toml:"docker"`
	K8s       bool `yaml:"kubernetes" json:"kubernetes" toml:"kubernetes"`
	Logs      bool `yaml:"logs" json:"logs" toml:"logs"`
	Security  bool `yaml:"security" json:"security" toml:"security"`
}

type Config struct {
	// Flat fields for backwards compatibility
	TLSEnabled  bool   `yaml:"tls_enabled" json:"tls_enabled" toml:"tls_enabled"`
	MTLSEnabled bool   `yaml:"mtls_enabled" json:"mtls_enabled" toml:"mtls_enabled"`
	CertPath    string `yaml:"cert_path" json:"cert_path" toml:"cert_path"`
	KeyPath     string `yaml:"key_path" json:"key_path" toml:"key_path"`
	CAPath      string `yaml:"ca_path" json:"ca_path" toml:"ca_path"`

	// Nested TLS table section [tls]
	TLS TLSConfig `yaml:"tls" json:"tls" toml:"tls"`

	// Nested Disk table section [disk]
	Disk DiskTOMLConfig `yaml:"disk" json:"disk" toml:"disk"`

	// Nested Services table section [services]
	Services ServicesTOMLConfig `yaml:"services" json:"services" toml:"services"`

	// Nested Latency table section [latency]
	Latency LatencyTOMLConfig `yaml:"latency" json:"latency" toml:"latency"`

	// Nested Logging table section [logging]
	Logging LoggingTOMLConfig `yaml:"logging" json:"logging" toml:"logging"`

	// Nested Collectors table section [collectors]
	Collectors CollectorsTOMLConfig `yaml:"collectors" json:"collectors" toml:"collectors"`

	ServerAddress      string `yaml:"server_address" json:"server_address" toml:"server_address"`
	MachineID          string `yaml:"machine_id" json:"machine_id" toml:"machine_id"`
	APIKey             string `yaml:"api_key" json:"api_key" toml:"api_key"`
	KeyVersion         int    `yaml:"key_version" json:"key_version" toml:"key_version"`
	EnrollmentToken    string `yaml:"enrollment_token" json:"enrollment_token" toml:"enrollment_token"`
	BackendURL         string `yaml:"backend_url" json:"backend_url" toml:"backend_url"`
	Interval           int    `yaml:"interval" json:"interval" toml:"interval"`
	RegisteredHostname string `yaml:"registered_hostname" json:"registered_hostname" toml:"registered_hostname"`
	MachineName        string `yaml:"machine_name" json:"machine_name" toml:"machine_name"`
}

var AppConfig *Config

func Get() *Config {
	if AppConfig == nil {
		// Config should be loaded before use
		return &Config{}
	}
	return AppConfig
}

// AutoDetectMountPoint returns the appropriate target mount point for the current OS if set to "auto", empty, or default.
// On Windows it returns "C:", on Linux/Ubuntu it returns "/".
func AutoDetectMountPoint(target string) string {
	target = strings.TrimSpace(target)
	if target == "" || strings.EqualFold(target, "auto") || strings.EqualFold(target, "default") {
		if runtime.GOOS == "windows" {
			return "C:"
		}
		return "/"
	}
	if runtime.GOOS == "windows" && (target == "/" || target == "\\") {
		return "C:"
	}
	if runtime.GOOS != "windows" && (strings.EqualFold(target, "c:") || strings.EqualFold(target, "c")) {
		return "/"
	}
	return target
}

func syncTLSConfig(cfg *Config) {
	if cfg.TLS.TLSEnabled {
		cfg.TLSEnabled = true
	} else if cfg.TLSEnabled {
		cfg.TLS.TLSEnabled = true
	}

	if cfg.TLS.MTLSEnabled {
		cfg.MTLSEnabled = true
	} else if cfg.MTLSEnabled {
		cfg.TLS.MTLSEnabled = true
	}

	if cfg.TLS.CACert != "" {
		cfg.CAPath = cfg.TLS.CACert
		cfg.TLS.CAPath = cfg.TLS.CACert
	} else if cfg.TLS.CAPath != "" {
		cfg.CAPath = cfg.TLS.CAPath
		cfg.TLS.CACert = cfg.TLS.CAPath
	} else if cfg.CAPath != "" {
		cfg.TLS.CACert = cfg.CAPath
		cfg.TLS.CAPath = cfg.CAPath
	}

	if cfg.TLS.AgentCert != "" {
		cfg.CertPath = cfg.TLS.AgentCert
		cfg.TLS.CertPath = cfg.TLS.AgentCert
	} else if cfg.TLS.CertPath != "" {
		cfg.CertPath = cfg.TLS.CertPath
		cfg.TLS.AgentCert = cfg.TLS.CertPath
	} else if cfg.CertPath != "" {
		cfg.TLS.AgentCert = cfg.CertPath
		cfg.TLS.CertPath = cfg.CertPath
	}

	if cfg.TLS.AgentKey != "" {
		cfg.KeyPath = cfg.TLS.AgentKey
		cfg.TLS.KeyPath = cfg.TLS.AgentKey
	} else if cfg.TLS.KeyPath != "" {
		cfg.KeyPath = cfg.TLS.KeyPath
		cfg.TLS.AgentKey = cfg.TLS.KeyPath
	} else if cfg.KeyPath != "" {
		cfg.TLS.AgentKey = cfg.KeyPath
		cfg.TLS.KeyPath = cfg.KeyPath
	}
}

// FindConfigFile searches for a configuration file across multiple candidate directories:
// 1. Exact path provided (if non-empty and exists)
// 2. Current working directory: ./<filename>
// 3. Directory containing the running executable: <execDir>/<filename>
// 4. Standard installation directory (e.g., C:\Program Files\InfraPilot on Windows, /etc/infrapilot or /opt/infrapilot on Linux)
func FindConfigFile(filename string) string {
	if filename == "" {
		filename = "config.toml"
	}
	if filepath.IsAbs(filename) {
		if _, err := os.Stat(filename); err == nil {
			return filename
		}
	}
	// Check current working directory
	if _, err := os.Stat(filename); err == nil {
		return filename
	}

	// Check alongside running executable
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidate := filepath.Join(exeDir, filename)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	// Check OS-specific standard directories
	if runtime.GOOS == "windows" {
		progFiles := os.Getenv("ProgramFiles")
		if progFiles == "" {
			progFiles = `C:\Program Files`
		}
		candidate := filepath.Join(progFiles, "InfraPilot", filename)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	} else {
		for _, dir := range []string{"/etc/infrapilot", "/opt/infrapilot"} {
			candidate := filepath.Join(dir, filename)
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
		}
	}

	return filename
}

func LoadConfig(filePath string) (*Config, error) {
	resolved := FindConfigFile(filePath)
	file, err := os.Open(resolved)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var cfg Config
	decoder := toml.NewDecoder(file)
	if err := decoder.Decode(&cfg); err != nil {
		// Fallback to YAML if TOML decoding fails
		file.Seek(0, 0)
		yamlDecoder := yaml.NewDecoder(file)
		if yamlErr := yamlDecoder.Decode(&cfg); yamlErr != nil {
			return nil, err
		}
	}

	syncTLSConfig(&cfg)
	AppConfig = &cfg
	return AppConfig, nil
}

func LoadConfigTOML(filePath string) (*Config, error) {
	resolved := FindConfigFile(filePath)
	file, err := os.Open(resolved)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var cfg Config
	decoder := toml.NewDecoder(file)
	if err := decoder.Decode(&cfg); err != nil {
		return nil, err
	}

	syncTLSConfig(&cfg)
	AppConfig = &cfg
	return AppConfig, nil
}

func LoadConfigJSON(filePath string) (*Config, error) {
	resolved := FindConfigFile(filePath)
	file, err := os.Open(resolved)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var cfg Config
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&cfg); err != nil {
		return nil, err
	}

	syncTLSConfig(&cfg)
	AppConfig = &cfg
	return AppConfig, nil
}

func SaveConfigJSON(filePath string, cfg *Config) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(cfg)
}

func GetAllowedCommands() []string {
	return []string{
		"echo", "ls", "dir", "cd", "pwd",
		"whoami", "hostname", "date", "time",
		"systeminfo", "ipconfig", "netstat", "ping",
		"tracert", "nslookup", "tasklist", "ps",
		"df", "free", "uptime", "uname",
		"cat", "head", "tail", "grep", "find",
		"wc", "sort", "uniq", "awk", "sed",
		"docker", "kubectl", "kubens", "kubectx", "helm",
		"git", "npm", "node", "python", "python3",
		"curl", "wget", "ssh", "scp", "rsync",
		"powershell", "pwsh", "cmd", "sudo", "rm", "del", "rmdir", "cleanmgr", "systemctl", "journalctl",
	}
}

