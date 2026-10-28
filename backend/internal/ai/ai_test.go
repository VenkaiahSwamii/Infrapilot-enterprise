package ai

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestAIService_Handlers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	r.POST("/api/v1/ai/analyze", AnalyzeHandler)
	r.POST("/api/v1/ai/chat", ChatHandler)
	r.GET("/api/v1/ai/incidents", GetIncidentsHandler)
	r.GET("/api/v1/ai/recommendations", GetRecommendationsHandler)
	r.GET("/api/v1/ai/health-score", GetHealthScoreHandler)
	r.GET("/api/v1/ai/predictions", GetPredictionsHandler)

	// 1. Test AnalyzeHandler
	analyzeReq := AnalyzeRequest{
		AlertID:  uuid.New().String(),
		ServerID: uuid.New().String(),
	}
	reqBytes, _ := json.Marshal(analyzeReq)
	req1, _ := http.NewRequest("POST", "/api/v1/ai/analyze", bytes.NewBuffer(reqBytes))
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("Expected AnalyzeHandler status 200, got %d", w1.Code)
	}

	// 2. Test ChatHandler (accuracy and clarification queries)
	testQueries := []struct {
		name    string
		request ChatRequest
	}{
		{"Why is Production-01 slow?", ChatRequest{SessionID: "sess-abc", Query: "Why is Production-01 slow?"}},
		{"Where are my agents running", ChatRequest{SessionID: "sess-abc", Query: "where are my agents running"}},
		{"Systems overview", ChatRequest{SessionID: "sess-abc", Query: "systems"}},
		{"Metrics and CPU", ChatRequest{SessionID: "sess-abc", Query: "Show CPU and memory usage"}},
		{"Active alerts", ChatRequest{SessionID: "sess-abc", Query: "Are there any active alerts?"}},
		{"Docker containers", ChatRequest{SessionID: "sess-abc", Query: "Show Docker container status"}},
		{"Clarification on unknown query", ChatRequest{SessionID: "sess-abc", Query: "tell me about quantum computing"}},
		{"AICenter question payload", ChatRequest{SessionID: "sess-abc", Question: "where my agents running"}},
	}

	for _, tc := range testQueries {
		reqBytes, _ := json.Marshal(tc.request)
		req, _ := http.NewRequest("POST", "/api/v1/ai/chat", bytes.NewBuffer(reqBytes))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("Expected ChatHandler status 200 for %s, got %d", tc.name, w.Code)
		}

		var resp ChatResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Errorf("Failed to unmarshal response for %s: %v", tc.name, err)
		}
		if resp.Answer == "" {
			t.Errorf("Expected non-empty answer for %s", tc.name)
		}
	}

	// 3. Test GetIncidentsHandler
	req3, _ := http.NewRequest("GET", "/api/v1/ai/incidents", nil)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Errorf("Expected GetIncidentsHandler status 200, got %d", w3.Code)
	}

	// 4. Test GetRecommendationsHandler
	req4, _ := http.NewRequest("GET", "/api/v1/ai/recommendations", nil)
	w4 := httptest.NewRecorder()
	r.ServeHTTP(w4, req4)
	if w4.Code != http.StatusOK {
		t.Errorf("Expected GetRecommendationsHandler status 200, got %d", w4.Code)
	}

	// 5. Test GetHealthScoreHandler
	req5, _ := http.NewRequest("GET", "/api/v1/ai/health-score", nil)
	w5 := httptest.NewRecorder()
	r.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Errorf("Expected GetHealthScoreHandler status 200, got %d", w5.Code)
	}

	// 6. Test GetPredictionsHandler
	req6, _ := http.NewRequest("GET", "/api/v1/ai/predictions", nil)
	w6 := httptest.NewRecorder()
	r.ServeHTTP(w6, req6)
	if w6.Code != http.StatusOK {
		t.Errorf("Expected GetPredictionsHandler status 200, got %d", w6.Code)
	}
}
