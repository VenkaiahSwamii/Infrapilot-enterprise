package services

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestSendToSplunk(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Splunk test-token" {
			t.Errorf("unexpected token: %s", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	os.Setenv("SPLUNK_HEC_TOKEN", "test-token")
	defer os.Unsetenv("SPLUNK_HEC_TOKEN")

	// Verify error when token missing
	os.Unsetenv("SPLUNK_HEC_TOKEN")
	if err := SendToSplunk(map[string]string{"msg": "test"}); err == nil {
		t.Error("expected error when SPLUNK_HEC_TOKEN is missing")
	}
}
