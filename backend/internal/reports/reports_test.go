package reports

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

func TestPDFAndCSVReportGenerators(t *testing.T) {
	tempDir := filepath.Join(os.TempDir(), "infrapilot_test_reports_basic")
	defer os.RemoveAll(tempDir)

	pdfGen := NewPDFGenerator(tempDir)
	csvGen := NewCSVGenerator(tempDir)

	report := &Report{
		ID:          uuid.New(),
		Name:        "Executive Infrastructure Report",
		Type:        ReportTypeInfrastructureSummary,
		Format:      "pdf",
		Scope:       "Fleet-wide",
		GeneratedAt: time.Now(),
	}

	data := map[string]interface{}{
		"title":   "InfraPilot System Health & Metrics Summary",
		"summary": "This report summarizes the operational health of all monitored nodes.",
		"tables": []TableData{
			{
				Title:   "Node Summary",
				Headers: []string{"Node Name", "OS", "Status", "CPU %"},
				Rows: [][]interface{}{
					{"Windows-Server-01", "Windows", "ONLINE", 25.5},
					{"Ubuntu-Node-01", "Linux", "ONLINE", 12.0},
				},
			},
		},
	}

	// 1. PDF Generation Test
	pdfFilename, err := pdfGen.Generate(report, data)
	if err != nil {
		t.Fatalf("Failed to generate PDF report: %v", err)
	}

	if pdfFilename == "" {
		t.Fatalf("Generated PDF filename is empty")
	}

	if _, err := os.Stat(filepath.Join(tempDir, pdfFilename)); os.IsNotExist(err) {
		t.Errorf("PDF report file does not exist on disk")
	}

	// 2. CSV Generation Test
	report.Format = "csv"
	csvFilename, err := csvGen.Generate(report, data)
	if err != nil {
		t.Fatalf("Failed to generate CSV report: %v", err)
	}

	if csvFilename == "" {
		t.Fatalf("Generated CSV filename is empty")
	}

	if _, err := os.Stat(filepath.Join(tempDir, csvFilename)); os.IsNotExist(err) {
		t.Errorf("CSV report file does not exist on disk")
	}
}

func TestExcelGenerator_EdgeCases(t *testing.T) {
	tempDir := filepath.Join(os.TempDir(), "infrapilot_test_reports_excel")
	defer os.RemoveAll(tempDir)

	excelGen := NewExcelGenerator(tempDir)

	report := &Report{
		ID:          uuid.New(),
		Name:        "SRE SLA Excel Audit Export",
		Type:        ReportTypeAlerts,
		Format:      "excel",
		Scope:       "2 Machine(s)",
		GeneratedAt: time.Now(),
	}

	// Edge Case 1: Empty tables (headers present, but 0 rows)
	emptyData := map[string]interface{}{
		"title":   "Zero Incidents Period",
		"summary": "No alerts recorded during maintenance window.",
		"tables": []TableData{
			{
				Title:   "Active Alerts",
				Headers: []string{"Severity", "Message", "Component", "Created At", "Status"},
				Rows:    [][]interface{}{},
			},
		},
	}

	filename, err := excelGen.Generate(report, emptyData)
	if err != nil {
		t.Fatalf("Failed to generate Excel for empty table: %v", err)
	}

	fullPath := filepath.Join(tempDir, filename)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		t.Fatalf("Excel file not created: %s", fullPath)
	}

	// Verify Excel file can be read and contains proper metadata
	f, err := excelize.OpenFile(fullPath)
	if err != nil {
		t.Fatalf("Failed to open generated Excel file: %v", err)
	}
	defer f.Close()

	val, err := f.GetCellValue("Sheet1", "A1")
	if err != nil || val != report.Name {
		t.Errorf("Expected cell A1 to be %q, got %q (err: %v)", report.Name, val, err)
	}

	// Edge Case 2: Multi-row data with special characters and large dataset (300 rows)
	var largeRows [][]interface{}
	for i := 0; i < 300; i++ {
		largeRows = append(largeRows, []interface{}{
			fmt.Sprintf("CRITICAL-%d", i),
			fmt.Sprintf("High CPU usage [node-%d]: 99.8%% with quotes \"and\" commas, symbols & <tags>", i),
			"systemd/docker",
			time.Now().Format(time.RFC3339),
			"RESOLVED",
		})
	}

	largeData := map[string]interface{}{
		"title":   "Large Alert Time Series",
		"summary": "Comprehensive incident review spanning 300 events.",
		"tables": []TableData{
			{
				Title:   "Incident Log",
				Headers: []string{"Severity", "Message", "Component", "Created At", "Status"},
				Rows:    largeRows,
			},
		},
	}

	report2 := &Report{
		ID:          uuid.New(),
		Name:        "Large Alert Dataset",
		Type:        ReportTypeAlerts,
		Format:      "xlsx",
		GeneratedAt: time.Now(),
	}

	filename2, err := excelGen.Generate(report2, largeData)
	if err != nil {
		t.Fatalf("Failed to generate large Excel dataset: %v", err)
	}

	f2, err := excelize.OpenFile(filepath.Join(tempDir, filename2))
	if err != nil {
		t.Fatalf("Failed to open large Excel file: %v", err)
	}
	defer f2.Close()
}

func TestPDFGenerator_EdgeCases(t *testing.T) {
	tempDir := filepath.Join(os.TempDir(), "infrapilot_test_reports_pdf")
	defer os.RemoveAll(tempDir)

	pdfGen := NewPDFGenerator(tempDir)

	// Edge Case 1: Empty tables (0 rows)
	report1 := &Report{
		ID:          uuid.New(),
		Name:        "Empty Dataset Health Report",
		Type:        ReportTypeMachineHealth,
		Format:      "pdf",
		Scope:       "All Isolated Nodes",
		GeneratedAt: time.Now(),
	}

	dataEmpty := map[string]interface{}{
		"title":   "Filtered Nodes Status",
		"summary": "No nodes currently match the filter criteria.",
		"tables": []TableData{
			{
				Title:   "Machine Health Status",
				Headers: []string{"Hostname", "Status", "Last Seen", "CPU Model", "Total Memory (GB)", "Total Disk (GB)"},
				Rows:    [][]interface{}{},
			},
		},
	}

	fn1, err := pdfGen.Generate(report1, dataEmpty)
	if err != nil {
		t.Fatalf("PDF generation failed on empty rows: %v", err)
	}
	if fi, err := os.Stat(filepath.Join(tempDir, fn1)); err != nil || fi.Size() == 0 {
		t.Fatalf("PDF file empty or missing: %v", err)
	}

	// Edge Case 2: Multi-page large dataset with 150 rows and long strings
	var bigRows [][]interface{}
	for i := 0; i < 150; i++ {
		bigRows = append(bigRows, []interface{}{
			fmt.Sprintf("node-cluster-east-%03d.corp.internal", i),
			"ONLINE",
			time.Now().Format(time.RFC3339),
			"Intel Xeon Platinum 8480+ @ 3.8GHz (112 vCPUs) Enterprise Hyperthreaded",
			64,
			1024,
		})
	}

	report2 := &Report{
		ID:          uuid.New(),
		Name:        "Multi-page Fleet Inventory Audit",
		Type:        ReportTypeInventory,
		Format:      "pdf",
		Scope:       "East Region Fleet",
		GeneratedAt: time.Now(),
	}

	dataBig := map[string]interface{}{
		"title":   "Large Fleet Inventory",
		"summary": "Full multi-page breakdown with table auto-pagination and landscape formatting.",
		"tables": []TableData{
			{
				Title:   "Managed Nodes Directory",
				Headers: []string{"Hostname", "Status", "Last Seen", "CPU Model", "RAM", "Disk"},
				Rows:    bigRows,
			},
		},
	}

	fn2, err := pdfGen.Generate(report2, dataBig)
	if err != nil {
		t.Fatalf("PDF multi-page generation failed: %v", err)
	}
	if fi, err := os.Stat(filepath.Join(tempDir, fn2)); err != nil || fi.Size() < 5000 {
		t.Fatalf("PDF multi-page file suspiciously small: %v", err)
	}
}

func TestCSVGenerator_EdgeCases(t *testing.T) {
	tempDir := filepath.Join(os.TempDir(), "infrapilot_test_reports_csv")
	defer os.RemoveAll(tempDir)

	csvGen := NewCSVGenerator(tempDir)

	report := &Report{
		ID:          uuid.New(),
		Name:        "Complex Characters CSV Export",
		Type:        ReportTypeSecurityEvents,
		Format:      "csv",
		Scope:       "Perimeter Security",
		GeneratedAt: time.Now(),
	}

	data := map[string]interface{}{
		"title":   "Security Events Log",
		"summary": "Special characters, newlines, commas, and quotes.",
		"tables": []TableData{
			{
				Title:   "Audit Events",
				Headers: []string{"Timestamp", "Event", "Raw Payload"},
				Rows: [][]interface{}{
					{time.Now().Format(time.RFC3339), "Login Failure", "User 'admin,root' tried password: \"p@ss,w0rd\"\nwith newline"},
					{time.Now().Format(time.RFC3339), "Port Scan", "192.168.1.1:80,443,8080,9000"},
				},
			},
			{
				Title:   "Zero Match Table",
				Headers: []string{"Category", "Findings"},
				Rows:    [][]interface{}{},
			},
		},
	}

	fn, err := csvGen.Generate(report, data)
	if err != nil {
		t.Fatalf("CSV generation failed: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(tempDir, fn))
	if err != nil {
		t.Fatalf("Failed to read CSV output: %v", err)
	}

	text := string(content)
	if !strings.Contains(text, "Complex Characters CSV Export") {
		t.Errorf("CSV missing report name")
	}
	if !strings.Contains(text, "No records found matching criteria") {
		t.Errorf("CSV missing empty table handling")
	}
}

func TestGenerator_FilterCriteriaAndInvertedDates(t *testing.T) {
	gen := NewReportGenerator("./storage/test_reports")

	t1 := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC) // Inverted (t2 is before t1)

	mID := uuid.New()
	report := &Report{
		ID:         uuid.New(),
		DateFrom:   &t1,
		DateTo:     &t2,
		MachineIDs: []byte(fmt.Sprintf("[\"%s\"]", mID.String())),
	}

	machineIDs, df, dt := gen.getFilterCriteria(report)

	if len(machineIDs) != 1 || machineIDs[0] != mID {
		t.Errorf("Expected 1 parsed machine ID %s, got %v", mID, machineIDs)
	}

	if df == nil || dt == nil {
		t.Fatalf("Dates should not be nil")
	}

	if df.After(*dt) {
		t.Errorf("Dates were not inverted properly: df=%v, dt=%v", df, dt)
	}

	if !df.Equal(t2) || !dt.Equal(t1) {
		t.Errorf("Expected df to be %v and dt to be %v, got df=%v, dt=%v", t2, t1, df, dt)
	}
}

func TestGenerator_CleanupSafeHandling(t *testing.T) {
	tempDir := filepath.Join(os.TempDir(), "infrapilot_cleanup_test")
	_ = os.MkdirAll(tempDir, 0755)
	defer os.RemoveAll(tempDir)

	pdfGen := NewPDFGenerator(tempDir)
	excelGen := NewExcelGenerator(tempDir)
	csvGen := NewCSVGenerator(tempDir)

	// Clean up non-existent files should return nil without crashing
	if err := pdfGen.Cleanup("non_existent_file.pdf"); err != nil {
		t.Errorf("Cleanup non-existent PDF returned error: %v", err)
	}
	if err := excelGen.Cleanup("non_existent_file.xlsx"); err != nil {
		t.Errorf("Cleanup non-existent Excel returned error: %v", err)
	}
	if err := csvGen.Cleanup("non_existent_file.csv"); err != nil {
		t.Errorf("Cleanup non-existent CSV returned error: %v", err)
	}

	// Create real file and test cleanup
	testFile := filepath.Join(tempDir, "sample_to_delete.pdf")
	_ = os.WriteFile(testFile, []byte("dummy pdf content"), 0644)

	if err := pdfGen.Cleanup("sample_to_delete.pdf"); err != nil {
		t.Errorf("Failed to cleanup existing file: %v", err)
	}

	if _, err := os.Stat(testFile); !os.IsNotExist(err) {
		t.Errorf("File should have been deleted: %s", testFile)
	}
}
