package collector

import (
	"net"
	"sort"
	"strings"
	"sync"
	"time"

	gnet "github.com/shirou/gopsutil/v4/net"
	"infrapilot/agent/internal/config"
)

var previousSent uint64
var previousRecv uint64
var previousTime time.Time

var (
	latencyMu      sync.RWMutex
	latencyHistory = make([]float64, 0, 30)
	lastLatencyMs  = 18.5
	lastPacketLoss = 0.0
)

func GetNetworkSpeed() (float64, float64, error) {

	stats, err := gnet.IOCounters(false)
	if err != nil {
		return 0, 0, err
	}

	now := time.Now()

	if previousTime.IsZero() {
		previousSent = stats[0].BytesSent
		previousRecv = stats[0].BytesRecv
		previousTime = now
		return 0, 0, nil
	}

	elapsed := now.Sub(previousTime).Seconds()
	if elapsed <= 0 {
		return 0, 0, nil
	}

	upload := float64(stats[0].BytesSent-previousSent) * 8 / elapsed / 1000000
	download := float64(stats[0].BytesRecv-previousRecv) * 8 / elapsed / 1000000

	previousSent = stats[0].BytesSent
	previousRecv = stats[0].BytesRecv
	previousTime = now

	return upload, download, nil
}

// ProbeNetworkLatency measures round-trip time and packet loss to target gateway or DNS
func ProbeNetworkLatency() (float64, float64) {
	target := "8.8.8.8"
	if config.AppConfig != nil && config.AppConfig.Latency.TargetGateway != "" {
		target = strings.TrimSpace(config.AppConfig.Latency.TargetGateway)
	}
	if target == "" {
		target = "8.8.8.8"
	}

	target = strings.TrimPrefix(target, "http://")
	target = strings.TrimPrefix(target, "https://")
	if slashIdx := strings.Index(target, "/"); slashIdx != -1 {
		target = target[:slashIdx]
	}

	host := target
	port := "53"
	if strings.Contains(target, ":") {
		h, p, err := net.SplitHostPort(target)
		if err == nil {
			host = h
			port = p
		}
	}

	address := net.JoinHostPort(host, port)
	const sampleCount = 3
	var successfulRtts []float64
	var failedCount int

	for i := 0; i < sampleCount; i++ {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", address, 1500*time.Millisecond)
		rtt := float64(time.Since(start).Microseconds()) / 1000.0

		if err == nil {
			_ = conn.Close()
			successfulRtts = append(successfulRtts, rtt)
		} else {
			if strings.Contains(err.Error(), "refused") || strings.Contains(err.Error(), "reset") {
				successfulRtts = append(successfulRtts, rtt)
			} else {
				failedCount++
			}
		}
		if i < sampleCount-1 {
			time.Sleep(25 * time.Millisecond)
		}
	}

	lossPct := (float64(failedCount) / float64(sampleCount)) * 100.0
	measuredLatency := 0.0

	if len(successfulRtts) > 0 {
		sort.Float64s(successfulRtts)
		measuredLatency = successfulRtts[len(successfulRtts)/2]
	} else {
		lossPct = 100.0
		measuredLatency = 0.0
	}

	latencyMu.Lock()
	defer latencyMu.Unlock()

	if len(successfulRtts) > 0 {
		lastLatencyMs = measuredLatency
		latencyHistory = append(latencyHistory, measuredLatency)
		if len(latencyHistory) > 30 {
			latencyHistory = latencyHistory[len(latencyHistory)-30:]
		}
	}
	lastPacketLoss = lossPct

	return lastLatencyMs, lastPacketLoss
}

// GetRollingP95Latency returns the calculated 95th percentile latency from historical samples
func GetRollingP95Latency() float64 {
	latencyMu.RLock()
	defer latencyMu.RUnlock()

	if len(latencyHistory) == 0 {
		if lastLatencyMs > 0 {
			return lastLatencyMs
		}
		return 22.5
	}

	sorted := make([]float64, len(latencyHistory))
	copy(sorted, latencyHistory)
	sort.Float64s(sorted)

	idx := int(float64(len(sorted)) * 0.95)
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

// GetLatestLatencyAndLoss returns the most recent sample values
func GetLatestLatencyAndLoss() (float64, float64) {
	latencyMu.RLock()
	defer latencyMu.RUnlock()
	return lastLatencyMs, lastPacketLoss
}
