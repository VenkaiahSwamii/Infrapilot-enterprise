package reports

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type ExcelGenerator struct {
	BaseDir string
}

func NewExcelGenerator(baseDir string) *ExcelGenerator {
	return &ExcelGenerator{BaseDir: baseDir}
}

func (e *ExcelGenerator) Generate(report *Report, data map[string]interface{}) (string, error) {
	if err := os.MkdirAll(e.BaseDir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("%s_%s.xlsx", report.Type, report.ID.String())
	filePath := filepath.Join(e.BaseDir, filename)

	f := excelize.NewFile()
	defer f.Close()

	sheet := "Sheet1"
	f.SetCellValue(sheet, "A1", report.Name)
	f.SetCellValue(sheet, "A2", "Generated: "+report.GeneratedAt.Format(time.RFC1123))
	f.SetCellValue(sheet, "A3", "Type: "+string(report.Type))
	f.SetCellValue(sheet, "A4", "Format: "+strings.ToUpper(report.Format))
	if report.Scope != "" {
		f.SetCellValue(sheet, "A5", "Scope: "+report.Scope)
	}

	row := 7
	if title, ok := data["title"].(string); ok && title != "" {
		cell, _ := excelize.CoordinatesToCellName(1, row)
		f.SetCellValue(sheet, cell, title)
		row += 2
	}

	if summary, ok := data["summary"].(string); ok && summary != "" {
		cell, _ := excelize.CoordinatesToCellName(1, row)
		f.SetCellValue(sheet, cell, summary)
		row += 2
	}

	if tables, ok := data["tables"].([]TableData); ok {
		for _, table := range tables {
			if table.Title != "" {
				cell, _ := excelize.CoordinatesToCellName(1, row)
				f.SetCellValue(sheet, cell, table.Title)
				row++
			}

			if len(table.Headers) > 0 {
				for c, header := range table.Headers {
					cell, _ := excelize.CoordinatesToCellName(c+1, row)
					f.SetCellValue(sheet, cell, header)
				}
				row++
			}

			if len(table.Rows) == 0 && len(table.Headers) > 0 {
				cell, _ := excelize.CoordinatesToCellName(1, row)
				f.SetCellValue(sheet, cell, "No records found matching criteria")
				row++
			} else {
				for _, rowData := range table.Rows {
					for c, val := range rowData {
						if c < len(table.Headers) {
							cell, _ := excelize.CoordinatesToCellName(c+1, row)
							f.SetCellValue(sheet, cell, val)
						}
					}
					row++
				}
			}
			row++
		}
	}

	if err := f.SaveAs(filePath); err != nil {
		return "", err
	}

	return filename, nil
}

func (e *ExcelGenerator) Cleanup(filename string) error {
	path := filepath.Join(e.BaseDir, filename)
	if _, err := os.Stat(path); err == nil {
		return os.Remove(path)
	}
	return nil
}
