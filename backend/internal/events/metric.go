package events

import "time"

// MetricReceivedEvent is published when metrics are received from an agent
type MetricReceivedEvent struct {
	MachineID string
	Hostname  string
	IPAddress string
	OS        string
	CPU       float64
	Memory    float64
	Disk      float64
	Upload    float64
	Download  float64
	Time      time.Time
}

func (e MetricReceivedEvent) Name() string {
	return "metric.received"
}

func (e MetricReceivedEvent) Timestamp() time.Time {
	return e.Time
}
