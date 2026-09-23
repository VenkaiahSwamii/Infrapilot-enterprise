package register

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// RegisterAgent registers the machine metadata on startup and returns the machine_id and api_key.
// When enrollmentToken is present it uses the enterprise enrollment endpoint.
func RegisterAgent(backendURL string, payload map[string]interface{}, enrollmentToken string) (map[string]string, error) {
	endpoint := backendURL + "/api/v1/servers/register"
	if enrollmentToken != "" {
		payload["enrollment_token"] = enrollmentToken
		endpoint = backendURL + "/api/v1/servers/enroll"
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("backend returned status code %d", resp.StatusCode)
	}

	var rawResult map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&rawResult); err != nil {
		return nil, err
	}

	result := make(map[string]string)
	for k, v := range rawResult {
		if s, ok := v.(string); ok {
			result[k] = s
		} else if v != nil {
			result[k] = fmt.Sprintf("%v", v)
		}
	}

	return result, nil
}
