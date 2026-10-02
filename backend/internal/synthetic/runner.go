package synthetic

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

// ExecuteProbe runs a single synthetic HTTP/API check against target application
func ExecuteProbe(test *models.SyntheticTest) *models.SyntheticTestResult {
	now := time.Now()

	result := &models.SyntheticTestResult{
		ID:        uuid.New(),
		TestID:    test.ID,
		Timestamp: now,
		TargetURL: test.URL,
		Method:    strings.ToUpper(strings.TrimSpace(test.Method)),
	}

	if result.Method == "" {
		result.Method = "GET"
	}

	// 1. SSRF Security Check
	if err := ValidateURL(test.URL); err != nil {
		result.Status = "ERROR"
		result.ErrorMessage = fmt.Sprintf("SSRF Security Block: %v", err)
		return result
	}

	timeoutMs := test.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 5000
	}
	timeoutDuration := time.Duration(timeoutMs) * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), timeoutDuration)
	defer cancel()

	// 2. HTTP Request Setup & Headers
	var reqBody io.Reader
	if test.Body != "" && (result.Method == "POST" || result.Method == "PUT" || result.Method == "PATCH") {
		reqBody = bytes.NewBufferString(test.Body)
	}

	req, err := http.NewRequestWithContext(ctx, result.Method, test.URL, reqBody)
	if err != nil {
		result.Status = "ERROR"
		result.ErrorMessage = fmt.Sprintf("Failed to construct HTTP request: %v", err)
		return result
	}

	// Add custom headers if provided
	req.Header.Set("User-Agent", "InfraPilot-SyntheticMonitor/2.0")
	if test.Headers != "" {
		var headersMap map[string]string
		if err := json.Unmarshal([]byte(test.Headers), &headersMap); err == nil {
			for k, v := range headersMap {
				req.Header.Set(k, v)
			}
		}
	}

	// 3. Setup Tracing for Latency Breakdown
	var dnsStart, tlsStart, ttfbStart time.Time
	var dnsTime, tlsTime, ttfbTime float64

	trace := &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:  func(_ httptrace.DNSDoneInfo) { if !dnsStart.IsZero() { dnsTime = float64(time.Since(dnsStart).Microseconds()) / 1000.0 } },
		TLSHandshakeStart: func() { tlsStart = time.Now() },
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) { if !tlsStart.IsZero() { tlsTime = float64(time.Since(tlsStart).Microseconds()) / 1000.0 } },
		GotFirstResponseByte: func() { if !ttfbStart.IsZero() { ttfbTime = float64(time.Since(ttfbStart).Microseconds()) / 1000.0 } },
	}

	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	// 4. Client Transport Configuration
	client := &http.Client{
		Timeout: timeoutDuration,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
			DisableKeepAlives: true,
		},
	}

	start := time.Now()
	ttfbStart = start

	resp, err := client.Do(req)
	totalDuration := float64(time.Since(start).Microseconds()) / 1000.0

	result.ResponseTimeMs = totalDuration
	result.DNSTimeMs = dnsTime
	result.TLSTimeMs = tlsTime
	result.TTFBMs = ttfbTime

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded || strings.Contains(err.Error(), "Client.Timeout") || strings.Contains(err.Error(), "context deadline exceeded") {
			result.Status = "TIMEOUT"
			result.ErrorMessage = fmt.Sprintf("Synthetic test timed out after %d ms", timeoutMs)
		} else {
			result.Status = "ERROR"
			result.ErrorMessage = fmt.Sprintf("Network connection error: %v", err)
		}
		return result
	}
	defer resp.Body.Close()

	result.HTTPStatus = resp.StatusCode

	// 5. Read Response Body & Calculate Size
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024)) // Limit 1MB max
	if err == nil {
		result.ResponseSizeBytes = int64(len(bodyBytes))
	}
	bodyStr := string(bodyBytes)

	// 6. Response Validation Check
	expectedCode := test.ExpectedStatus
	if expectedCode <= 0 {
		expectedCode = 200
	}

	statusMatch := (resp.StatusCode == expectedCode)
	bodyMatch := true
	if test.ValidationContains != "" {
		bodyMatch = strings.Contains(bodyStr, test.ValidationContains)
	}
	result.ValidationPassed = bodyMatch

	thresholdMs := test.ResponseTimeThresholdMs
	if thresholdMs <= 0 {
		thresholdMs = 200.0
	}

	// 7. Result 5-State Classification
	if !statusMatch {
		result.Status = "FAIL"
		result.ErrorMessage = fmt.Sprintf("Unexpected HTTP Status Code: %d (Expected: %d)", resp.StatusCode, expectedCode)
	} else if !bodyMatch {
		result.Status = "FAIL"
		result.ErrorMessage = fmt.Sprintf("Response body validation failed: expected text '%s' not found", test.ValidationContains)
	} else if totalDuration > thresholdMs {
		result.Status = "DEGRADED"
		result.ErrorMessage = fmt.Sprintf("Response time SLA exceeded: %.1f ms (Threshold: %.1f ms)", totalDuration, thresholdMs)
	} else {
		result.Status = "PASS"
	}

	return result
}
