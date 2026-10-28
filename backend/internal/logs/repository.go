package logs

import (
	"regexp"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
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

	// Pillar 2: Dynamic Extraction Rules
	GetExtractionRules() ([]models.ExtractionRule, error)
	CreateExtractionRule(rule *models.ExtractionRule) error
	UpdateExtractionRule(rule *models.ExtractionRule) error
	DeleteExtractionRule(id uuid.UUID) error
	ToggleExtractionRule(id uuid.UUID) (*models.ExtractionRule, error)
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
	end := now.Add(10 * time.Minute) // 10 min buffer for client-agent clock differences
	switch strings.ToLower(tr) {
	case "5m":
		return now.Add(-5 * time.Minute), end
	case "15m":
		return now.Add(-15 * time.Minute), end
	case "30m":
		return now.Add(-30 * time.Minute), end
	case "1h":
		return now.Add(-1 * time.Hour), end
	case "6h":
		return now.Add(-6 * time.Hour), end
	case "24h":
		return now.Add(-24 * time.Hour), end
	case "7d":
		return now.Add(-7 * 24 * time.Hour), end
	default:
		return time.Time{}, time.Time{}
	}
}

// buildLogQuery dynamically applies all filter criteria with proper trimming, case-insensitivity, and tokenized multi-word search
func buildLogQuery(db *gorm.DB, filter LogFilter, excludeLevel bool) *gorm.DB {
	// 1. Machine ID / Hostname
	mID := strings.TrimSpace(filter.MachineID)
	if mID != "" && !strings.EqualFold(mID, "ALL") {
		if mUUID, err := uuid.Parse(mID); err == nil {
			db = db.Where("machine_id = ? OR LOWER(hostname) = LOWER(?)", mUUID, mID)
		} else {
			db = db.Where("LOWER(hostname) = LOWER(?) OR machine_id::text LIKE ?", strings.ToLower(mID), mID+"%")
		}
	}

	// 2. Hostname
	if h := strings.TrimSpace(filter.Hostname); h != "" && !strings.EqualFold(h, "ALL") {
		db = db.Where("LOWER(hostname) = ?", strings.ToLower(h))
	}

	// 3. Platform
	if p := strings.TrimSpace(filter.Platform); p != "" && !strings.EqualFold(p, "ALL") {
		db = db.Where("LOWER(platform) = ?", strings.ToLower(p))
	}

	// 4. OS
	if os := strings.TrimSpace(filter.OS); os != "" && !strings.EqualFold(os, "ALL") {
		db = db.Where("LOWER(os) LIKE ?", "%"+strings.ToLower(os)+"%")
	}

	// 5. Level (only if not computing level distributions)
	if !excludeLevel {
		if lvl := strings.TrimSpace(filter.Level); lvl != "" && !strings.EqualFold(lvl, "ALL") {
			db = db.Where("UPPER(level) = ?", strings.ToUpper(lvl))
		}
	}

	// 6. Source
	if src := strings.TrimSpace(filter.Source); src != "" && !strings.EqualFold(src, "ALL") {
		db = db.Where("LOWER(source) = ?", strings.ToLower(src))
	}

	// 7. Service
	if svc := strings.TrimSpace(filter.Service); svc != "" && !strings.EqualFold(svc, "ALL") {
		db = db.Where("LOWER(service) = ?", strings.ToLower(svc))
	}

	// 8. ContainerName
	if c := strings.TrimSpace(filter.ContainerName); c != "" && !strings.EqualFold(c, "ALL") {
		db = db.Where("LOWER(container_name) = ?", strings.ToLower(c))
	}

	// 9. PodName
	if pod := strings.TrimSpace(filter.PodName); pod != "" && !strings.EqualFold(pod, "ALL") {
		db = db.Where("LOWER(pod_name) = ?", strings.ToLower(pod))
	}

	// 10. Namespace
	if ns := strings.TrimSpace(filter.Namespace); ns != "" && !strings.EqualFold(ns, "ALL") {
		db = db.Where("LOWER(namespace) = ?", strings.ToLower(ns))
	}

	// 11. ClusterName
	if cl := strings.TrimSpace(filter.ClusterName); cl != "" && !strings.EqualFold(cl, "ALL") {
		db = db.Where("LOWER(cluster_name) = ?", strings.ToLower(cl))
	}

	// 12. Time Range (Prioritize explicit timestamps if provided)
	if filter.StartTime != nil && !filter.StartTime.IsZero() {
		db = db.Where("timestamp >= ?", *filter.StartTime)
		if filter.EndTime != nil && !filter.EndTime.IsZero() {
			db = db.Where("timestamp <= ?", *filter.EndTime)
		}
	} else if tr := strings.TrimSpace(filter.TimeRange); tr != "" && !strings.EqualFold(tr, "ALL") {
		start, end := parseTimeRange(tr)
		if !start.IsZero() {
			db = db.Where("timestamp BETWEEN ? AND ?", start, end)
		}
	}

	// 13. Tokenized Multi-Word Search (AND-matching across all terms)
	if q := strings.TrimSpace(filter.Query); q != "" {
		words := strings.Fields(q)
		for _, w := range words {
			cleanWord := strings.ReplaceAll(w, "%", "\\%")
			cleanWord = strings.ReplaceAll(cleanWord, "_", "\\_")
			term := "%" + strings.ToLower(cleanWord) + "%"
			db = db.Where("(LOWER(message) LIKE ? OR LOWER(hostname) LIKE ? OR LOWER(service) LIKE ? OR LOWER(source) LIKE ? OR LOWER(container_name) LIKE ? OR LOWER(pod_name) LIKE ?)", term, term, term, term, term, term)
		}
	}

	return db
}

func (r *postgresRepository) GetLogs(filter LogFilter) ([]models.Log, int64, error) {
	if database.DB == nil {
		mock := generateMockLogs(uuid.Nil)
		filtered := filterMockLogs(mock, filter.Level, filter.Source, filter.Query)
		return filtered, int64(len(filtered)), nil
	}

	var logs []models.Log
	var total int64

	db := buildLogQuery(database.DB.Model(&models.Log{}), filter, false)

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	// Deterministic pagination with secondary tie-breaker
	if err := db.Order("timestamp desc, id desc").Offset(filter.Offset).Limit(limit).Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	if logs == nil {
		logs = make([]models.Log, 0)
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
			case "INFO", "NOTICE":
				stats.Info++
			case "WARN", "WARNING":
				stats.Warning++
			case "ERROR":
				stats.Error++
			case "CRITICAL":
				stats.Critical++
			case "FATAL":
				stats.Fatal++
			}
		}
		return stats, nil
	}

	// Base query with all filters applied except Level
	baseDB := buildLogQuery(database.DB.Model(&models.Log{}), filter, true)

	// 1. Total Count
	if err := baseDB.Session(&gorm.Session{}).Count(&stats.Total).Error; err != nil {
		return nil, err
	}

	// 2. Aggregated Level Counts via GROUP BY (100% accurate, no sequential GORM pollution)
	type LevelCount struct {
		Level string `gorm:"column:level"`
		Count int64  `gorm:"column:count"`
	}
	var levelCounts []LevelCount
	if err := baseDB.Session(&gorm.Session{}).
		Select("UPPER(level) as level, count(*) as count").
		Group("UPPER(level)").
		Scan(&levelCounts).Error; err == nil {
		for _, lc := range levelCounts {
			switch strings.ToUpper(strings.TrimSpace(lc.Level)) {
			case "INFO", "NOTICE":
				stats.Info += lc.Count
			case "WARN", "WARNING":
				stats.Warning += lc.Count
			case "ERROR":
				stats.Error += lc.Count
			case "CRITICAL":
				stats.Critical += lc.Count
			case "FATAL":
				stats.Fatal += lc.Count
			}
		}
	}

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

// Pillar 2: Dynamic Extraction Rules
func (r *postgresRepository) GetExtractionRules() ([]models.ExtractionRule, error) {
	if database.DB == nil {
		return getDefaultBuiltinRules(), nil
	}

	var rules []models.ExtractionRule
	err := database.DB.Order("is_builtin desc, created_at desc").Find(&rules).Error
	if err != nil {
		return nil, err
	}

	if len(rules) == 0 {
		builtins := getDefaultBuiltinRules()
		for i := range builtins {
			_ = database.DB.Create(&builtins[i]).Error
		}
		return builtins, nil
	}

	return rules, nil
}

func (r *postgresRepository) CreateExtractionRule(rule *models.ExtractionRule) error {
	if database.DB == nil {
		return nil
	}
	if rule.ID == uuid.Nil {
		rule.ID = uuid.New()
	}
	if rule.CreatedAt.IsZero() {
		rule.CreatedAt = time.Now()
	}
	rule.UpdatedAt = time.Now()
	return database.DB.Create(rule).Error
}

func (r *postgresRepository) UpdateExtractionRule(rule *models.ExtractionRule) error {
	if database.DB == nil {
		return nil
	}
	rule.UpdatedAt = time.Now()
	return database.DB.Save(rule).Error
}

func (r *postgresRepository) DeleteExtractionRule(id uuid.UUID) error {
	if database.DB == nil {
		return nil
	}
	return database.DB.Where("id = ? AND is_builtin = false", id).Delete(&models.ExtractionRule{}).Error
}

func (r *postgresRepository) ToggleExtractionRule(id uuid.UUID) (*models.ExtractionRule, error) {
	if database.DB == nil {
		return nil, nil
	}
	var rule models.ExtractionRule
	if err := database.DB.First(&rule, "id = ?", id).Error; err != nil {
		return nil, err
	}
	rule.IsEnabled = !rule.IsEnabled
	rule.UpdatedAt = time.Now()
	if err := database.DB.Save(&rule).Error; err != nil {
		return nil, err
	}
	return &rule, nil
}

func getDefaultBuiltinRules() []models.ExtractionRule {
	now := time.Now()
	return []models.ExtractionRule{
		{
			ID:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
			Name:        "Nginx / Apache Combined Access Log",
			Category:    "Web Server",
			Description: "Extracts client IP, timestamp, HTTP method, request path, status code, response bytes, and referrer",
			Source:      "all",
			Service:     "nginx",
			RuleType:    "regex",
			Pattern:     `^(?<client_ip>\S+) \S+ \S+ \[(?<timestamp>[^\]]+)\] "(?<method>[A-Z]+) (?<path>\S+) [^"]*" (?<status>\d{3}) (?<bytes>\d+)`,
			FieldNames:  "client_ip,timestamp,method,path,status,bytes",
			SampleLog:   `192.168.1.104 - - [09/Oct/2026:14:32:10 +0000] "GET /api/v1/servers HTTP/1.1" 200 4521 "-" "Mozilla/5.0"`,
			IsEnabled:   true,
			IsBuiltin:   true,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:          uuid.MustParse("00000000-0000-0000-0000-000000000002"),
			Name:        "SSH / Security Authentication Log",
			Category:    "Security",
			Description: "Extracts authentication status (Failed/Accepted), user, client IP, and SSH port",
			Source:      "auth",
			Service:     "sshd",
			RuleType:    "regex",
			Pattern:     `(?<auth_status>Failed|Accepted) password for (?:invalid user )?(?<user>\S+) from (?<client_ip>\S+) port (?<port>\d+)`,
			FieldNames:  "auth_status,user,client_ip,port",
			SampleLog:   `Failed password for invalid user admin from 203.0.113.42 port 49152 ssh2`,
			IsEnabled:   true,
			IsBuiltin:   true,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:          uuid.MustParse("00000000-0000-0000-0000-000000000003"),
			Name:        "PostgreSQL Slow Query Log",
			Category:    "Database",
			Description: "Extracts query execution duration in milliseconds, process ID, and SQL statement",
			Source:      "all",
			Service:     "postgresql",
			RuleType:    "regex",
			Pattern:     `duration: (?<duration_ms>\d+(?:\.\d+)?) ms\s+statement:\s*(?<query>.+)`,
			FieldNames:  "duration_ms,query",
			SampleLog:   `2026-10-09 14:10:02 UTC [14820]: [3-1] user=postgres,db=infrapilot LOG: duration: 428.512 ms statement: SELECT * FROM servers;`,
			IsEnabled:   true,
			IsBuiltin:   true,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:          uuid.MustParse("00000000-0000-0000-0000-000000000004"),
			Name:        "Docker / Microservice JSON Log",
			Category:    "Containers",
			Description: "Parses structured JSON payloads embedded inside log lines",
			Source:      "docker",
			Service:     "all",
			RuleType:    "json",
			Pattern:     "json",
			FieldNames:  "level,msg,caller,latency_ms,trace_id,service",
			SampleLog:   `{"level":"error","service":"auth-service","msg":"token expired","user_id":"usr_9812","latency_ms":18.4}`,
			IsEnabled:   true,
			IsBuiltin:   true,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:          uuid.MustParse("00000000-0000-0000-0000-000000000005"),
			Name:        "Key-Value Pair Auto-Extractor",
			Category:    "Generic",
			Description: "Automatically detects and extracts all key=value, key=\"val\", and key='val' pairs",
			Source:      "all",
			Service:     "all",
			RuleType:    "kv",
			Pattern:     "kv",
			FieldNames:  "*",
			SampleLog:   `level=WARN host=ssa-node-01 action=disk_cleanup freed_bytes=1048576 duration=240ms status=success`,
			IsEnabled:   true,
			IsBuiltin:   true,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
	}
}

