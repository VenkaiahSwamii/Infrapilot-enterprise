package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type strikeEntry struct {
	ip          string
	username    string
	strikes     int
	lockedUntil time.Time
	lastFailed  time.Time
}

// BruteForceProtector manages failed login strikes, lockouts, and memory pruning
type BruteForceProtector struct {
	mu                  sync.RWMutex
	records             map[string]*strikeEntry // key: "ip:username" and "ip:*"
	maxStrikes          int                     // default: 5
	cooloffDuration     time.Duration           // default: 5 minutes
	longLockoutDuration time.Duration           // default: 30 minutes
	stopChan            chan struct{}
}

var globalProtector *BruteForceProtector
var onceProtector sync.Once

// GetGlobalBruteForceProtector returns the singleton instance
func GetGlobalBruteForceProtector() *BruteForceProtector {
	onceProtector.Do(func() {
		globalProtector = NewBruteForceProtector(5, 5*time.Minute, 30*time.Minute)
	})
	return globalProtector
}

// NewBruteForceProtector instantiates a protector with background pruning
func NewBruteForceProtector(maxStrikes int, cooloff time.Duration, longLockout time.Duration) *BruteForceProtector {
	p := &BruteForceProtector{
		records:             make(map[string]*strikeEntry),
		maxStrikes:          maxStrikes,
		cooloffDuration:     cooloff,
		longLockoutDuration: longLockout,
		stopChan:            make(chan struct{}),
	}

	go p.startPruningRoutine(2 * time.Minute)
	return p
}

// Stop stops the background pruning goroutine
func (p *BruteForceProtector) Stop() {
	select {
	case <-p.stopChan:
	default:
		close(p.stopChan)
	}
}

func makeKeys(ip, username string) []string {
	keys := []string{fmt.Sprintf("ip:%s", ip)}
	if username != "" {
		keys = append(keys, fmt.Sprintf("user:%s:%s", ip, username))
	}
	return keys
}

// IsLocked checks if an IP or username combination is currently locked out
func (p *BruteForceProtector) IsLocked(ip, username string) (bool, int) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	now := time.Now()
	for _, key := range makeKeys(ip, username) {
		if entry, exists := p.records[key]; exists {
			if now.Before(entry.lockedUntil) {
				remaining := int(entry.lockedUntil.Sub(now).Seconds())
				if remaining <= 0 {
					remaining = 1
				}
				return true, remaining
			}
		}
	}
	return false, 0
}

// RecordFailure increments strike count and applies tiered progressive lockouts
func (p *BruteForceProtector) RecordFailure(ip, username string) (bool, int) {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	var maxRemaining int
	isLocked := false

	for _, key := range makeKeys(ip, username) {
		entry, exists := p.records[key]
		if !exists {
			entry = &strikeEntry{
				ip:         ip,
				username:   username,
				strikes:    0,
				lastFailed: now,
			}
			p.records[key] = entry
		}

		// If previous lock expired, reset base strikes to 1
		if now.After(entry.lockedUntil) && entry.lockedUntil.After(entry.lastFailed) {
			entry.strikes = 1
		} else {
			entry.strikes++
		}
		entry.lastFailed = now

		// Tier 2: 10+ Strikes -> 30 Minute Lockout
		if entry.strikes >= p.maxStrikes*2 {
			entry.lockedUntil = now.Add(p.longLockoutDuration)
			rem := int(p.longLockoutDuration.Seconds())
			if rem > maxRemaining {
				maxRemaining = rem
			}
			isLocked = true
		} else if entry.strikes >= p.maxStrikes {
			// Tier 1: 5 Strikes -> 5 Minute Lockout
			entry.lockedUntil = now.Add(p.cooloffDuration)
			rem := int(p.cooloffDuration.Seconds())
			if rem > maxRemaining {
				maxRemaining = rem
			}
			isLocked = true
		}
	}

	return isLocked, maxRemaining
}

// RecordSuccess clears strike counters upon successful credential authentication
func (p *BruteForceProtector) RecordSuccess(ip, username string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, key := range makeKeys(ip, username) {
		delete(p.records, key)
	}
}

// Reset explicitly clears records for an IP/user (e.g. during testing or admin unblock)
func (p *BruteForceProtector) Reset(ip, username string) {
	p.RecordSuccess(ip, username)
}

// startPruningRoutine periodically deletes stale unlocked entries to prevent memory growth
func (p *BruteForceProtector) startPruningRoutine(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopChan:
			return
		case now := <-ticker.C:
			p.mu.Lock()
			for k, entry := range p.records {
				// If not locked and last failure was more than 1 hour ago, prune
				if now.After(entry.lockedUntil) && now.Sub(entry.lastFailed) > 1*time.Hour {
					delete(p.records, k)
				}
			}
			p.mu.Unlock()
		}
	}
}

// AntiBruteForceAuthGuard creates Gin middleware checking if client IP is locked
func AntiBruteForceAuthGuard() gin.HandlerFunc {
	protector := GetGlobalBruteForceProtector()
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = c.Request.RemoteAddr
		}

		if locked, remaining := protector.IsLocked(ip, ""); locked {
			c.Header("Retry-After", fmt.Sprintf("%d", remaining))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":          "account_temporarily_locked",
				"message":        fmt.Sprintf("Too many failed login attempts. IP temporarily locked. Please retry in %d seconds.", remaining),
				"retry_after_sec": remaining,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
