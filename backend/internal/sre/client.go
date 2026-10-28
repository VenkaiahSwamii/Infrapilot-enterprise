package sre

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

type CircuitState string

const (
	StateClosed   CircuitState = "CLOSED"
	StateOpen     CircuitState = "OPEN"
	StateHalfOpen CircuitState = "HALF_OPEN"
)

type CircuitBreaker struct {
	mu           sync.RWMutex
	state        CircuitState
	failures     int
	threshold    int
	lastFailure  time.Time
	cooldown     time.Duration
}

func NewCircuitBreaker(threshold int, cooldown time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		state:     StateClosed,
		threshold: threshold,
		cooldown:  cooldown,
	}
}

func (cb *CircuitBreaker) AllowRequest() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()
	if cb.state == StateOpen {
		if now.Sub(cb.lastFailure) > cb.cooldown {
			cb.state = StateHalfOpen
			return true
		}
		return false
	}
	return true
}

func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures = 0
	cb.state = StateClosed
}

func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures++
	cb.lastFailure = time.Now()
	if cb.failures >= cb.threshold {
		cb.state = StateOpen
	}
}

func (cb *CircuitBreaker) State() CircuitState {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}

type Client struct {
	baseURL        string
	httpClient     *http.Client
	circuitBreaker *CircuitBreaker
}

func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = os.Getenv("SRE_ENGINE_URL")
	}
	if baseURL == "" {
		baseURL = "http://127.0.0.1:8001"
	}

	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 4 * time.Second,
		},
		circuitBreaker: NewCircuitBreaker(3, 5*time.Second),
	}
}

var ErrCircuitOpen = errors.New("SRE Engine circuit breaker is open (service temporarily offline)")

func (c *Client) post(ctx context.Context, endpoint string, payload interface{}, target interface{}) error {
	if !c.circuitBreaker.AllowRequest() {
		return ErrCircuitOpen
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.circuitBreaker.RecordFailure()
		return fmt.Errorf("SRE engine connection error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		c.circuitBreaker.RecordFailure()
		return fmt.Errorf("SRE engine returned server error: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("SRE engine error (%d): %s", resp.StatusCode, string(body))
	}

	c.circuitBreaker.RecordSuccess()

	if target != nil {
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("failed to unmarshal response: %w", err)
		}
	}
	return nil
}

func (c *Client) get(ctx context.Context, endpoint string, target interface{}) error {
	if !c.circuitBreaker.AllowRequest() {
		return ErrCircuitOpen
	}

	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.circuitBreaker.RecordFailure()
		return fmt.Errorf("SRE engine connection error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		c.circuitBreaker.RecordFailure()
		return fmt.Errorf("SRE engine returned server error: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("SRE engine error (%d): %s", resp.StatusCode, string(body))
	}

	c.circuitBreaker.RecordSuccess()

	if target != nil {
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("failed to unmarshal response: %w", err)
		}
	}
	return nil
}

func (c *Client) Query(ctx context.Context, query string) (map[string]interface{}, error) {
	var resp map[string]interface{}
	err := c.post(ctx, "/api/v1/query", map[string]string{"query": query}, &resp)
	return resp, err
}

func (c *Client) GetTopology(ctx context.Context) (map[string]interface{}, error) {
	var resp map[string]interface{}
	err := c.get(ctx, "/api/v1/topology", &resp)
	return resp, err
}

func (c *Client) UpsertNode(ctx context.Context, node interface{}) error {
	return c.post(ctx, "/api/v1/topology/node", node, nil)
}

func (c *Client) AddDependency(ctx context.Context, consumerID, dependencyID string) error {
	return c.post(ctx, "/api/v1/topology/dependency", map[string]string{
		"consumer_id":   consumerID,
		"dependency_id": dependencyID,
	}, nil)
}

func (c *Client) TimeTravel(ctx context.Context, payload interface{}) (map[string]interface{}, error) {
	var resp map[string]interface{}
	err := c.post(ctx, "/api/v1/time-travel", payload, &resp)
	return resp, err
}

func (c *Client) EvaluateSLO(ctx context.Context, payload interface{}) (map[string]interface{}, error) {
	var resp map[string]interface{}
	err := c.post(ctx, "/api/v1/slo/evaluate", payload, &resp)
	return resp, err
}

func (c *Client) CompareDrift(ctx context.Context, payload interface{}) (map[string]interface{}, error) {
	var resp map[string]interface{}
	err := c.post(ctx, "/api/v1/drift/compare", payload, &resp)
	return resp, err
}

func (c *Client) GeneratePostMortem(ctx context.Context, payload interface{}) (map[string]interface{}, error) {
	var resp map[string]interface{}
	err := c.post(ctx, "/api/v1/postmortem/generate", payload, &resp)
	return resp, err
}
