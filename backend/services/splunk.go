package services

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

const splunkURL = "https://192.168.1.2:8088/services/collector/event"

type SplunkPayload struct {
	Event      interface{} `json:"event"`
	Index      string      `json:"index"`
	SourceType string      `json:"sourcetype"`
}

func SendToSplunk(data interface{}) error {

	token := os.Getenv("SPLUNK_HEC_TOKEN")

	if token == "" {
		return fmt.Errorf("SPLUNK_HEC_TOKEN is not set")
	}

	payload := SplunkPayload{
		Event:      data,
		Index:      "infrapilot",
		SourceType: "infrapilot:metrics",
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(
		"POST",
		splunkURL,
		bytes.NewBuffer(jsonData),
	)

	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Splunk "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}

	resp, err := client.Do(req)

	if err != nil {
		return err
	}

	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Splunk returned status: %s", resp.Status)
	}

	return nil
}
