package sender

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"infrapilot/agent/internal/cache"
	"infrapilot/agent/internal/client"
	"infrapilot/agent/internal/config"
	"infrapilot/agent/internal/state"
)

var (
	replayMu    sync.Mutex
	isReplaying bool
)

// SendMetrics transmits metrics payload via HTTP POST. If offline, it queues them.
func SendMetrics(backendURL string, machineID string, apiKey string, metrics interface{}) error {
	data, err := json.Marshal(metrics)
	if err != nil {
		return err
	}

	cleanBase := strings.TrimRight(backendURL, "/")
	endpoint := cleanBase + "/api/v1/servers/" + machineID + "/metrics"
	err = client.PostWithRetry(
		endpoint,
		data,
		"application/json",
	)

	if err != nil {
		log.Println("[Sender] Metrics upload failed, caching offline:", err)
		state.Connected = false
		cache.QueueMetric(metrics)
		return err
	}

	state.Connected = true
	log.Println("[Sender] Metrics uploaded successfully.")

	// If successfully sent, replay cached offline metrics in background (safely once)
	if cache.QueueSize() > 0 {
		replayMu.Lock()
		if !isReplaying {
			isReplaying = true
			go ReplayCachedMetrics(backendURL, machineID)
		}
		replayMu.Unlock()
	}

	return nil
}

// SendLogs transmits a batch of log entries via HTTP POST to /api/v1/agent/logs.
func SendLogs(backendURL string, logsPayload interface{}) error {
	data, err := json.Marshal(logsPayload)
	if err != nil {
		return err
	}

	cleanBase := strings.TrimRight(backendURL, "/")
	endpoint := cleanBase + "/api/v1/agent/logs"
	if mid := config.Get().MachineID; mid != "" {
		endpoint += "?machine_id=" + mid
	}
	err = client.PostWithRetry(
		endpoint,
		data,
		"application/json",
	)
	if err != nil {
		log.Println("[Sender] Logs upload failed:", err)
		return err
	}

	log.Println("[Sender] Log entries uploaded successfully.")
	return nil
}

// ReplayCachedMetrics uploads previously queued metrics when agent was offline
func ReplayCachedMetrics(backendURL string, machineID string) {
	defer func() {
		replayMu.Lock()
		isReplaying = false
		replayMu.Unlock()
	}()

	log.Printf("[Sender] Replaying %d cached offline telemetry payloads...", cache.QueueSize())
	for {
		item, ok := cache.PopMetric()
		if !ok {
			break
		}

		data, err := json.Marshal(item)
		if err != nil {
			log.Printf("[Sender] Failed to serialize cached item: %v", err)
			continue
		}

		cleanBase := strings.TrimRight(backendURL, "/")
		endpoint := cleanBase + "/api/v1/servers/" + machineID + "/metrics"
		err = client.PostWithRetry(
			endpoint,
			data,
			"application/json",
		)

		if err != nil {
			log.Printf("[Sender] Failed to upload cached telemetry, re-queueing: %v", err)
			cache.QueueMetric(item)
			state.Connected = false
			break
		}

		log.Println("[Sender] Successfully uploaded cached telemetry payload.")
		time.Sleep(1 * time.Second) // Gentle replay pacing so server isn't flooded
	}
}
