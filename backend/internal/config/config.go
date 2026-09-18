package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"github.com/pelletier/go-toml/v2"
)

// Config holds all configuration for the application
type Config struct {
	// Server
	ServerPort    string        `yaml:"server_port" env:"SERVER_PORT"`
	ServerMode    string        `yaml:"server_mode" env:"SERVER_MODE"`
	ReadTimeout   time.Duration `yaml:"read_timeout" env:"READ_TIMEOUT"`
	WriteTimeout  time.Duration `yaml:"write_timeout" env:"WRITE_TIMEOUT"`
	ShutdownGrace time.Duration `yaml:"shutdown_grace" env:"SHUTDOWN_GRACE"`

	// Database
	DBHost     string `yaml:"db_host" env:"DB_HOST"`
	DBPort     string `yaml:"db_port" env:"DB_PORT"`
	DBUser     string `yaml:"db_user" env:"DB_USER"`
	DBPassword string `yaml:"db_password" env:"DB_PASSWORD"`
	DBName     string `yaml:"db_name" env:"DB_NAME"`
	DBSSLMode  string `yaml:"db_sslmode" env:"DB_SSLMODE"`

	// Redis
	RedisHost     string `yaml:"redis_host" env:"REDIS_HOST"`
	RedisPort     string `yaml:"redis_port" env:"REDIS_PORT"`
	RedisPassword string `yaml:"redis_password" env:"REDIS_PASSWORD"`
	RedisDB       int    `yaml:"redis_db" env:"REDIS_DB"`
	RedisPoolSize int    `yaml:"redis_pool_size" env:"REDIS_POOL_SIZE"`

	// JWT
	JWTSecret     string        `yaml:"jwt_secret" env:"JWT_SECRET"`
	JWTExpiration time.Duration `yaml:"jwt_expiration" env:"JWT_EXPIRATION"`

	// Logging
	LogLevel  string `yaml:"log_level" env:"LOG_LEVEL"`
	LogJSON   bool   `yaml:"log_json" env:"LOG_JSON"`
	LogOutput string `yaml:"log_output" env:"LOG_OUTPUT"`

	// Worker Pools
	MetricWorkers    int `yaml:"metric_workers" env:"METRIC_WORKERS"`
	AlertWorkers     int `yaml:"alert_workers" env:"ALERT_WORKERS"`
	LogWorkers       int `yaml:"log_workers" env:"LOG_WORKERS"`
	DiscoveryWorkers int `yaml:"discovery_workers" env:"DISCOVERY_WORKERS"`
	AIWorkers        int `yaml:"ai_workers" env:"AI_WORKERS"`
	InventoryWorkers int `yaml:"inventory_workers" env:"INVENTORY_WORKERS"`
	QueueBuffer      int `yaml:"queue_buffer" env:"QUEUE_BUFFER"`

	// Metrics
	MetricsInterval        int `yaml:"metrics_interval" env:"METRICS_INTERVAL"`
	HeartbeatInterval      int `yaml:"heartbeat_interval" env:"HEARTBEAT_INTERVAL"`
	HeartbeatRetryCount    int `yaml:"heartbeat_retry_count" env:"HEARTBEAT_RETRY_COUNT"`
	HeartbeatRetryInterval int `yaml:"heartbeat_retry_interval" env:"HEARTBEAT_RETRY_INTERVAL"`
	RetentionDays          int `yaml:"retention_days" env:"RETENTION_DAYS"`
	OfflineThresholdSec    int `yaml:"offline_threshold_sec" env:"OFFLINE_THRESHOLD_SEC"`

	// AI / OpenAI
	OpenAIAPIKey  string  `yaml:"openai_api_key" env:"OPENAI_API_KEY"`
	OpenAIModel   string  `yaml:"openai_model" env:"OPENAI_MODEL"`
	AITemperature float64 `yaml:"ai_temperature" env:"AI_TEMPERATURE"`
	AIMaxTokens   int     `yaml:"ai_max_tokens" env:"AI_MAX_TOKENS"`

	// WebSocket
	WSReadBufferSize  int           `yaml:"ws_read_buffer" env:"WS_READ_BUFFER"`
	WSWriteBufferSize int           `yaml:"ws_write_buffer" env:"WS_WRITE_BUFFER"`
	WSWriteWait       time.Duration `yaml:"ws_write_wait" env:"WS_WRITE_WAIT"`
	WSPongWait        time.Duration `yaml:"ws_pong_wait" env:"WS_PONG_WAIT"`
	WSPingInterval    time.Duration `yaml:"ws_ping_interval" env:"WS_PING_INTERVAL"`
	WSMaxMessageSize  int64         `yaml:"ws_max_message" env:"WS_MAX_MESSAGE"`

	// Security
	CORSOrigins      []string `yaml:"cors_origins" env:"CORS_ORIGINS"`
	RateLimitPerMin  int      `yaml:"rate_limit_per_min" env:"RATE_LIMIT_PER_MIN"`
	MaxLoginAttempts int      `yaml:"max_login_attempts" env:"MAX_LOGIN_ATTEMPTS"`
	EnforcementMode  string   `yaml:"enforcement_mode" env:"ENFORCEMENT_MODE"`
	CommandAllowlist string   `yaml:"command_allowlist" env:"COMMAND_ALLOWLIST"`

	// TLS
	TLSEnabled  bool   `yaml:"tls_enabled" env:"TLS_ENABLED"`
	MTLSEnabled bool   `yaml:"mtls_enabled" env:"MTLS_ENABLED"`
	TLSCertPath string `yaml:"tls_cert_path" env:"TLS_CERT_PATH"`
	TLSKeyPath  string `yaml:"tls_key_path" env:"TLS_KEY_PATH"`
	TLSCAPath   string `yaml:"tls_ca_path" env:"TLS_CA_PATH"`
	TLSPort     string `yaml:"tls_port" env:"TLS_PORT"`
}

var globalConfig *Config

// Get returns the global configuration
func Get() *Config {
	if globalConfig == nil {
		Load()
	}
	return globalConfig
}

// Load loads configuration from environment variables
func Load() {
	for _, envFile := range []string{".env", "backend/.env", "../.env", "../../.env", "../../../.env"} {
		if err := godotenv.Overload(envFile); err == nil {
			break
		}
	}
	globalConfig = &Config{
		// Server defaults
		ServerPort:    getEnv("SERVER_PORT", "8080"),
		ServerMode:    getEnv("SERVER_MODE", "release"),
		ReadTimeout:   getDuration("READ_TIMEOUT", 30*time.Second),
		WriteTimeout:  getDuration("WRITE_TIMEOUT", 30*time.Second),
		ShutdownGrace: getDuration("SHUTDOWN_GRACE", 15*time.Second),

		// Database defaults
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "infrapilot"),
		DBPassword: getEnv("DB_PASSWORD", "infrapilot"),
		DBName:     getEnv("DB_NAME", "infrapilot"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		// Redis defaults
		RedisHost:     getEnv("REDIS_HOST", "localhost"),
		RedisPort:     getEnv("REDIS_PORT", "6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getInt("REDIS_DB", 0),
		RedisPoolSize: getInt("REDIS_POOL_SIZE", 10),

		// JWT defaults
		JWTSecret:     getEnv("JWT_SECRET", "change-me-in-production"),
		JWTExpiration: getDuration("JWT_EXPIRATION", 24*time.Hour),

		// Logging defaults
		LogLevel:  getEnv("LOG_LEVEL", "info"),
		LogJSON:   getBool("LOG_JSON", false),
		LogOutput: getEnv("LOG_OUTPUT", "stdout"),

		// Worker defaults
		MetricWorkers:    getInt("METRIC_WORKERS", 5),
		AlertWorkers:     getInt("ALERT_WORKERS", 3),
		LogWorkers:       getInt("LOG_WORKERS", 3),
		DiscoveryWorkers: getInt("DISCOVERY_WORKERS", 2),
		AIWorkers:        getInt("AI_WORKERS", 2),
		InventoryWorkers: getInt("INVENTORY_WORKERS", 2),
		QueueBuffer:      getInt("QUEUE_BUFFER", 100),

		// Metrics defaults
		MetricsInterval:        getInt("METRICS_INTERVAL", 5),
		HeartbeatInterval:      getInt("HEARTBEAT_INTERVAL", 15),
		HeartbeatRetryCount:    getInt("HEARTBEAT_RETRY_COUNT", 3),
		HeartbeatRetryInterval: getInt("HEARTBEAT_RETRY_INTERVAL", 5),
		RetentionDays:          getInt("RETENTION_DAYS", 90),
		OfflineThresholdSec:    getInt("OFFLINE_THRESHOLD_SEC", 30),

		// AI defaults
		OpenAIAPIKey:  getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:   getEnv("OPENAI_MODEL", "gpt-4"),
		AITemperature: getFloat("AI_TEMPERATURE", 0.7),
		AIMaxTokens:   getInt("AI_MAX_TOKENS", 1024),

		// WebSocket defaults
		WSReadBufferSize:  getInt("WS_READ_BUFFER", 1024),
		WSWriteBufferSize: getInt("WS_WRITE_BUFFER", 1024),
		WSWriteWait:       getDuration("WS_WRITE_WAIT", 10*time.Second),
		WSPongWait:        getDuration("WS_PONG_WAIT", 60*time.Second),
		WSPingInterval:    getDuration("WS_PING_INTERVAL", 30*time.Second),
		WSMaxMessageSize:  int64(getInt("WS_MAX_MESSAGE", 512*1024)),

		// Security defaults
		CORSOrigins:      getEnvList("CORS_ORIGINS", []string{"*"}),
		RateLimitPerMin:  getInt("RATE_LIMIT_PER_MIN", 60),
		MaxLoginAttempts: getInt("MAX_LOGIN_ATTEMPTS", 5),
		EnforcementMode:  getEnv("ENFORCEMENT_MODE", "enforcing"),
		CommandAllowlist: getEnv("COMMAND_ALLOWLIST", ""),

		// TLS defaults
		TLSEnabled:  getBool("TLS_ENABLED", true),
		MTLSEnabled: getBool("MTLS_ENABLED", true),
		TLSCertPath: getEnv("TLS_CERT_PATH", "certs/server.crt"),
		TLSKeyPath:  getEnv("TLS_KEY_PATH", "certs/server.key"),
		TLSCAPath:   getEnv("TLS_CA_PATH", "certs/ca.crt"),
		TLSPort:     getEnv("TLS_PORT", "8443"),
	}

	// Try loading config.toml if available
	for _, tomlFile := range []string{"config.toml", "backend/config.toml", "../config.toml"} {
		if data, err := os.ReadFile(tomlFile); err == nil {
			var tomlCfg struct {
				Server struct {
					HTTPPort       int      `toml:"http_port"`
					GRPCPort       int      `toml:"grpc_port"`
					AllowedOrigins []string `toml:"allowed_origins"`
					TLS            struct {
						Enabled    bool   `toml:"enabled"`
						CACert     string `toml:"ca_cert"`
						ServerCert string `toml:"server_cert"`
						ServerKey  string `toml:"server_key"`
					} `toml:"tls"`
					Database struct {
						Host    string `toml:"host"`
						Port    int    `toml:"port"`
						User    string `toml:"user"`
						DBName  string `toml:"dbname"`
						SSLMode string `toml:"sslmode"`
					} `toml:"database"`
				} `toml:"server"`
			}
			if err := toml.Unmarshal(data, &tomlCfg); err == nil {
				if tomlCfg.Server.HTTPPort != 0 {
					globalConfig.ServerPort = strconv.Itoa(tomlCfg.Server.HTTPPort)
				}
				if tomlCfg.Server.Database.Host != "" {
					globalConfig.DBHost = tomlCfg.Server.Database.Host
				}
				if tomlCfg.Server.Database.Port != 0 {
					globalConfig.DBPort = strconv.Itoa(tomlCfg.Server.Database.Port)
				}
				if tomlCfg.Server.Database.User != "" {
					globalConfig.DBUser = tomlCfg.Server.Database.User
				}
				if tomlCfg.Server.Database.DBName != "" {
					globalConfig.DBName = tomlCfg.Server.Database.DBName
				}
				if len(tomlCfg.Server.AllowedOrigins) > 0 {
					globalConfig.CORSOrigins = tomlCfg.Server.AllowedOrigins
				}
			}
			break
		}
	}
}

// GetDSN returns the PostgreSQL connection string
func (c *Config) GetDSN() string {
	return fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		c.DBHost, c.DBUser, c.DBPassword, c.DBName, c.DBPort, c.DBSSLMode,
	)
}

// GetRedisAddr returns the Redis address
func (c *Config) GetRedisAddr() string {
	return fmt.Sprintf("%s:%s", c.RedisHost, c.RedisPort)
}

// Helper functions
func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

func getBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			return b
		}
	}
	return defaultVal
}

func getFloat(key string, defaultVal float64) float64 {
	if val := os.Getenv(key); val != "" {
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			return f
		}
	}
	return defaultVal
}

func getDuration(key string, defaultVal time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			return d
		}
	}
	return defaultVal
}

func getEnvList(key string, defaultVal []string) []string {
	if val := os.Getenv(key); val != "" {
		// Parse comma-separated list
		result := []string{}
		current := ""
		for _, ch := range val {
			if ch == ',' {
				if current != "" {
					result = append(result, current)
				}
				current = ""
			} else {
				current += string(ch)
			}
		}
		if current != "" {
			result = append(result, current)
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultVal
}

// Deprecated: Use config.Get() instead
func LoadEnv() {
	Load()
}

// Deprecated: Use config.Get().GetEnv() instead
func GetEnv(key string) string {
	return os.Getenv(key)
}

func init() {
	// Auto-load config at package init
	Load()
}

// Validate validates configuration settings in production
func (c *Config) Validate() error {
	if c.ServerMode == "release" {
		if c.JWTSecret == "change-me-in-production" || c.JWTSecret == "" {
			return fmt.Errorf("security check failed: JWT_SECRET must be set to a secure custom value in release mode")
		}
	}
	return nil
}
