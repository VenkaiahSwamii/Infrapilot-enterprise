package reports

import (
	"encoding/json"
	"fmt"
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

func (r *ReportRepository) UpdateStatus(id uuid.UUID, status ReportStatus, filePath string) error {
	updates := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now(),
	}
	if filePath != "" {
		updates["file_path"] = filePath
	}
	return database.DB.Model(&Report{}).Where("id = ?", id).Updates(updates).Error
}

type ReportGenerator struct {
	PDF   *PDFGenerator
	Excel *ExcelGenerator
	CSV   *CSVGenerator
	Repo  *ReportRepository
}

func NewReportGenerator(baseDir string) *ReportGenerator {
	return &ReportGenerator{
		PDF:   NewPDFGenerator(baseDir),
		Excel: NewExcelGenerator(baseDir),
		CSV:   NewCSVGenerator(baseDir),
		Repo:  NewReportRepository(),
	}
}

func (g *ReportGenerator) Generate(userID uuid.UUID, req GenerateReportRequest) (*Report, error) {
	report := &Report{
		Name:        req.Name,
		Type:        req.Type,
		GeneratedBy: userID,
		GeneratedAt: time.Now(),
		Status:      ReportStatusPending,
		Format:      req.Format,
		Schedule:    req.Schedule,
	}

	if req.DateFrom != nil {
		report.DateFrom = req.DateFrom
	}
	if req.DateTo != nil {
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
	g.Repo.UpdateStatus(report.ID, ReportStatusGenerating, "")

	data, err := g.collectData(report)
	if err != nil {
		g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "")
		return
	}

	var filename string
	var genErr error
	switch report.Format {
	case "pdf":
		filename, genErr = g.PDF.Generate(report, data)
	case "excel":
		filename, genErr = g.Excel.Generate(report, data)
	case "csv":
		filename, genErr = g.CSV.Generate(report, data)
	default:
		g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "")
		return
	}

	if genErr != nil {
		g.Repo.UpdateStatus(report.ID, ReportStatusFailed, "")
		return
	}

	g.Repo.UpdateStatus(report.ID, ReportStatusCompleted, filename)
}

func (g *ReportGenerator) collectData(report *Report) (map[string]interface{}, error) {
	switch report.Type {
	case ReportTypeInfrastructureSummary:
		return g.collectInfrastructureSummary(report)
	case ReportTypeMachineHealth:
		return g.collectMachineHealth(report)
	case ReportTypeCPUUsage, ReportTypeMemoryUsage, ReportTypeDiskUsage:
		return g.collectResourceUsage(report)
	case ReportTypeAlerts:
		return g.collectAlerts(report)
	case ReportTypeInventory:
		return g.collectInventory(report)
	case ReportTypeDockerStatus:
		return g.collectDockerStatus(report)
	case ReportTypeKubernetesStatus:
		return g.collectKubernetesStatus(report)
	case ReportTypeSecurityEvents:
		return g.collectSecurityEvents(report)
	default:
		return g.collectDefaultSummary(report)
	}
}

func (g *ReportGenerator) collectInfrastructureSummary(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Infrastructure Summary Report",
		"summary": fmt.Sprintf("Report generated on %s", report.GeneratedAt.Format(time.RFC1123)),
	}

	var machines []models.Machine
	if err := database.DB.Find(&machines).Error; err != nil {
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
		"summary": "Detailed health analysis of all managed machines",
	}

	var machines []models.Machine
	if err := database.DB.Find(&machines).Error; err != nil {
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
		table.Rows = append(table.Rows, []interface{}{m.Hostname, status, m.LastSeen.Format(time.RFC3339), m.CPUModel, m.TotalMemoryGB, m.TotalDiskGB})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectResourceUsage(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   string(report.Type) + " Report",
		"summary": "Resource utilization metrics across infrastructure",
	}

	var metrics []models.Metric
	if err := database.DB.Order("created_at desc").Limit(100).Find(&metrics).Error; err != nil {
		return data, err
	}

	column := "CPU Usage"
	if report.Type == ReportTypeMemoryUsage {
		column = "Memory Usage"
	} else if report.Type == ReportTypeDiskUsage {
		column = "Disk Usage"
	}

	table := TableData{
		Title:   column + " History",
		Headers: []string{"Timestamp", "Machine ID", column, "Upload Mbps", "Download Mbps"},
	}

	for _, m := range metrics {
		value := m.CPUUsage
		if report.Type == ReportTypeMemoryUsage {
			value = m.MemoryUsage
		} else if report.Type == ReportTypeDiskUsage {
			value = m.DiskUsage
		}
		table.Rows = append(table.Rows, []interface{}{m.CreatedAt.Format(time.RFC3339), m.MachineID, value, m.UploadMbps, m.DownloadMbps})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectAlerts(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Alerts Report",
		"summary": "Security and system alerts overview",
	}

	var alerts []models.LinuxAlert
	if err := database.DB.Order("created_at desc").Limit(100).Find(&alerts).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Active Alerts",
		Headers: []string{"Severity", "Message", "Created At", "Status"},
	}

	for _, a := range alerts {
		table.Rows = append(table.Rows, []interface{}{a.Severity, a.Message, a.CreatedAt.Format(time.RFC3339), a.Status})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectInventory(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Inventory Report",
		"summary": "Complete infrastructure inventory",
	}

	var machines []models.Machine
	if err := database.DB.Find(&machines).Error; err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Full Inventory",
		Headers: []string{"Hostname", "IP", "OS", "Platform", "CPU", "Memory (GB)", "Disk (GB)", "Status", "Org"},
	}

	for _, m := range machines {
		status := "Offline"
		if m.Status == "ONLINE" {
			status = "Online"
		}
		table.Rows = append(table.Rows, []interface{}{m.Hostname, m.IPAddress, m.OS, m.Platform, m.CPUModel, m.TotalMemoryGB, m.TotalDiskGB, status, m.Organization})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectDefaultSummary(report *Report) (map[string]interface{}, error) {
	return map[string]interface{}{
		"title":   "General Summary Report",
		"summary": "General infrastructure report",
		"tables":  []TableData{},
	}, nil
}

func (g *ReportGenerator) collectDockerStatus(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Docker Status Report",
		"summary": "Docker containers and images overview",
	}

	var dockerRecords []models.LinuxDocker
	var err error
	if database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_dockers 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&dockerRecords).Error
	} else {
		err = database.DB.Order("sampled_at DESC").Find(&dockerRecords).Error
	}
	if err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Docker Status",
		Headers: []string{"Machine ID", "Containers", "Images", "Last Updated"},
	}

	for _, d := range dockerRecords {
		var containers []interface{}
		if d.ContainersJSON != "" {
			json.Unmarshal([]byte(d.ContainersJSON), &containers)
		}
		var images []interface{}
		if d.ImagesJSON != "" {
			json.Unmarshal([]byte(d.ImagesJSON), &images)
		}
		table.Rows = append(table.Rows, []interface{}{d.MachineID, len(containers), len(images), d.SampledAt.Format(time.RFC3339)})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectKubernetesStatus(report *Report) (map[string]interface{}, error) {
	data := map[string]interface{}{
		"title":   "Kubernetes Status Report",
		"summary": "Kubernetes clusters and workloads overview",
	}

	var k8sRecords []models.LinuxKubernetes
	var err error
	if database.DB.Dialector.Name() == "postgres" {
		err = database.DB.Raw(`
			SELECT DISTINCT ON (machine_id) * 
			FROM linux_kubernetes 
			ORDER BY machine_id, sampled_at DESC
		`).Scan(&k8sRecords).Error
	} else {
		err = database.DB.Order("sampled_at DESC").Find(&k8sRecords).Error
	}
	if err != nil {
		return data, err
	}

	table := TableData{
		Title:   "Kubernetes Status",
		Headers: []string{"Machine ID", "Pods", "Nodes", "Last Updated"},
	}

	for _, k := range k8sRecords {
		var pods []interface{}
		if k.PodsJSON != "" {
			json.Unmarshal([]byte(k.PodsJSON), &pods)
		}
		var nodes []interface{}
		if k.NodesJSON != "" {
			json.Unmarshal([]byte(k.NodesJSON), &nodes)
		}
		table.Rows = append(table.Rows, []interface{}{k.MachineID, len(pods), len(nodes), k.SampledAt.Format(time.RFC3339)})
	}

	data["tables"] = []TableData{table}
	return data, nil
}

func (g *ReportGenerator) collectSecurityEvents(report *Report) (map[string]interface{}, error) {
	return g.collectAlerts(report)
}
