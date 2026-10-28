package reports

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type CSVGenerator struct {
	BaseDir string
}

func NewCSVGenerator(baseDir string) *CSVGenerator {
	return &CSVGenerator{BaseDir: baseDir}
}

func (c *CSVGenerator) Generate(report *Report, data map[string]interface{}) (string, error) {
	if err := os.MkdirAll(c.BaseDir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("%s_%s.csv", report.Type, report.ID.String())
	filePath := filepath.Join(c.BaseDir, filename)

	file, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Write metadata header
	writer.Write([]string{"Report: " + report.Name})
	writer.Write([]string{"Generated: " + report.GeneratedAt.Format(time.RFC1123)})
	writer.Write([]string{"Type: " + string(report.Type)})
	writer.Write([]string{"Format: " + strings.ToUpper(report.Format)})
	if report.Scope != "" {
		writer.Write([]string{"Scope: " + report.Scope})
	}
	writer.Write([]string{})

	// Write tables
	if tables, ok := data["tables"].([]TableData); ok {
		for _, table := range tables {
			if title := table.Title; title != "" {
				writer.Write([]string{"=== " + title + " ==="})
				writer.Write([]string{})
			}

			if len(table.Headers) > 0 {
				if err := writer.Write(table.Headers); err != nil {
					return "", err
				}
			}

			if len(table.Rows) == 0 && len(table.Headers) > 0 {
				writer.Write([]string{"No records found matching criteria"})
			} else {
				for _, row := range table.Rows {
					record := make([]string, len(table.Headers))
					for i := 0; i < len(table.Headers); i++ {
						if i < len(row) && row[i] != nil {
							record[i] = fmt.Sprintf("%v", row[i])
						}
					}
					if err := writer.Write(record); err != nil {
						return "", err
					}
				}
			}
			writer.Write([]string{})
		}
	}

	return filename, nil
}

func (c *CSVGenerator) Cleanup(filename string) error {
	path := filepath.Join(c.BaseDir, filename)
	if _, err := os.Stat(path); err == nil {
		return os.Remove(path)
	}
	return nil
}
