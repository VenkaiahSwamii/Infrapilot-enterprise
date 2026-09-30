package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSplunkService(t *testing.T) {
	receivedEvents := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Splunk test-token" {
			t.Errorf("expected Auth header 'Splunk test-token', got '%s'", r.Header.Get("Authorization"))
		}
		var ev SplunkEvent
		dec := json.NewDecoder(r.Body)
		if err := dec.Decode(&ev); err == nil {
			receivedEvents++
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"text":"Success","code":0}`))
	}))
	defer ts.Close()

	cfg := SplunkConfig{
		Enabled:              true,
		HECURL:               ts.URL,
		Token:                "test-token",
		Index:                "test_index",
		SourceType:           "infrapilot:json",
		SSLVerify:            false,
		BatchSize:            1,
		FlushIntervalSeconds: 1,
	}

	svc := NewSplunkService(cfg)
	defer svc.Stop()

	err := svc.SendEvent(map[string]string{"message": "test event"}, "localhost", "test_source")
	if err != nil {
		t.Fatalf("unexpected error sending splunk event: %v", err)
	}

	// Flush queued event synchronously for testing
	if err := svc.Flush(); err != nil {
		t.Fatalf("unexpected error flushing splunk events: %v", err)
	}

	if receivedEvents != 1 {
		t.Errorf("expected 1 event received by test server, got %d", receivedEvents)
	}
}

func TestSplunkServiceAsyncRetry(t *testing.T) {
	received := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received++
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	cfg := SplunkConfig{
		Enabled:              true,
		HECURL:               ts.URL,
		Token:                "test-token",
		BatchSize:            1,
		FlushIntervalSeconds: 1,
	}

	svc := NewSplunkService(cfg)
	defer svc.Stop()

	_ = svc.SendEvent(map[string]string{"data": "test"}, "host", "src")

	// Poll for background worker channel signal (up to 2 seconds)
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && received < 1 {
		time.Sleep(50 * time.Millisecond)
	}

	if received < 1 {
		t.Errorf("expected background worker to send event via flushCh, got %d", received)
	}
}
