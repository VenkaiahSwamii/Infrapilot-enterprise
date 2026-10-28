package sre

import (
	"context"
	"log"
	"strings"
	"time"

	"infrapilot/backend/internal/repository"
)

type TopologyNodePayload struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	Host      string  `json:"host"`
	Port      int     `json:"port"`
	Status    string  `json:"status"`
	LatencyMs float64 `json:"latency_ms"`
}

type TopologySyncWorker struct {
	serverRepo *repository.ServerRepository
	client     *Client
}

func NewTopologySyncWorker(repo *repository.ServerRepository, client *Client) *TopologySyncWorker {
	return &TopologySyncWorker{
		serverRepo: repo,
		client:     client,
	}
}

// SyncOnce reads servers from database and syncs them into the SRE Engine topology
func (w *TopologySyncWorker) SyncOnce(ctx context.Context) (int, error) {
	if w.serverRepo == nil || w.client == nil {
		return 0, nil
	}

	servers, err := w.serverRepo.ListServers()
	if err != nil {
		return 0, err
	}

	synced := 0
	for _, s := range servers {
		nodeType := "HOST"
		port := 0
		lowerHost := strings.ToLower(s.Hostname)

		switch {
		case strings.Contains(lowerHost, "db") || strings.Contains(lowerHost, "postgres"):
			nodeType = "DATABASE"
			port = 5432
		case strings.Contains(lowerHost, "gateway") || strings.Contains(lowerHost, "router") || strings.Contains(lowerHost, "wifi"):
			nodeType = "GATEWAY"
			port = 80
		case strings.Contains(lowerHost, "web") || strings.Contains(lowerHost, "frontend"):
			nodeType = "WEB"
			port = 3000
		case strings.Contains(lowerHost, "api") || strings.Contains(lowerHost, "backend"):
			nodeType = "API"
			port = 8080
		}

		status := "HEALTHY"
		if !s.Online || strings.EqualFold(s.Status, "OFFLINE") {
			status = "CRITICAL"
		} else if s.HealthScore > 0 && s.HealthScore < 60.0 {
			status = "DEGRADED"
		}

		latency := 2.5
		if s.LinuxMetric != nil && s.LinuxMetric.LatencyMs > 0 {
			latency = s.LinuxMetric.LatencyMs
		}

		id := s.ID.String()
		if id == "" || id == "00000000-0000-0000-0000-000000000000" {
			id = "srv-" + s.Hostname
		}

		node := TopologyNodePayload{
			ID:        id,
			Name:      s.Hostname,
			Type:      nodeType,
			Host:      s.IPAddress,
			Port:      port,
			Status:    status,
			LatencyMs: latency,
		}

		if err := w.client.UpsertNode(ctx, node); err == nil {
			synced++
			_ = w.client.AddDependency(ctx, id, "node-backend")
		}
	}

	// Ensure Core Backend is dynamically registered in SRE topology
	backendNode := TopologyNodePayload{
		ID:        "node-backend",
		Name:      "InfraPilot Core Backend",
		Type:      "API",
		Host:      "127.0.0.1",
		Port:      8080,
		Status:    "HEALTHY",
		LatencyMs: 1.5,
	}
	_ = w.client.UpsertNode(ctx, backendNode)

	return synced, nil
}

// Start begins periodic background synchronization
func (w *TopologySyncWorker) Start(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if count, err := w.SyncOnce(ctx); err != nil {
				log.Printf("[SRE-SyncWorker] Sync error: %v", err)
			} else if count > 0 {
				log.Printf("[SRE-SyncWorker] Successfully synchronized %d nodes to SRE Engine", count)
			}
		}
	}
}
