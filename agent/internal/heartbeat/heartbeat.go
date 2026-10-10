package heartbeat

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"infrapilot/agent/internal/client"
	"infrapilot/agent/internal/collector"
	"infrapilot/agent/internal/state"
)

type Request struct {
	Timestamp string `json:"timestamp"`
	Status    string `json:"status"`
	Version   string `json:"version"`
}

type Response struct {
	Status            string   `json:"status"`
	MonitoredServices []string `json:"monitored_services"`
}

func Send(backendURL, machineID, apiKey string) error {
	req := Request{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Status:    "online",
		Version:   "1.0.0",
	}
	data, _ := json.Marshal(req)

	respBytes, err := client.PostWithRetryAndResponse(
		backendURL+"/api/v1/servers/"+machineID+"/heartbeat",
		data,
		"application/json",
	)

	if err != nil {
		log.Println("Heartbeat failed:", err)
		state.Connected = false
		return err
	}

	state.Connected = true
	log.Println("Heartbeat sent")

	if len(respBytes) > 0 {
		var resp Response
		if jsonErr := json.Unmarshal(respBytes, &resp); jsonErr == nil && len(resp.MonitoredServices) > 0 {
			collector.UpdateDynamicMonitoredServices(resp.MonitoredServices)
		}
	}

	return nil
}

type HeartbeatError struct {
	StatusCode int
}

func NewHeartbeatError(statusCode int) *HeartbeatError {
	return &HeartbeatError{StatusCode: statusCode}
}

func (e *HeartbeatError) Error() string {
	return "heartbeat failed with status code: " + strconv.Itoa(e.StatusCode)
}
