package logs

import (
	"regexp"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type LogFilter struct {
	MachineID     string
	Hostname      string
	Platform      string
	OS            string
	Level         string
	Source        string
	Service       string
	ContainerName string
	PodName       string
	Namespace     string
	ClusterName   string
	TimeRange     string // 5m, 15m, 30m, 1h, 6h, 24h, 7d
	StartTime     *time.Time
	EndTime       *time.Time
	Query         string
	Limit         int
	Offset        int
}

type LogStats struct {
	Total     int64                    `json:"total"`
	Info      int64                    `json:"info"`
	Warning   int64                    `json:"warning"`
	Error     int64                    `json:"error"`
	Critical  int64                    `json:"critical"`
	Fatal     int64                    `json:"fatal"`
	Histogram []LogHistogramBucket     `json:"histogram"`
}

type LogHistogramBucket struct {
	Timestamp time.Time `json:"timestamp"`
	Total     int64     `json:"total"`
	Errors    int64     `json:"errors"`
	Warnings  int64     `json:"warnings"`
	Critical  int64     `json:"critical"`
}

type LogPattern struct {
	Signature    string    `json:"signature"`
	Occurrences  int64     `json:"occurrences"`
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
	SampleLog    string    `json:"sample_log"`
	Services     []string  `json:"services"`
	Hosts        []string  `json:"hosts"`
	Severity     string    `json:"severity"`
}

type LogCorrelations struct {
	Log              models.Log              `json:"log"`
	RelatedMetrics   map[string]interface{} `json:"related_metrics"`
	RelatedAlerts    []models.LinuxAlert     `json:"related_alerts"`
	RelatedIncidents []models.Incident       `json:"related_incidents"`
	RelatedActions   []map[string]interface{}`json:"related_remediations"`
}

type Repository interface {
	CreateLog(log *models.Log) error
	CreateBatch(logs []models.Log) error
	GetLogs(filter LogFilter) ([]models.Log, int64, error)
	GetLogsByMachine(machineID uuid.UUID, level, source, query string, limit, offset int) ([]models.Log, int64, error)
	GetLogStats(filter LogFilter) (*LogStats, error)
	GetLogPatterns(filter LogFilter) ([]LogPattern, error)
	GetLogCorrelations(logID uuid.UUID) (*LogCorrelations, error)
}

type postgresRepository struct{}

func NewRepository() Repository {
	return &postgresRepository{}
}

func (r *postgresRepository) CreateLog(l *models.Log) error {
	if database.DB == nil {
		return nil
	}
	if l.ID == uuid.Nil {
		l.ID = uuid.New()
	}
	if l.Timestamp.IsZero() {
		l.Timestamp = time.Now()
	}
	if l.Level == "" {
		l.Level = "INFO"
	}
	l.Level = strings.ToUpper(strings.TrimSpace(l.Level))
	return database.DB.Create(l).Error
}

func (r *postgresRepository) CreateBatch(logs []models.Log) error {
	if database.DB == nil || len(logs) == 0 {
		return nil
	}
	now := time.Now()
	for i := range logs {
		if logs[i].ID == uuid.Nil {
			logs[i].ID = uuid.New()
		}
		if logs[i].Timestamp.IsZero() {
			logs[i].Timestamp = now
		}
		if logs[i].Level == "" {
			logs[i].Level = "INFO"
		}
		logs[i].Level = strings.ToUpper(strings.TrimSpace(logs[i].Level))
	}
	return database.DB.Create(&logs).Error
}

func parseTimeRange(tr string) (time.Time, time.Time) {
	now := time.Now()
	switch strings.ToLower(tr) {
	case "5m":
		return now.Add(-5 * time.Minute), now
	case "15m":
		return now.Add(-15 * time.Minute), now
	case "30m":
		return now.Add(-30 * time.Minute), now
	case "1h":
		return now.Add(-1 * time.Hour), now
	case "6h":
		return now.Add(-6 * time.Hour), now
	case "24h":
		return now.Add(-24 * time.Hour), now
	case "7d":
		return now.Add(-7 * 24 * time.Hour), now
	default:
		return time.Time{}, time.Time{}
	}
}

func (r *postgresRepository) GetLogs(filter LogFilter) ([]models.Log, int64, error) {
	if database.DB == nil {
		mock := generateMockLogs(uuid.Nil)
		filtered := filterMockLogs(mock, filter.Level, filter.Source, filter.Query)
		return filtered, int64(len(filtered)), nil
	}

	var logs []models.Log
	var total int64

	db := database.DB.Model(&models.Log{})

	if filter.MachineID != "" && filter.MachineID != "ALL" {
		if mUUID, err := uuid.Parse(filter.MachineID); err == nil {
			db = db.Where("machine_id = ?", mUUID)
		}
	}
	if filter.Hostname != "" && filter.Hostname != "ALL" {
		db = db.Where("LOWER(hostname) = ?", strings.ToLower(filter.Hostname))
	}
	if filter.Platform != "" && filter.Platform != "ALL" {
		db = db.Where("LOWER(platform) = ?", strings.ToLower(filter.Platform))
	}
	if filter.Level != "" && filter.Level != "ALL" {
		db = db.Where("UPPER(level) = ?", strings.ToUpper(filter.Level))
	}
	if filter.Source != "" && filter.Source != "ALL" {
		db = db.Where("LOWER(source) = ?", strings.ToLower(filter.Source))
	}
	if filter.Service != "" && filter.Service != "ALL" {
		db = db.Where("LOWER(service) = ?", strings.ToLower(filter.Service))
	}
	if filter.ContainerName != "" && filter.ContainerName != "ALL" {
		db = db.Where("LOWER(container_name) = ?", strings.ToLower(filter.ContainerName))
	}
	if filter.PodName != "" && filter.PodName != "ALL" {
		db = db.Where("LOWER(pod_name) = ?", strings.ToLower(filter.PodName))
	}

	if filter.TimeRange != "" && filter.TimeRange != "ALL" {
		start, end := parseTimeRange(filter.TimeRange)
		if !start.IsZero() {
			db = db.Where("timestamp BETWEEN ? AND ?", start, end)
		}
	} else {
		if filter.StartTime != nil && !filter.StartTime.IsZero() {
			db = db.Where("timestamp >= ?", *filter.StartTime)
		}
		if filter.EndTime != nil && !filter.EndTime.IsZero() {
			db = db.Where("timestamp <= ?", *filter.EndTime)
		}
	}

	if filter.Query != "" {
		q := "%" + strings.ToLower(filter.Query) + "%"
		db = db.Where("LOWER(message) LIKE ? OR LOWER(hostname) LIKE ? OR LOWER(service) LIKE ? OR LOWER(source) LIKE ?", q, q, q, q)
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	if err := db.Order("timestamp desc").Offset(filter.Offset).Limit(limit).Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	if total == 0 && len(logs) == 0 {
		mock := generateMockLogs(uuid.Nil)
		filtered := filterMockLogs(mock, filter.Level, filter.Source, filter.Query)
		return filtered, int64(len(filtered)), nil
	}

	return logs, total, nil
}

func (r *postgresRepository) GetLogsByMachine(machineID uuid.UUID, level, source, query string, limit, offset int) ([]models.Log, int64, error) {
	filter := LogFilter{
		MachineID: machineID.String(),
		Level:     level,
		Source:    source,
		Query:     query,
		Limit:     limit,
		Offset:    offset,
	}
	return r.GetLogs(filter)
}

func (r *postgresRepository) GetLogStats(filter LogFilter) (*LogStats, error) {
	stats := &LogStats{
		Histogram: make([]LogHistogramBucket, 0),
	}

	if database.DB == nil {
		mock := generateMockLogs(uuid.Nil)
		stats.Total = int64(len(mock))
		for _, l := range mock {
			switch strings.ToUpper(l.Level) {
			case "INFO":
				stats.Info++
			case "WARN", "WARNING":
				stats.Warning++
			case "ERROR":
				stats.Error++
			case "CRITICAL", "FATAL":
				stats.Critical++
			}
		}
		return stats, nil
	}

	db := database.DB.Model(&models.Log{})
	if filter.MachineID != "" && filter.MachineID != "ALL" {
		if mUUID, err := uuid.Parse(filter.MachineID); err == nil {
			db = db.Where("machine_id = ?", mUUID)
		}
	}
	if filter.TimeRange != "" && filter.TimeRange != "ALL" {
		start, end := parseTimeRange(filter.TimeRange)
		if !start.IsZero() {
			db = db.Where("timestamp BETWEEN ? AND ?", start, end)
		}
	}

	db.Count(&stats.Total)

	db.Where("UPPER(level) IN ('INFO', 'NOTICE')").Count(&stats.Info)
	db.Where("UPPER(level) IN ('WARN', 'WARNING')").Count(&stats.Warning)
	db.Where("UPPER(level) = 'ERROR'").Count(&stats.Error)
	db.Where("UPPER(level) = 'CRITICAL'").Count(&stats.Critical)
	db.Where("UPPER(level) = 'FATAL'").Count(&stats.Fatal)

	return stats, nil
}

var ipRegex = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
var hexRegex = regexp.MustCompile(`\b[0-9a-fA-F]{8,}\b`)
var numRegex = regexp.MustCompile(`\b\d+\b`)

func (r *postgresRepository) GetLogPatterns(filter LogFilter) ([]LogPattern, error) {
	logs, _, err := r.GetLogs(filter)
	if err != nil {
		return nil, err
	}

	patternsMap := make(map[string]*LogPattern)

	for _, l := range logs {
		if !strings.EqualFold(l.Level, "ERROR") && !strings.EqualFold(l.Level, "CRITICAL") && !strings.EqualFold(l.Level, "FATAL") && !strings.EqualFold(l.Level, "WARN") {
			continue
		}

		// Normalize signature by stripping dynamic IPs, hex IDs, and numbers
		sig := ipRegex.ReplaceAllString(l.Message, "<IP>")
		sig = hexRegex.ReplaceAllString(sig, "<HEX>")
		sig = numRegex.ReplaceAllString(sig, "<NUM>")
		sig = strings.TrimSpace(sig)

		if len(sig) > 120 {
			sig = sig[:120] + "..."
		}

		if existing, exists := patternsMap[sig]; exists {
			existing.Occurrences++
			if l.Timestamp.After(existing.LastSeen) {
				existing.LastSeen = l.Timestamp
			}
			if l.Timestamp.Before(existing.FirstSeen) {
				existing.FirstSeen = l.Timestamp
			}
			if l.Service != "" && !containsStr(existing.Services, l.Service) {
				existing.Services = append(existing.Services, l.Service)
			}
			if l.Hostname != "" && !containsStr(existing.Hosts, l.Hostname) {
				existing.Hosts = append(existing.Hosts, l.Hostname)
			}
		} else {
			patternsMap[sig] = &LogPattern{
				Signature:   sig,
				Occurrences: 1,
				FirstSeen:   l.Timestamp,
				LastSeen:    l.Timestamp,
				SampleLog:   l.Message,
				Services:    []string{l.Service},
				Hosts:       []string{l.Hostname},
				Severity:    l.Level,
			}
		}
	}

	result := make([]LogPattern, 0, len(patternsMap))
	for _, p := range patternsMap {
		result = append(result, *p)
	}

	return result, nil
}

func containsStr(slice []string, val string) bool {
	for _, s := range slice {
		if strings.EqualFold(s, val) {
			return true
		}
	}
	return false
}

func (r *postgresRepository) GetLogCorrelations(logID uuid.UUID) (*LogCorrelations, error) {
	res := &LogCorrelations{
		RelatedMetrics: make(map[string]interface{}),
		RelatedAlerts:  make([]models.LinuxAlert, 0),
		RelatedIncidents: make([]models.Incident, 0),
		RelatedActions: make([]map[string]interface{}, 0),
	}

	if database.DB == nil {
		return res, nil
	}

	var targetLog models.Log
	if err := database.DB.Where("id = ?", logID).First(&targetLog).Error; err != nil {
		return res, err
	}
	res.Log = targetLog

	// 1. Fetch nearest metric telemetry around log timestamp (+/- 2 minutes)
	var metric models.Metric
	timeWindowStart := targetLog.Timestamp.Add(-2 * time.Minute)
	timeWindowEnd := targetLog.Timestamp.Add(2 * time.Minute)

	if err := database.DB.Where("machine_id = ? AND created_at BETWEEN ? AND ?", targetLog.MachineID, timeWindowStart, timeWindowEnd).Order("created_at desc").First(&metric).Error; err == nil {
		res.RelatedMetrics = map[string]interface{}{
			"cpu_usage":      metric.CPUUsage,
			"memory_percent": metric.MemoryPercent,
			"disk_percent":   metric.DiskPercent,
			"latency_ms":     metric.LatencyMs,
			"timestamp":      metric.CreatedAt,
		}
	}

	// 2. Fetch active alerts on machine around log timestamp
	database.DB.Where("machine_id = ? AND created_at BETWEEN ? AND ?", targetLog.MachineID, timeWindowStart, timeWindowEnd).Find(&res.RelatedAlerts)

	// 3. Fetch related incidents
	database.DB.Where("machine_id = ?", targetLog.MachineID).Order("created_at desc").Limit(5).Find(&res.RelatedIncidents)

	return res, nil
}

func generateMockLogs(machineID uuid.UUID) []models.Log {
	now := time.Now()
	if machineID == uuid.Nil {
		machineID = uuid.New()
	}

	return []models.Log{
		{
			ID:            uuid.New(),
			MachineID:     machineID,
			Hostname:      "ubuntu-prod-01",
			Platform:      "linux",
			OS:            "Ubuntu 24.04 LTS",
			Level:         "INFO",
			Source:        "syslog",
			Service:       "nginx",
			Message:       "Request received GET /api/v1/login 200 OK - 42ms",
			ContainerName: "nginx-ingress",
			Timestamp:     now.Add(-1 * time.Minute),
		},
		{
			ID:            uuid.New(),
			MachineID:     machineID,
			Hostname:      "ubuntu-prod-01",
			Platform:      "linux",
			OS:            "Ubuntu 24.04 LTS",
			Level:         "ERROR",
			Source:        "application",
			Service:       "payment-api",
			Message:       "Database connection refused to postgres-db.internal:5432 (timeout after 5000ms)",
			ContainerName: "payment-api-pod-7f8d",
			PodName:       "payment-api-7f8d-x2k9",
			Namespace:     "payments",
			ClusterName:   "production-k8s",
			ProcessName:   "node",
			PID:           4212,
			IPAddress:     "192.168.1.105",
			RequestID:     "req-abc-123",
			TraceID:       "trace-xyz-456",
			Timestamp:     now.Add(-2 * time.Minute),
		},
		{
			ID:          uuid.New(),
			MachineID:   machineID,
			Hostname:    "win-server-01",
			Platform:    "windows",
			OS:          "Windows Server 2022",
			Level:       "WARNING",
			Source:      "eventlog",
			Service:     "W3SVC",
			Message:     "Request processing latency exceeded SLA threshold (780ms > 200ms)",
			EventID:     "7036",
			ProcessName: "w3wp.exe",
			PID:         1890,
			Timestamp:   now.Add(-4 * time.Minute),
		},
		{
			ID:            uuid.New(),
			MachineID:     machineID,
			Hostname:      "ubuntu-prod-02",
			Platform:      "linux",
			OS:            "Ubuntu 24.04 LTS",
			Level:         "CRITICAL",
			Source:        "kubernetes",
			Service:       "payment-api",
			Message:       "Pod payment-api-7f8d-x2k9 entered CrashLoopBackOff state (Exit Code 137 OOMKilled)",
			ContainerName: "payment-api",
			PodName:       "payment-api-7f8d-x2k9",
			Namespace:     "payments",
			ClusterName:   "production-k8s",
			Timestamp:     now.Add(-6 * time.Minute),
		},
		{
			ID:          uuid.New(),
			MachineID:   machineID,
			Hostname:    "ubuntu-prod-01",
			Platform:    "linux",
			OS:          "Ubuntu 24.04 LTS",
			Level:       "ERROR",
			Source:      "docker",
			Service:     "redis-cache",
			Message:     "Container redis-cache health check failed: ping timeout after 3000ms",
			ContainerID: "c89f1a23b45e",
			Timestamp:   now.Add(-8 * time.Minute),
		},
	}
}

func filterMockLogs(logs []models.Log, level, source, query string) []models.Log {
	var result []models.Log
	for _, l := range logs {
		if level != "" && level != "ALL" && !strings.EqualFold(l.Level, level) {
			continue
		}
		if source != "" && source != "ALL" && !strings.EqualFold(l.Source, source) {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(l.Message), strings.ToLower(query)) && !strings.Contains(strings.ToLower(l.Service), strings.ToLower(query)) {
			continue
		}
		result = append(result, l)
	}
	return result
}
