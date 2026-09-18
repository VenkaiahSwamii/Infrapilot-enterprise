package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"infrapilot/backend/internal/backup"
	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
)

// Job represents a scheduled job
type Job interface {
	// Name returns the job name
	Name() string
	// Execute runs the job
	Execute(ctx context.Context) error
	// Schedule returns the cron schedule
	Schedule() string
}

// Scheduler manages scheduled jobs
type Scheduler struct {
	jobs         map[string]Job
	lastExecuted map[string]time.Time
	mu           sync.RWMutex
	running      bool
	stopChan     chan struct{}
}

var (
	SchedulerInstance *Scheduler
	once              sync.Once
)

// GetScheduler returns the singleton scheduler instance
func GetScheduler() *Scheduler {
	once.Do(func() {
		SchedulerInstance = &Scheduler{
			jobs:         make(map[string]Job),
			lastExecuted: make(map[string]time.Time),
			stopChan:     make(chan struct{}),
		}
	})
	return SchedulerInstance
}

// RegisterJob registers a job with the scheduler
func (s *Scheduler) RegisterJob(job Job) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[job.Name()] = job
	fmt.Printf("Registered job: %s (schedule: %s)\n", job.Name(), job.Schedule())
}

// Start starts the scheduler
func (s *Scheduler) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("scheduler is already running")
	}
	s.running = true
	s.mu.Unlock()

	fmt.Printf("Scheduler started with %d jobs\n", len(s.jobs))

	go s.run()

	return nil
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	s.mu.Unlock()

	close(s.stopChan)
	fmt.Println("Scheduler stopped")
}

// run executes jobs based on their schedule
func (s *Scheduler) run() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.executeDueJobs()
		case <-s.stopChan:
			return
		}
	}
}

// executeDueJobs executes all jobs that are due
func (s *Scheduler) executeDueJobs() {
	s.mu.RLock()
	jobs := make([]Job, 0, len(s.jobs))
	for _, job := range s.jobs {
		jobs = append(jobs, job)
	}
	s.mu.RUnlock()

	for _, job := range jobs {
		if s.shouldExecute(job) {
			go s.executeJob(job)
		}
	}
}

// shouldExecute checks if a job should be executed
func (s *Scheduler) shouldExecute(job Job) bool {
	s.mu.RLock()
	last, exists := s.lastExecuted[job.Name()]
	s.mu.RUnlock()

	if !exists {
		return true
	}

	return time.Since(last) >= 23*time.Hour
}

// executeJob executes a job and logs the result
func (s *Scheduler) executeJob(job Job) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	fmt.Printf("Executing job: %s\n", job.Name())

	s.mu.Lock()
	s.lastExecuted[job.Name()] = time.Now()
	s.mu.Unlock()

	start := time.Now()
	err := job.Execute(ctx)
	duration := time.Since(start)

	if err != nil {
		fmt.Printf("Job %s failed: %v (duration: %v)\n", job.Name(), err, duration)
	} else {
		fmt.Printf("Job %s completed successfully (duration: %v)\n", job.Name(), duration)
	}
}

// CleanupOldMetricsJob removes raw metrics older than 7 days (SREMonitor retention policy)
type CleanupOldMetricsJob struct{}

func (j *CleanupOldMetricsJob) Name() string {
	return "cleanup_old_metrics"
}

func (j *CleanupOldMetricsJob) Schedule() string {
	return "0 2 * * *" // Daily at 2 AM
}

func (j *CleanupOldMetricsJob) Execute(ctx context.Context) error {
	// SREMonitor policy: Keep only last 7 days of raw metrics
	retentionDate := time.Now().AddDate(0, 0, -7)

	if database.DB != nil {
		result := database.DB.Where("created_at < ?", retentionDate).Delete(&models.Metric{})
		if result.Error != nil {
			return fmt.Errorf("failed to delete old metrics: %w", result.Error)
		}
		fmt.Printf("Deleted %d old raw metrics (older than 7 days)\n", result.RowsAffected)
	}

	return nil
}

// CleanupOldLogsJob removes logs older than retention period (14 days)
type CleanupOldLogsJob struct{}

func (j *CleanupOldLogsJob) Name() string {
	return "cleanup_old_logs"
}

func (j *CleanupOldLogsJob) Schedule() string {
	return "0 3 * * *" // Daily at 3 AM
}

func (j *CleanupOldLogsJob) Execute(ctx context.Context) error {
	retentionDate := time.Now().AddDate(0, 0, -14)

	if database.DB != nil {
		result := database.DB.Where("timestamp < ?", retentionDate).Delete(&models.LinuxLog{})
		if result.Error != nil {
			return fmt.Errorf("failed to delete old logs: %w", result.Error)
		}
		fmt.Printf("Deleted %d old logs\n", result.RowsAffected)
	}

	return nil
}

// CleanupAuditLogsJob retains audit logs in DB for 365 days, archiving older entries to cold storage JSONL files
type CleanupAuditLogsJob struct{}

func (j *CleanupAuditLogsJob) Name() string {
	return "cleanup_audit_logs"
}

func (j *CleanupAuditLogsJob) Schedule() string {
	return "0 4 * * *" // Daily at 4 AM
}

func (j *CleanupAuditLogsJob) Execute(ctx context.Context) error {
	// SREMonitor policy: Keep 365 days of audit events, archive older into JSONL cold storage
	retentionDate := time.Now().AddDate(0, 0, -365)

	if database.DB == nil {
		return nil
	}

	var oldAudits []models.AuditLog
	if err := database.DB.Where("created_at < ?", retentionDate).Find(&oldAudits).Error; err != nil {
		return fmt.Errorf("failed to query old audit logs for cold archiving: %w", err)
	}

	if len(oldAudits) > 0 {
		archiveDir := filepath.Join("storage", "archive")
		_ = os.MkdirAll(archiveDir, 0755)

		archivePath := filepath.Join(archiveDir, fmt.Sprintf("audit_%s.jsonl", time.Now().Format("2006_01")))
		file, err := os.OpenFile(archivePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err == nil {
			for _, audit := range oldAudits {
				line, _ := json.Marshal(audit)
				_, _ = file.Write(append(line, '\n'))
			}
			_ = file.Close()
			fmt.Printf("Archived %d audit events to cold storage: %s\n", len(oldAudits), archivePath)
		}

		result := database.DB.Where("created_at < ?", retentionDate).Delete(&models.AuditLog{})
		if result.Error != nil {
			return fmt.Errorf("failed to delete archived audit logs: %w", result.Error)
		}
		fmt.Printf("Deleted %d audit logs older than 365 days from database\n", result.RowsAffected)
	}

	return nil
}

// InitScheduler initializes the scheduler with default jobs
func InitScheduler() {
	scheduler := GetScheduler()

	// Register cleanup jobs
	scheduler.RegisterJob(&CleanupOldMetricsJob{})
	scheduler.RegisterJob(&CleanupOldLogsJob{})
	scheduler.RegisterJob(&CleanupAuditLogsJob{})
	scheduler.RegisterJob(&backup.BackupJob{})

	// Start scheduler
	if err := scheduler.Start(); err != nil {
		fmt.Printf("Failed to start scheduler: %v\n", err)
	}
}

