package services

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// SplunkConfig defines settings for Splunk HTTP Event Collector (HEC).
type SplunkConfig struct {
	Enabled              bool   `json:"enabled"`
	HECURL               string `json:"hec_url"`
	Token                string `json:"token"`
	Index                string `json:"index"`
	SourceType           string `json:"sourcetype"`
	Source               string `json:"source"`
	SSLVerify            bool   `json:"ssl_verify"`
	BatchSize            int    `json:"batch_size"`
	FlushIntervalSeconds int    `json:"flush_interval_seconds"`
}

// SplunkEvent represents a single event sent to Splunk HEC.
type SplunkEvent struct {
	Time       int64       `json:"time,omitempty"`
	Host       string      `json:"host,omitempty"`
	Source     string      `json:"source,omitempty"`
	SourceType string      `json:"sourcetype,omitempty"`
	Index      string      `json:"index,omitempty"`
	Event      interface{} `json:"event"`
}

// SplunkService manages asynchronous telemetry shipping to Splunk.
type SplunkService struct {
	config SplunkConfig
	client *http.Client

	queue []SplunkEvent

	mu sync.Mutex

	// Prevent multiple Flush() calls from running at the same time.
	flushMu sync.Mutex

	// Background worker shutdown.
	stopCh   chan struct{}
	stopOnce sync.Once

	// Non-blocking signal to flush immediately.
	flushCh chan struct{}
}

// NewSplunkService initializes the Splunk HEC service.
func NewSplunkService(cfg SplunkConfig) *SplunkService {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 10
	}

	if cfg.FlushIntervalSeconds <= 0 {
		cfg.FlushIntervalSeconds = 5
	}

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: !cfg.SSLVerify,
		},
	}

	s := &SplunkService{
		config: cfg,

		client: &http.Client{
			Timeout:   10 * time.Second,
			Transport: tr,
		},

		queue: make([]SplunkEvent, 0, cfg.BatchSize),

		stopCh: make(chan struct{}),

		flushCh: make(chan struct{}, 1),
	}

	if cfg.Enabled {
		log.Printf(
			"[Splunk] enabled: HEC=%s index=%s sourcetype=%s batch=%d interval=%ds",
			cfg.HECURL,
			cfg.Index,
			cfg.SourceType,
			cfg.BatchSize,
			cfg.FlushIntervalSeconds,
		)

		go s.startFlusher()
	} else {
		log.Println("[Splunk] disabled")
	}

	return s
}

// SendEvent adds an event to the internal queue.
//
// IMPORTANT:
// This function never waits for Splunk.
// If Splunk is down, the event stays in the queue and will be retried.
func (s *SplunkService) SendEvent(eventData interface{}, host, source string) error {
	if !s.config.Enabled {
		return nil
	}

	event := SplunkEvent{
		Time:       time.Now().Unix(),
		Host:       host,
		Source:     source,
		SourceType: s.config.SourceType,
		Index:      s.config.Index,
		Event:      eventData,
	}

	s.mu.Lock()
	s.queue = append(s.queue, event)

	queueSize := len(s.queue)
	shouldFlush := queueSize >= s.config.BatchSize

	s.mu.Unlock()

	// Never perform HTTP here.
	// Just tell the background worker to flush.
	if shouldFlush {
		select {
		case s.flushCh <- struct{}{}:
		default:
		}
	}

	return nil
}

// Flush sends queued events to Splunk HEC.
//
// Events are removed from the queue ONLY after Splunk confirms success.
// If Splunk fails, events remain queued for retry.
func (s *SplunkService) Flush() error {
	if !s.config.Enabled {
		return nil
	}

	// Only one flush at a time.
	s.flushMu.Lock()
	defer s.flushMu.Unlock()

	// Copy current queue without holding the mutex during network I/O.
	s.mu.Lock()

	if len(s.queue) == 0 {
		s.mu.Unlock()
		return nil
	}

	eventsToSend := make([]SplunkEvent, len(s.queue))
	copy(eventsToSend, s.queue)

	s.mu.Unlock()

	var body bytes.Buffer

	for _, event := range eventsToSend {
		data, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("failed to marshal Splunk event: %w", err)
		}

		body.Write(data)
		body.WriteByte('\n')
	}

	req, err := http.NewRequest(
		http.MethodPost,
		s.config.HECURL,
		&body,
	)
	if err != nil {
		return fmt.Errorf("failed to create Splunk HEC request: %w", err)
	}

	req.Header.Set(
		"Authorization",
		"Splunk "+s.config.Token,
	)

	req.Header.Set(
		"Content-Type",
		"application/json",
	)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("Splunk HEC request failed: %w", err)
	}

	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf(
			"Splunk HEC returned HTTP %d: %s",
			resp.StatusCode,
			string(responseBody),
		)
	}

	// Splunk accepted the batch.
	// Now remove exactly the events that were sent.
	s.mu.Lock()

	if len(s.queue) >= len(eventsToSend) {
		s.queue = s.queue[len(eventsToSend):]
	} else {
		// Safety fallback.
		s.queue = s.queue[:0]
	}

	remaining := len(s.queue)

	s.mu.Unlock()

	log.Printf(
		"[Splunk] sent %d events successfully, queue remaining=%d",
		len(eventsToSend),
		remaining,
	)

	return nil
}

// startFlusher runs in the background and retries failed events.
func (s *SplunkService) startFlusher() {
	interval := time.Duration(
		s.config.FlushIntervalSeconds,
	) * time.Second

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {

		case <-ticker.C:
			if err := s.Flush(); err != nil {
				log.Printf("[Splunk] flush failed, retrying: %v", err)
			}

		case <-s.flushCh:
			if err := s.Flush(); err != nil {
				log.Printf("[Splunk] immediate flush failed, retrying: %v", err)
			}

		case <-s.stopCh:
			if err := s.Flush(); err != nil {
				log.Printf("[Splunk] final flush failed: %v", err)
			}
			return
		}
	}
}

// Stop shuts down the Splunk background worker safely.
func (s *SplunkService) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopCh)
	})
}
