package reports

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
)

type PDFGenerator struct {
	BaseDir string
}

func NewPDFGenerator(baseDir string) *PDFGenerator {
	return &PDFGenerator{BaseDir: baseDir}
}

func (p *PDFGenerator) Generate(report *Report, data map[string]interface{}) (string, error) {
	if err := os.MkdirAll(p.BaseDir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("%s_%s.pdf", report.Type, report.ID.String())
	filePath := filepath.Join(p.BaseDir, filename)

	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.SetAutoPageBreak(true, 15)
	pdf.SetTitle(report.Name, true)
	pdf.SetAuthor("InfraPilot Enterprise", true)
	pdf.SetCreator("InfraPilot Reporting Engine", true)

	pdf.AddPage()

	// Header
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(0, 10, report.Name)
	pdf.Ln(12)

	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 6, fmt.Sprintf("Generated: %s", report.GeneratedAt.Format(time.RFC1123)))
	pdf.Ln(6)
	pdf.Cell(0, 6, fmt.Sprintf("Type: %s", strings.ReplaceAll(string(report.Type), "_", " ")))
	pdf.Ln(6)
	pdf.Cell(0, 6, fmt.Sprintf("Format: %s", strings.ToUpper(report.Format)))
	if report.Scope != "" {
		pdf.Ln(6)
		pdf.Cell(0, 6, fmt.Sprintf("Scope: %s", report.Scope))
	}
	pdf.Ln(10)

	if title, ok := data["title"].(string); ok && title != "" {
		pdf.SetFont("Arial", "B", 13)
		pdf.Cell(0, 8, title)
		pdf.Ln(10)
	}

	if summary, ok := data["summary"].(string); ok && summary != "" {
		pdf.SetFont("Arial", "", 10)
		pdf.MultiCell(0, 5, summary, "", "", false)
		pdf.Ln(6)
	}

	if tables, ok := data["tables"].([]TableData); ok {
		for _, table := range tables {
			renderPDFTable(pdf, table)
			pdf.Ln(6)
		}
	}

	// Footer
	pdf.SetY(-15)
	pdf.SetFont("Arial", "I", 8)
	pdf.Cell(0, 10, fmt.Sprintf("Page %d", pdf.PageNo()))

	outFile, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer outFile.Close()

	if err := pdf.Output(outFile); err != nil {
		return "", err
	}

	return filename, nil
}

func renderPDFTable(pdf *gofpdf.Fpdf, table TableData) {
	if len(table.Headers) == 0 {
		return
	}

	if table.Title != "" {
		pdf.SetFont("Arial", "B", 11)
		pdf.Cell(0, 7, table.Title)
		pdf.Ln(8)
	}

	pageW, _ := pdf.GetPageSize()
	marginL, _, marginR, _ := pdf.GetMargins()
	availWidth := pageW - marginL - marginR
	colWidth := availWidth / float64(len(table.Headers))
	if colWidth < 20 {
		colWidth = 20
	}

	// Header Row
	pdf.SetFont("Arial", "B", 9)
	pdf.SetFillColor(240, 243, 246)
	for _, header := range table.Headers {
		pdf.CellFormat(colWidth, 7, header, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	// Rows
	pdf.SetFont("Arial", "", 9)
	if len(table.Rows) == 0 {
		pdf.CellFormat(availWidth, 7, "No records found matching criteria", "1", 0, "C", false, 0, "")
		pdf.Ln(-1)
		return
	}

	for _, row := range table.Rows {
		for i := 0; i < len(table.Headers); i++ {
			val := ""
			if i < len(row) && row[i] != nil {
				val = fmt.Sprintf("%v", row[i])
			}
			pdf.CellFormat(colWidth, 6, truncate(val, 36), "1", 0, "L", false, 0, "")
		}
		pdf.Ln(-1)
	}
}

type TableData struct {
	Title   string
	Headers []string
	Rows    [][]interface{}
}

func truncate(text string, max int) string {
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.ReplaceAll(text, "\r", " ")
	if len(text) <= max {
		return text
	}
	if max > 3 {
		return text[:max-3] + "..."
	}
	return text[:max]
}

func (p *PDFGenerator) Cleanup(filename string) error {
	path := filepath.Join(p.BaseDir, filename)
	if _, err := os.Stat(path); err == nil {
		return os.Remove(path)
	}
	return nil
}
