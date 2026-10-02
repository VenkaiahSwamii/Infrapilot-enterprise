package network

import (
	"log"
	"sync"
	"time"
)

type Scheduler struct {
	service *Service
	stopChan chan struct{}
	wg       sync.WaitGroup
}

func NewScheduler(service *Service) *Scheduler {
	return &Scheduler{
		service:  service,
		stopChan: make(chan struct{}),
	}
}

func (s *Scheduler) Start() {
	s.wg.Add(1)
	go s.runLoop()
	log.Println("[Network Scheduler] Network monitoring background probe scheduler started.")
}

func (s *Scheduler) Stop() {
	close(s.stopChan)
	s.wg.Wait()
	log.Println("[Network Scheduler] Network monitoring background probe scheduler stopped.")
}

func (s *Scheduler) runLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Initial immediate execution
	s.executeAll()

	for {
		select {
		case <-ticker.C:
			s.executeAll()
		case <-s.stopChan:
			return
		}
	}
}

func (s *Scheduler) executeAll() {
	checks, err := s.service.repo.GetEnabledChecks()
	if err != nil || len(checks) == 0 {
		return
	}

	now := time.Now()
	for i := range checks {
		check := &checks[i]
		if check.LastCheckAt != nil {
			interval := time.Duration(check.IntervalSeconds) * time.Second
			if interval <= 0 {
				interval = 30 * time.Second
			}
			if now.Sub(*check.LastCheckAt) < interval {
				continue
			}
		}

		go s.service.ExecuteAndRecordCheck(check)
	}
}
