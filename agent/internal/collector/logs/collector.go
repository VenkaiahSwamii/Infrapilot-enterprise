package logs

import (
	"context"
	"log"

	"infrapilot/agent/internal/collector"
	"infrapilot/agent/internal/sender"

	"github.com/google/uuid"
)

// Collector implements collector.Runner to collect and ship agent logs
type Collector struct {
	machineID uuid.UUID
	serverURL string
	logsCol   *collector.LogsCollector
}

// NewCollector returns a new instance of Collector
func NewCollector(machineID, serverURL string) *Collector {
	id, err := uuid.Parse(machineID)
	if err != nil {
		id = uuid.New()
	}
	return &Collector{
		machineID: id,
		serverURL: serverURL,
		logsCol:   collector.NewLogsCollector(),
	}
}

func (c *Collector) Name() string {
	return "logs"
}

func (c *Collector) Run(ctx context.Context) {
	entries := c.logsCol.CollectLogs(c.machineID)
	if len(entries) > 0 && c.serverURL != "" {
		if err := sender.SendLogs(c.serverURL, entries); err != nil {
			log.Printf("[LogsCollector] Failed to transmit logs to %s: %v", c.serverURL, err)
		}
	}
}
