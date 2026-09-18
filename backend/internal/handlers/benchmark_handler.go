package handlers

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	pb "infrapilot/backend/internal/proto/telemetry"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type BenchmarkRunRequest struct {
	Concurrency int    `json:"concurrency"`
	DurationSec int    `json:"duration_sec"`
	Rate        int    `json:"rate"`
	APIKey      string `json:"api_key"`
}

type BenchmarkRunResponse struct {
	TotalRequests   uint64  `json:"total_requests"`
	SuccessRequests uint64  `json:"success_requests"`
	FailedRequests  uint64  `json:"failed_requests"`
	IngestionRPS    float64 `json:"ingestion_rps"`
	MinLatencyMs    float64 `json:"min_latency_ms"`
	AvgLatencyMs    float64 `json:"avg_latency_ms"`
	P50LatencyMs    float64 `json:"p50_latency_ms"`
	P90LatencyMs    float64 `json:"p90_latency_ms"`
	P99LatencyMs    float64 `json:"p99_latency_ms"`
	MaxLatencyMs    float64 `json:"max_latency_ms"`
}

// RunBenchmarkHandler handles POST /api/v1/admin/benchmark/run
func RunBenchmarkHandler(c *gin.Context) {
	var req BenchmarkRunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req = BenchmarkRunRequest{Concurrency: 5, DurationSec: 3, Rate: 10, APIKey: "test-ingestion-api-key-999"}
	}

	if req.Concurrency <= 0 {
		req.Concurrency = 5
	}
	if req.DurationSec <= 0 || req.DurationSec > 30 {
		req.DurationSec = 3
	}
	if req.Rate <= 0 {
		req.Rate = 10
	}
	if req.APIKey == "" {
		req.APIKey = "test-ingestion-api-key-999"
	}

	serverAddr := "localhost:50051"
	duration := time.Duration(req.DurationSec) * time.Second

	var totalReqs, successReqs, failedReqs uint64
	var latencies []time.Duration
	var mu sync.Mutex

	ctx, cancel := context.WithTimeout(context.Background(), duration)
	defer cancel()

	start := time.Now()
	var wg sync.WaitGroup

	for i := 0; i < req.Concurrency; i++ {
		wg.Add(1)
		workerID := i + 1
		go func(wID int) {
			defer wg.Done()
			conn, err := grpc.DialContext(ctx, serverAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				atomic.AddUint64(&failedReqs, 1)
				return
			}
			defer conn.Close()

			client := pb.NewTelemetryIngesterClient(conn)
			machineID := uuid.New().String()
			hostname := fmt.Sprintf("dash-bench-node-%03d", wID)

			interval := time.Second / time.Duration(req.Rate)
			ticker := time.NewTicker(interval)
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					reqPayload := &pb.TelemetryRequest{
						MachineID:     machineID,
						APIKey:        req.APIKey,
						CPUUsage:      25.0 + rand.Float64()*50.0,
						MemoryUsage:   40.0 + rand.Float64()*40.0,
						DiskUsage:     30.0,
						MemoryPercent: 55.0,
						DiskPercent:   30.0,
						LatencyMs:     2.5,
						Hostname:      hostname,
						OS:            "linux",
						Timestamp:     time.Now().Unix(),
					}

					reqStart := time.Now()
					md := metadata.Pairs("x-api-key", req.APIKey, "authorization", "Bearer "+req.APIKey)
					authCtx, reqCancel := context.WithTimeout(metadata.NewOutgoingContext(ctx, md), 2*time.Second)

					stream, err := client.StreamMetrics(authCtx)
					if err != nil {
						atomic.AddUint64(&failedReqs, 1)
						atomic.AddUint64(&totalReqs, 1)
						reqCancel()
						continue
					}

					err = stream.Send(reqPayload)
					if err == nil {
						_, err = stream.CloseAndRecv()
					}
					lat := time.Since(reqStart)
					reqCancel()

					atomic.AddUint64(&totalReqs, 1)
					if err != nil {
						atomic.AddUint64(&failedReqs, 1)
					} else {
						atomic.AddUint64(&successReqs, 1)
						mu.Lock()
						latencies = append(latencies, lat)
						mu.Unlock()
					}
				}
			}
		}(workerID)
	}

	wg.Wait()
	elapsed := time.Since(start)

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	var minMs, maxMs, avgMs, p50Ms, p90Ms, p99Ms float64
	if len(latencies) > 0 {
		minMs = float64(latencies[0].Microseconds()) / 1000.0
		maxMs = float64(latencies[len(latencies)-1].Microseconds()) / 1000.0
		var sumMicro int64
		for _, l := range latencies {
			sumMicro += l.Microseconds()
		}
		avgMs = (float64(sumMicro) / float64(len(latencies))) / 1000.0

		p50Ms = float64(latencies[int(float64(len(latencies))*0.50)].Microseconds()) / 1000.0
		p90Ms = float64(latencies[int(float64(len(latencies))*0.90)].Microseconds()) / 1000.0
		p99Ms = float64(latencies[int(float64(len(latencies))*0.99)].Microseconds()) / 1000.0
	}

	rps := float64(totalReqs) / elapsed.Seconds()

	c.JSON(http.StatusOK, BenchmarkRunResponse{
		TotalRequests:   totalReqs,
		SuccessRequests: successReqs,
		FailedRequests:  failedReqs,
		IngestionRPS:    rps,
		MinLatencyMs:    minMs,
		AvgLatencyMs:    avgMs,
		P50LatencyMs:    p50Ms,
		P90LatencyMs:    p90Ms,
		P99LatencyMs:    p99Ms,
		MaxLatencyMs:    maxMs,
	})
}
