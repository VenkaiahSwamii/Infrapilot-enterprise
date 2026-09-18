package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	pb "infrapilot/backend/internal/proto/telemetry"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type BenchmarkStats struct {
	TotalRequests   uint64
	SuccessRequests uint64
	FailedRequests  uint64
	Latencies       []time.Duration
	mu              sync.Mutex
}

func main() {
	serverAddr := flag.String("server", "localhost:50051", "gRPC Telemetry server address")
	concurrency := flag.Int("concurrency", 10, "Number of concurrent synthetic agent workers")
	duration := flag.Duration("duration", 10*time.Second, "Benchmark execution duration")
	ratePerWorker := flag.Int("rate", 20, "Metric requests per second per worker")
	apiKey := flag.String("api-key", "test-ingestion-api-key-999", "Agent API Key authentication token")
	enableMTLS := flag.Bool("mtls", false, "Enable mTLS transport security")
	certPath := flag.String("cert", "certs/agent.crt", "Path to agent client certificate")
	keyPath := flag.String("key", "certs/agent.key", "Path to agent client key")
	caPath := flag.String("ca", "certs/ca.crt", "Path to Root CA certificate")
	flag.Parse()

	fmt.Println("===================================================================================================")
	fmt.Println("               INFRAPILOT ENTERPRISE - gRPC TELEMETRY BENCHMARK TOOL")
	fmt.Println("===================================================================================================")
	fmt.Printf("Target Server  : %s\n", *serverAddr)
	fmt.Printf("Concurrency    : %d workers\n", *concurrency)
	fmt.Printf("Duration       : %v\n", *duration)
	fmt.Printf("Target Rate    : %d req/sec/worker (Total ~%d RPS)\n", *ratePerWorker, *concurrency**ratePerWorker)
	mtlsStatus := "Disabled (Insecure)"
	if *enableMTLS {
		mtlsStatus = fmt.Sprintf("Enabled (Cert: %s)", *certPath)
	}
	fmt.Printf("mTLS Security  : %s\n", mtlsStatus)
	fmt.Println("---------------------------------------------------------------------------------------------------")
	fmt.Println("Initializing worker pool and establishing gRPC connections...")

	var dialOpts []grpc.DialOption
	if *enableMTLS {
		tlsCfg, err := loadClientTLS(*certPath, *keyPath, *caPath)
		if err != nil {
			log.Fatalf("Failed to load mTLS certificates: %v", err)
		}
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(tlsCfg)))
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	stats := &BenchmarkStats{
		Latencies: make([]time.Duration, 0, 10000),
	}

	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	start := time.Now()
	var wg sync.WaitGroup

	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		workerID := i + 1
		go runWorker(ctx, &wg, workerID, *serverAddr, *apiKey, *ratePerWorker, dialOpts, stats)
	}

	wg.Wait()
	elapsed := time.Since(start)

	renderBenchmarkReport(stats, elapsed, *concurrency)
}

func runWorker(
	ctx context.Context,
	wg *sync.WaitGroup,
	workerID int,
	serverAddr, apiKey string,
	rate int,
	dialOpts []grpc.DialOption,
	stats *BenchmarkStats,
) {
	defer wg.Done()

	conn, err := grpc.DialContext(ctx, serverAddr, dialOpts...)
	if err != nil {
		atomic.AddUint64(&stats.FailedRequests, 1)
		return
	}
	defer conn.Close()

	client := pb.NewTelemetryIngesterClient(conn)
	machineUUID := uuid.New().String()
	hostname := fmt.Sprintf("bench-agent-node-%03d", workerID)

	interval := time.Second / time.Duration(rate)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			req := generateSyntheticPayload(machineUUID, apiKey, hostname)

			reqStart := time.Now()
			md := metadata.Pairs("x-api-key", apiKey, "authorization", "Bearer "+apiKey)
			authCtx, cancel := context.WithTimeout(metadata.NewOutgoingContext(ctx, md), 5*time.Second)

			stream, err := client.StreamMetrics(authCtx)
			if err != nil {
				atomic.AddUint64(&stats.FailedRequests, 1)
				atomic.AddUint64(&stats.TotalRequests, 1)
				cancel()
				continue
			}

			err = stream.Send(req)
			if err == nil {
				_, err = stream.CloseAndRecv()
			}
			latency := time.Since(reqStart)
			cancel()

			atomic.AddUint64(&stats.TotalRequests, 1)
			if err != nil {
				atomic.AddUint64(&stats.FailedRequests, 1)
			} else {
				atomic.AddUint64(&stats.SuccessRequests, 1)
				stats.mu.Lock()
				stats.Latencies = append(stats.Latencies, latency)
				stats.mu.Unlock()
			}
		}
	}
}

func generateSyntheticPayload(machineID, apiKey, hostname string) *pb.TelemetryRequest {
	return &pb.TelemetryRequest{
		MachineID:      machineID,
		APIKey:         apiKey,
		CPUUsage:       15.0 + rand.Float64()*70.0,
		MemoryUsage:    30.0 + rand.Float64()*50.0,
		DiskUsage:      20.0 + rand.Float64()*40.0,
		MemoryPercent:  45.5,
		DiskPercent:    38.2,
		LatencyMs:      1.5 + rand.Float64()*10.0,
		UploadMbps:     10.5,
		DownloadMbps:   45.2,
		Uptime:         86400,
		Hostname:       hostname,
		IPAddress:      fmt.Sprintf("192.168.1.%d", rand.Intn(200)+1),
		OS:             "linux",
		CPUTemperature: 42.5,
		CPUCores:       8,
		CPUModel:       "Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz",
		TotalMemory:    16384,
		FreeMemory:     8192,
		MemoryTotal:    16384,
		MemoryUsed:     8192,
		DiskTotal:      500000,
		DiskUsed:       190000,
		Timestamp:      time.Now().Unix(),
	}
}

func loadClientTLS(certPath, keyPath, caPath string) (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load client cert pair: %w", err)
	}

	caPem, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read ca cert: %w", err)
	}

	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caPem)

	return &tls.Config{
		Certificates:       []tls.Certificate{cert},
		RootCAs:            caPool,
		InsecureSkipVerify: true,
	}, nil
}

func renderBenchmarkReport(stats *BenchmarkStats, elapsed time.Duration, concurrency int) {
	total := atomic.LoadUint64(&stats.TotalRequests)
	success := atomic.LoadUint64(&stats.SuccessRequests)
	failed := atomic.LoadUint64(&stats.FailedRequests)

	rps := float64(total) / elapsed.Seconds()

	stats.mu.Lock()
	latencies := make([]time.Duration, len(stats.Latencies))
	copy(latencies, stats.Latencies)
	stats.mu.Unlock()

	sort.Slice(latencies, func(i, j int) bool {
		return latencies[i] < latencies[j]
	})

	var p50, p90, p99, minLat, maxLat, avgLat time.Duration
	if len(latencies) > 0 {
		minLat = latencies[0]
		maxLat = latencies[len(latencies)-1]

		var sum time.Duration
		for _, l := range latencies {
			sum += l
		}
		avgLat = sum / time.Duration(len(latencies))

		p50 = latencies[int(float64(len(latencies))*0.50)]
		p90 = latencies[int(float64(len(latencies))*0.90)]
		p99 = latencies[int(float64(len(latencies))*0.99)]
	}

	fmt.Println("\n===================================================================================================")
	fmt.Println("               BENCHMARK RESULTS & PERFORMANCE SUMMARY")
	fmt.Println("===================================================================================================")
	fmt.Printf("Total Duration    : %.2f seconds\n", elapsed.Seconds())
	fmt.Printf("Total Requests    : %d\n", total)
	fmt.Printf("Successful Ingest : %d (%.2f%%)\n", success, float64(success)/float64(total)*100)
	fmt.Printf("Failed Requests   : %d (%.2f%%)\n", failed, float64(failed)/float64(total)*100)
	fmt.Printf("Ingestion Rate    : %.2f Requests/Sec (RPS)\n", rps)
	fmt.Println("---------------------------------------------------------------------------------------------------")
	fmt.Println("LATENCY BREAKDOWN:")
	fmt.Printf("  Min Latency     : %v\n", minLat)
	fmt.Printf("  Avg Latency     : %v\n", avgLat)
	fmt.Printf("  P50 (Median)    : %v\n", p50)
	fmt.Printf("  P90 Percentile  : %v\n", p90)
	fmt.Printf("  P99 Percentile  : %v\n", p99)
	fmt.Printf("  Max Latency     : %v\n", maxLat)
	fmt.Println("===================================================================================================")
}
