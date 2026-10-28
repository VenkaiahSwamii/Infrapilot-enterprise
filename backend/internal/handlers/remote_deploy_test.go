package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"infrapilot/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func TestRemoteDeployHandler_Validation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := services.NewRemoteDeployService(nil)
	handler := NewRemoteDeployHandler(svc)

	r := gin.New()
	r.POST("/api/v1/agent/remote-deploy/execute", handler.ExecuteDeploy)

	// Case 1: Empty body -> 400
	reqEmpty, _ := http.NewRequest("POST", "/api/v1/agent/remote-deploy/execute", bytes.NewBuffer([]byte("{}")))
	reqEmpty.Header.Set("Content-Type", "application/json")
	wEmpty := httptest.NewRecorder()
	r.ServeHTTP(wEmpty, reqEmpty)

	if wEmpty.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty host/username, got %d", wEmpty.Code)
	}

	// Case 2: Missing username -> 400
	payloadNoUser, _ := json.Marshal(map[string]interface{}{
		"host": "192.168.1.50",
	})
	reqNoUser, _ := http.NewRequest("POST", "/api/v1/agent/remote-deploy/execute", bytes.NewBuffer(payloadNoUser))
	reqNoUser.Header.Set("Content-Type", "application/json")
	wNoUser := httptest.NewRecorder()
	r.ServeHTTP(wNoUser, reqNoUser)

	if wNoUser.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing username, got %d", wNoUser.Code)
	}
}

func TestRemoteDeployHandler_AsyncExecutionAndPolling(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := services.NewRemoteDeployService(nil)
	handler := NewRemoteDeployHandler(svc)

	r := gin.New()
	r.POST("/api/v1/agent/remote-deploy/execute", handler.ExecuteDeploy)
	r.GET("/api/v1/agent/remote-deploy/:id", handler.GetDeployment)

	// Trigger async deployment
	payload, _ := json.Marshal(map[string]interface{}{
		"host":       "192.168.1.28",
		"port":       22,
		"username":   "ubuntu",
		"password":   "testpass",
		"server_url": "http://192.168.1.24:8080",
	})
	req, _ := http.NewRequest("POST", "/api/v1/agent/remote-deploy/execute", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from async deploy execute, got %d: %s", w.Code, w.Body.String())
	}

	var res services.RemoteDeployResult
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response JSON: %v", err)
	}

	if res.DeploymentID == "" {
		t.Errorf("expected non-empty deployment_id in response")
	}
	if res.Status != "running" {
		t.Errorf("expected status 'running', got %s", res.Status)
	}
	if len(res.Steps) != 6 {
		t.Errorf("expected 6 steps in initial async response, got %d", len(res.Steps))
	}

	// Poll status via GET /api/v1/agent/remote-deploy/:id
	pollReq, _ := http.NewRequest("GET", "/api/v1/agent/remote-deploy/"+res.DeploymentID, nil)
	pollW := httptest.NewRecorder()
	r.ServeHTTP(pollW, pollReq)

	if pollW.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from polling status, got %d: %s", pollW.Code, pollW.Body.String())
	}

	var pollRes services.RemoteDeployResult
	if err := json.Unmarshal(pollW.Body.Bytes(), &pollRes); err != nil {
		t.Fatalf("failed to decode polled response JSON: %v", err)
	}

	if pollRes.DeploymentID != res.DeploymentID {
		t.Errorf("polled deployment ID mismatch: %s vs %s", pollRes.DeploymentID, res.DeploymentID)
	}

	// 404 for non-existent ID
	badPollReq, _ := http.NewRequest("GET", "/api/v1/agent/remote-deploy/dep_nonexistent", nil)
	badPollW := httptest.NewRecorder()
	r.ServeHTTP(badPollW, badPollReq)

	if badPollW.Code != http.StatusNotFound {
		t.Errorf("expected 404 for non-existent deployment ID, got %d", badPollW.Code)
	}
}
