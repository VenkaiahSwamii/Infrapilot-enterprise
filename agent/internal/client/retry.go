package client

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"time"

	"infrapilot/agent/internal/config"
)

func PostWithRetry(url string, body []byte, contentType string) error {
	if HTTPClient == nil {
		_ = InitHTTPClient()
		if HTTPClient == nil {
			HTTPClient = &http.Client{Timeout: 10 * time.Second}
		}
	}

	backoff := []time.Duration{
		2 * time.Second,
		5 * time.Second,
		10 * time.Second,
	}

	var lastErr error
	for i := 0; i < len(backoff); i++ {
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", contentType)

		// Set API Key headers
		apiKey := config.Get().APIKey
		if apiKey != "" {
			req.Header.Set("X-API-Key", apiKey)
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}

		resp, err := HTTPClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}
			lastErr = fmt.Errorf("HTTP status %d", resp.StatusCode)
		} else {
			lastErr = err
		}

		log.Printf("[Agent Client] POST %s retry (%d/%d): %v", url, i+1, len(backoff), lastErr)
		time.Sleep(backoff[i])
	}

	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("server unreachable")
}
