package logs

import (
	"encoding/json"
	"log"

	"infrapilot/agent/internal/client"
)

func SendLogBatch(backendURL string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	endpoint := backendURL + "/api/v1/agent/logs"
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
