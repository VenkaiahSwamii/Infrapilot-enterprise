package logs

import (
	"encoding/json"
	"log"
	"strings"

	"infrapilot/agent/internal/client"
	"infrapilot/agent/internal/config"
)

func SendLogBatch(backendURL string, payload interface{}) error {
	data, err := json.Marshal(payload)
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
		log.Println("[LogsSender] Batch log transmission failed:", err)
		return err
	}

	log.Println("[LogsSender] Log entries batch transmitted successfully.")
	return nil
}
