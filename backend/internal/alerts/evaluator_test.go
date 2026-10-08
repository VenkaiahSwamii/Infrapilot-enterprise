package alerts

import (
	"testing"
	"time"

	"infrapilot/backend/internal/models"
	"infrapilot/backend/internal/services"

	"github.com/google/uuid"
)

func TestSelectMetricValue(t *testing.T) {
	sample := models.Metric{
		CPUUsage:       91.5,
		MemoryPercent:  86.4,
		MemoryUsage:    86.4,
		DiskPercent:    96.0,
		DiskUsage:      96.0,
		LatencyMs:      215.0,
		CPUTemperature: 78.5,
	}

	tests := []struct {
		metricName string
		wantValue  float64
		wantOK     bool
	}{
		{"cpu_usage", 91.5, true},
		{"cpu", 91.5, true},
		{"memory_percent", 86.4, true},
		{"ram", 86.4, true},
		{"disk_percent", 96.0, true},
		{"disk", 96.0, true},
		{"latency_ms", 215.0, true},
		{"latency", 215.0, true},
		{"cpu_temperature", 78.5, true},
		{"temperature", 78.5, true},
		{"unknown_metric", 0.0, false},
	}

	for _, tt := range tests {
		t.Run(tt.metricName, func(t *testing.T) {
			gotVal, gotOK := SelectMetricValue(sample, tt.metricName)
			if gotOK != tt.wantOK {
				t.Fatalf("SelectMetricValue(%q) ok = %v, want %v", tt.metricName, gotOK, tt.wantOK)
			}
			if gotOK && gotVal != tt.wantValue {
				t.Errorf("SelectMetricValue(%q) value = %.1f, want %.1f", tt.metricName, gotVal, tt.wantValue)
			}
		})
	}

	t.Run("ExtendedMetricsWithInput", func(t *testing.T) {
		input := services.SaveMetricInput{
			PacketLoss:   12.5,
			UploadMbps:   150.0,
			DownloadMbps: 300.0,
			DiskReadBps:  5000000,
			DiskWriteBps: 2000000,
		}

		if val, ok := SelectMetricValue(sample, "packet_loss", input); !ok || val != 12.5 {
			t.Errorf("SelectMetricValue(packet_loss) = %.1f, ok = %v; want 12.5, true", val, ok)
		}
		if val, ok := SelectMetricValue(sample, "upload_mbps", input); !ok || val != 150.0 {
			t.Errorf("SelectMetricValue(upload_mbps) = %.1f, ok = %v; want 150.0, true", val, ok)
		}
		if val, ok := SelectMetricValue(sample, "download_mbps", input); !ok || val != 300.0 {
			t.Errorf("SelectMetricValue(download_mbps) = %.1f, ok = %v; want 300.0, true", val, ok)
		}
		if val, ok := SelectMetricValue(sample, "disk_read_bps", input); !ok || val != 5000000 {
			t.Errorf("SelectMetricValue(disk_read_bps) = %.1f, ok = %v; want 5000000, true", val, ok)
		}
		if val, ok := SelectMetricValue(sample, "disk_write_bps", input); !ok || val != 2000000 {
			t.Errorf("SelectMetricValue(disk_write_bps) = %.1f, ok = %v; want 2000000, true", val, ok)
		}
	})
}

func TestRuleCache(t *testing.T) {
	cache := &RuleCache{
		ttl: 100 * time.Millisecond,
	}

	rules := cache.GetEnabledRules()
	if len(rules) == 0 {
		t.Fatalf("GetEnabledRules returned empty slice, expected default rules")
	}

	// Invalidate cache
	cache.InvalidateCache()
	InvalidateRuleCache()

	rules2 := cache.GetEnabledRules()
	if len(rules2) != len(rules) {
		t.Errorf("Expected reloaded rules count to match default rules count")
	}
}

func TestEvaluateMetrics_NoCrash(t *testing.T) {
	machine := models.Machine{
		ID:       uuid.New(),
		Hostname: "test-server-01",
	}
	metric := models.Metric{
		ID:             uuid.New(),
		MachineID:      machine.ID,
		CPUUsage:       45.0,
		MemoryPercent:  50.0,
		DiskPercent:    60.0,
		LatencyMs:      30.0,
		CPUTemperature: 42.0,
	}

	// Database is nil in unit test, should gracefully fallback and pass without panic
	err := EvaluateMetrics(machine, metric)
	if err != nil {
		t.Errorf("EvaluateMetrics returned unexpected error: %v", err)
	}
}
