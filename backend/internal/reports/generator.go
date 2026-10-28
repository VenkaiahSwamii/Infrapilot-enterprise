package reports

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type ReportRepository struct{}

func NewReportRepository() *ReportRepository {
	return &ReportRepository{}
}

func (r *ReportRepository) Create(report *Report) error {
	return database.DB.Create(report).Error
}

func (r *ReportRepository) FindByID(id uuid.UUID) (*Report, error) {
	var report Report
	err := database.DB.First(&report, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (r *ReportRepository) FindAll() ([]Report, error) {
	var reports []Report
	err := database.DB.Order("created_at desc").Find(&reports).Error
	return reports, err
}

func (r *ReportRepository) FindByUser(userID uuid.UUID) ([]Report, error) {
	var reports []Report
	err := database.DB.Where("generated_by = ?", userID).Order("created_at desc").Find(&reports).Error
	return reports, err
}

func (r *ReportRepository) Delete(id uuid.UUID) error {
	return database.DB.Delete(&Report{}, "id = ?", id).Error
}

func formatFileSize(bytes int64) string {
	if bytes <= 0 {
		return "0 B"
	}
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	} else if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024.0)
	} else if bytes < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024.0*1024.0))
	}
	return fmt.Sprintf("%.2f GB", float64(bytes)/(1024.0*1024.0*1024.0))
}

func (r *ReportRepository) UpdateStatus(id uuid.UUID, status ReportStatus, filePath string, fileSize string, rowCount int64, scope string) error {
	updates := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now(),
	}
	if filePath != "" {
		updates["file_path"] = filePath
	}
	if fileSize != "" {
		updates["file_size"] = fileSize
	}
	if rowCount >= 0 {
		updates["row_count"] = rowCount
	}
	if scope != "" {
		updates["scope"] = scope
	}
	return database.DB.Model(&Report{}).Where("id = ?", id).Updates(updates).Error
}

type ReportGenerator struct {
	BaseDir string
	PDF     *PDFGenerator
	Excel   *ExcelGenerator
	CSV     *CSVGenerator
	Repo    *ReportRepository
}

func NewReportGenerator(baseDir string) *ReportGenerator {
	return &ReportGenerator{
		BaseDir: baseDir,
		PDF:     NewPDFGenerator(baseDir),
		Excel:   NewExcelGenerator(baseDir),
		CSV:     NewCSVGenerator(baseDir),
		Repo:    NewReportRepository(),
	}
}

func (g *ReportGenerator) Generate(userID uuid.UUID, req GenerateReportRequest) (*Report, error) {
	scope := req.Scope
	if scope == "" {
		if len(req.MachineIDs) > 0 {
			scope = fmt.Sprintf("%d Selected Machine(s)", len(req.MachineIDs))
		} else {
			scope = "Fleet-wide"
		}
	}

	schedule := req.Schedule
	if schedule == "" {
		schedule = ReportScheduleNone
	}

	report := &Report{
		Name:        req.Name,
		Type:        req.Type,
		GeneratedBy: userID,
		GeneratedAt: time.Now(),
		Status:      ReportStatusPending,
		Format:      strings.ToLower(req.Format),
		Schedule:    schedule,
		Scope:       scope,
		FilePath:    "",
		FileSize:    "",
		RowCount:    0,
	}

	if req.DateFrom != nil && req.DateTo != nil && req.DateFrom.After(*req.DateTo) {
		// Swap inverted dates
		report.DateFrom = req.DateTo
		report.DateTo = req.DateFrom
	} else {
		report.DateFrom = req.DateFrom
		report.DateTo = req.DateTo
	}

	if len(req.MachineIDs) > 0 {
		machineJSON, _ := json.Marshal(req.MachineIDs)
		report.MachineIDs = machineJSON
	}
	if req.Filters != nil {
		filterJSON, _ := json.Marshal(req.Filters)
		report.Filters = filterJSON
	}

	if err := g.Repo.Create(report); err != nil {
		return nil, err
	}

	go g.processReport(report)

	return report, nil
}

func (g *ReportGenerator) processReport(report *Report) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[ReportGenerator] PANIC recovered in processReport: %v\n%s", r, debug.Stack())
			_ = g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "", "", 0, report.Scope)
		}
	}()

	_ = g.Repo.UpdateStatus(report.ID, ReportStatusGenerating, "", "", 0, report.Scope)

	data, err := g.collectData(report)
	if err != nil {
		log.Printf("[ReportGenerator] Data collection error for report %s: %v", report.ID, err)
		_ = g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "", "", 0, report.Scope)
		return
	}

	var filename string
	var genErr error
	fmtLower := strings.ToLower(report.Format)
	switch fmtLower {
	case "pdf":
		filename, genErr = g.PDF.Generate(report, data)
	case "excel", "xlsx":
		filename, genErr = g.Excel.Generate(report, data)
	case "csv":
		filename, genErr = g.CSV.Generate(report, data)
	default:
		log.Printf("[ReportGenerator] Unsupported format: %s", report.Format)
		_ = g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "", "", 0, report.Scope)
		return
	}

	if genErr != nil {
		log.Printf("[ReportGenerator] File generation error for report %s: %v", report.ID, genErr)
		_ = g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "", "", 0, report.Scope)
		return
	}

	fullPath := filepath.Join(g.BaseDir, filename)
	var fileSize int64
	if fi, err := os.Stat(fullPath); err == nil {
		fileSize = fi.Size()
	}

	rowCount := 0
	if tables, ok := data["tables"].([]TableData); ok {
		for _, t := range tables {
			rowCount += len(t.Rows)
		}
	}

	_ = g.Repo.UpdateStatus(report.ID, ReportStatusCompleted, fullPath, formatFileSize(fileSize), int64(rowCount), report.Scope)
}

func (g *ReportGenerator) getFilterCriteria(report *Report) (machineIDs []uuid.UUID, dateFrom, dateTo *time.Time) {
	if len(report.MachineIDs) > 0 {
		_ = json.Unmarshal(report.MachineIDs, &machineIDs)
	}
	if report.DateFrom != nil && report.DateTo != nil {
		df := *report.DateFrom
		dt := *report.DateTo
		if df.After(dt) {
			df, dt = dt, df
		}
		dateFrom = &df
		dateTo = &dt
	} else {
		dateFrom = report.DateFrom
		dateTo = report.DateTo
	}
	return
}

func (g *ReportGenerator) collectData(report *Report) (map[string]interface{}, error) {
	t := strings.ToLower(string(report.Type))
	switch t {
	case "infrastructure_summary", "summary", "fleet":
		return g.collectInfrastructureSummary(report)
	case "machine_health", "health":
		return g.collectMachineHealth(report)
	case "cpu_usage", "cpu":
		return g.collectResourceUsage(report)
	case "memory_usage", "memory", "ram":
		return g.collectResourceUsage(report)
	case "disk_usage", "disk", "storage":
		return g.collectResourceUsage(report)
	case "alerts", "incident", "incidents":
		return g.collectAlerts(report)
	case "inventory", "assets":
		return g.collectInventory(report)
	case "docker_status", "docker", "containers":
		return g.collectDockerStatus(report)
	case "kubernetes_status", "kubernetes", "k8s":
		return g.collectKubernetesStatus(report)
	case "security_events", "security", "compliance":
		return g.collectSecurityEvents(report)
	default:
		return g.collectDefaultSummary(report)
	}
}

func (g *ReportGenerator) collectInfrastructureSummary(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Infrastructure Summary Report",
		"summary": fmt.Sprintf("Report generated on %s (Scope: %s)", report.GeneratedAt.Format(time.RFC1123), report.Scope),
	}

	machineIDs, _, _ := g.getFilterCriteria(report)

	var machines []models.Machine
	query := database.DB.Model(&models.Machine{})
	if len(machineIDs) > 0 {
		query = query.Where("id IN ?", machineIDs)
	}
	if err := query.Find(&machines).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Machine Inventory",
		Headers: []string{"Hostname", "IP Address", "OS", "Status", "Resource Type"},
	}

	for _, m := range machines {
		status := "Offline"
		if m.Status == "ONLINE" {
			status = "Online"
		}
		table.Rows = append(table.Rows, []interface{}{m.Hostname, m.IPAddress, m.OS, status, m.ResourceType})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectMachineHealth(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Machine Health Report",
		"summary": fmt.Sprintf("Detailed health analysis of managed nodes (Scope: %s)", report.Scope),
	}

	machineIDs, _, _ := g.getFilterCriteria(report)

	var machines []models.Machine
	query := database.DB.Model(&models.Machine{})
	if len(machineIDs) > 0 {
		query = query.Where("id IN ?", machineIDs)
	}
	if err := query.Find(&machines).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Machine Health Status",
		Headers: []string{"Hostname", "Status", "Last Seen", "CPU Model", "Total Memory (GB)", "Total Disk (GB)"},
	}

	for _, m := range machines {
		status := "Offline"
		if m.Status == "ONLINE" {
			status = "Online"
		}
		lastSeen := "Never"
		if !m.LastSeen.IsZero() {
			lastSeen = m.LastSeen.Format(time.RFC3339)
		}
		table.Rows = append(table.Rows, []interface{}{m.Hostname, status, lastSeen, m.CPUModel, m.TotalMemoryGB, m.TotalDiskGB})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectResourceUsage(report *Report) (map[string]interface{}, error) {
	t := strings.ToLower(string(report.Type))
	colTitle := "CPU Usage (%)"
	if strings.Contains(t, "memory") || strings.Contains(t, "ram") {
		colTitle = "Memory Usage (%)"
	} else if strings.Contains(t, "disk") || strings.Contains(t, "storage") {
		colTitle = "Disk Usage (%)"
	}

	data := map[string]interface{}{
		"title":   colTitle + " Utilization Report",
		"summary": fmt.Sprintf("Historical resource consumption metrics (Scope: %s)", report.Scope),
	}

	machineIDs, dateFrom, dateTo := g.getFilterCriteria(report)

	var metrics []models.Metric
	query := database.DB.Model(&models.Metric{})
	if len(machineIDs) > 0 {
		query = query.Where("machine_id IN ?", machineIDs)
	}
	if dateFrom != nil {
		query = query.Where("created_at >= ?", *dateFrom)
	}
	if dateTo != nil {
		query = query.Where("created_at <= ?", *dateTo)
	}

	if err := query.Order("created_at desc").Limit(200).Find(&metrics).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   colTitle + " Time Series",
		Headers: []string{"Timestamp", "Machine ID", colTitle, "Upload (Mbps)", "Download (Mbps)"},
	}

	for _, m := range metrics {
		var val float64
		if strings.Contains(t, "memory") || strings.Contains(t, "ram") {
			val = m.MemoryUsage
		} else if strings.Contains(t, "disk") || strings.Contains(t, "storage") {
			val = m.DiskUsage
		} else {
			val = m.CPUUsage
		}
		table.Rows = append(table.Rows, []interface{}{
			m.CreatedAt.Format(time.RFC3339),
			m.MachineID.String(),
			fmt.Sprintf("%.2f%%", val),
			fmt.Sprintf("%.2f", m.UploadMbps),
			fmt.Sprintf("%.2f", m.DownloadMbps),
		})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectAlerts(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Alerts & Incident Report",
		"summary": fmt.Sprintf("Security alerts and incident telemetry (Scope: %s)", report.Scope),
	}

	machineIDs, dateFrom, dateTo := g.getFilterCriteria(report)

	var alerts []models.LinuxAlert
	query := database.DB.Model(&models.LinuxAlert{})
	if len(machineIDs) > 0 {
		query = query.Where("machine_id IN ?", machineIDs)
	}
	if dateFrom != nil {
		query = query.Where("created_at >= ?", *dateFrom)
	}
	if dateTo != nil {
		query = query.Where("created_at <= ?", *dateTo)
	}

	if err := query.Order("created_at desc").Limit(200).Find(&alerts).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Alert History",
		Headers: []string{"Severity", "Message", "Component", "Created At", "Status"},
	}

	for _, a := range alerts {
		table.Rows = append(table.Rows, []interface{}{
			a.Severity,
			a.Message,
			a.Component,
			a.CreatedAt.Format(time.RFC3339),
			a.Status,
		})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectInventory(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Infrastructure Inventory Report",
		"summary": fmt.Sprintf("Complete infrastructure inventory assets (Scope: %s)", report.Scope),
	}

	machineIDs, _, _ := g.getFilterCriteria(report)

	var machines []models.Machine
	query := database.DB.Model(&models.Machine{})
	if len(machineIDs) > 0 {
		query = query.Where("id IN ?", machineIDs)
	}
	if err := query.Find(&machines).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Full Infrastructure Inventory",
		Headers: []string{"Hostname", "IP", "OS", "Platform", "CPU", "Memory (GB)", "Disk (GB)", "Status", "Org"},
	}

	for _, m := range machines {
		status := "Offline"
		if m.Status == "ONLINE" {
			status = "Online"
		}
		table.Rows = append(table.Rows, []interface{}{
			m.Hostname,
			m.IPAddress,
			m.OS,
			m.Platform,
			m.CPUModel,
			m.TotalMemoryGB,
			m.TotalDiskGB,
			status,
			m.Organization,
		})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectDefaultSummary(report *Report) (map[string]interface{}, error) {
	return map[string]interface{}{
		"title":   "General Infrastructure Report",
		"summary": fmt.Sprintf("General infrastructure status generated on %s (Scope: %s)", report.GeneratedAt.Format(time.RFC1123), report.Scope),
		"tables":  []TableData{},
	}, nil
}

func (g *ReportGenerator) collectDockerStatus(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Docker Container Status Report",
		"summary": fmt.Sprintf("Containerized workloads and image telemetry (Scope: %s)", report.Scope),
	}

	var dockerRecords []models.LinuxDocker
	var err error
	if database.DB != nil && database.DB.Dialector != nil && database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_dockers 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&dockerRecords).Error
	} else if database.DB != nil {
		err = database.DB.Order("sampled_at DESC").Find(&dockerRecords).Error
	}
	if err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Docker Daemon Status",
		Headers: []string{"Machine ID", "Containers Count", "Images Count", "Last Sampled"},
	}

	for _, d := range dockerRecords {
		var containers []interface{}
		if d.ContainersJSON != "" {
			_ = json.Unmarshal([]byte(d.ContainersJSON), &containers)
		}
		var images []interface{}
		if d.ImagesJSON != "" {
			_ = json.Unmarshal([]byte(d.ImagesJSON), &images)
		}
		table.Rows = append(table.Rows, []interface{}{
			d.MachineID.String(),
			len(containers),
			len(images),
			d.SampledAt.Format(time.RFC3339),
		})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectKubernetesStatus(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Kubernetes Cluster & Workload Report",
		"summary": fmt.Sprintf("Kubernetes cluster pods and nodes overview (Scope: %s)", report.Scope),
	}

	var k8sRecords []models.LinuxKubernetes
	var err error
	if database.DB != nil && database.DB.Dialector != nil && database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_kubernetes 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&k8sRecords).Error
	} else if database.DB != nil {
		err = database.DB.Order("sampled_at DESC").Find(&k8sRecords).Error
	}
	if err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Kubernetes Workloads",
		Headers: []string{"Machine ID", "Pods Count", "Nodes Count", "Last Sampled"},
	}

	for _, k := range k8sRecords {
		var pods []interface{}
		if k.PodsJSON != "" {
			_ = json.Unmarshal([]byte(k.PodsJSON), &pods)
		}
		var nodes []interface{}
		if k.NodesJSON != "" {
			_ = json.Unmarshal([]byte(k.NodesJSON), &nodes)
		}
		table.Rows = append(table.Rows, []interface{}{
			k.MachineID.String(),
			len(pods),
			len(nodes),
			k.SampledAt.Format(time.RFC3339),
		})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectSecurityEvents(report *Report) (map[string]interface{}, error) {
	return g.collectAlerts(report)
}
