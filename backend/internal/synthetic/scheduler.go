package synthetic

import (
	"log"
	"sync"
	"time"

	"infrapilot/backend/internal/models"
)

type Scheduler struct {
	service *Service
	stopCh  chan struct{}
	mu      sync.Mutex
	running bool
}

func NewScheduler(service *Service) *Scheduler {
	return &Scheduler{
		service: service,
		stopCh:  make(chan struct{}),
	}
}

func (s *Scheduler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	log.Printf("[Synthetic Scheduler] Starting background synthetic probe execution loop...")
	go s.runLoop()
}

func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	s.running = false
	close(s.stopCh)
	log.Printf("[Synthetic Scheduler] Background synthetic probe scheduler stopped.")
}

func (s *Scheduler) runLoop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Run initial sweep on startup
	s.executeAllEnabled()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.executeAllEnabled()
		}
	}
}

func (s *Scheduler) executeAllEnabled() {
	tests, err := s.service.GetAllTests()
	if err != nil || len(tests) == 0 {
		return
	}

	now := time.Now()

	for _, t := range tests {
		if !t.Enabled {
			continue
		}

		interval := t.IntervalSeconds
		if interval <= 0 {
			interval = 30
		}

		shouldRun := false
		if t.LastCheckedAt == nil {
			shouldRun = true
		} else if now.Sub(*t.LastCheckedAt) >= time.Duration(interval)*time.Second {
			shouldRun = true
		}

		if shouldRun {
			testCopy := t
			go func(target models.SyntheticTest) {
				s.service.ExecuteAndRecordTest(&target)
			}(testCopy)
		}
	}
}
