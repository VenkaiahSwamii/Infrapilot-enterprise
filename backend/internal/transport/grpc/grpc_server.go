package grpc

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"
	pb "infrapilot/backend/internal/proto/telemetry"
	"infrapilot/backend/internal/security"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

type Server struct {
	grpcServer *grpc.Server
	port       int
}

type TelemetryServer struct {
	pb.TelemetryIngesterServer
}

func NewTelemetryServer() *TelemetryServer {
	return &TelemetryServer{}
}

func StartGRPCServer(port int, certPath, keyPath, caPath string, requiremTLS bool) (*Server, error) {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, fmt.Errorf("failed to listen on gRPC port %d: %w", port, err)
	}

	var opts []grpc.ServerOption
	opts = append(opts,
		grpc.UnaryInterceptor(security.UnaryAuthInterceptor()),
		grpc.StreamInterceptor(security.StreamAuthInterceptor()),
	)

	// Configure mTLS if enabled or certs are provided
	tlsConfig, err := security.LoadServerTLSConfig(certPath, keyPath, caPath, requiremTLS)
	if err == nil && tlsConfig != nil {
		opts = append(opts, grpc.Creds(credentials.NewTLS(tlsConfig)))
		log.Printf("[mTLS gRPC] Enterprise mTLS transport security enabled on port %d", port)
	} else {
		log.Printf("[gRPC Server] Starting gRPC server on port %d (Insecure mode fallback: %v)", port, err)
	}

	grpcServer := grpc.NewServer(opts...)
	srv := NewTelemetryServer()
	pb.RegisterTelemetryIngesterServer(grpcServer, srv)

	go func() {
		log.Printf("[gRPC Server] Listening on 0.0.0.0:%d", port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("[gRPC Server] Execution stopped: %v", err)
		}
	}()

	return &Server{
		grpcServer: grpcServer,
		port:       port,
	}, nil
}

func (s *Server) Stop() {
	if s.grpcServer != nil {
		s.grpcServer.GracefulStop()
	}
}

func (t *TelemetryServer) StreamMetrics(stream pb.TelemetryIngester_StreamMetricsServer) error {
	count := 0
	for {
		req, err := stream.Recv()
		if err == io.EOF {
			return stream.SendAndClose(&pb.TelemetryResponse{
				Success:     true,
				Message:     fmt.Sprintf("Successfully processed %d metric payloads", count),
				ProcessedAt: time.Now().Unix(),
			})
		}
		if err != nil {
			return err
		}

		// Process and persist telemetry payload
		if err := processTelemetryPayload(req); err != nil {
			log.Printf("[gRPC Telemetry] Metric processing error: %v", err)
		}
		count++
	}
}

func (t *TelemetryServer) SendHeartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	if req.MachineID != "" && database.DB != nil {
		mID, err := uuid.Parse(req.MachineID)
		if err == nil {
			database.DB.Model(&models.Machine{}).Where("id = ?", mID).Update("status", "Online")
		}
	}

	return &pb.HeartbeatResponse{
		Acknowledged: true,
		ServerTime:   time.Now().Unix(),
	}, nil
}

func processTelemetryPayload(req *pb.TelemetryRequest) error {
	if database.DB == nil {
		return nil
	}

	mID, err := uuid.Parse(req.MachineID)
	if err != nil {
		return fmt.Errorf("invalid machine UUID: %w", err)
	}

	metricRecord := &models.Metric{
		ID:             uuid.New(),
		MachineID:      mID,
		CPUUsage:       req.CPUUsage,
		MemoryUsage:    req.MemoryUsage,
		DiskUsage:      req.DiskUsage,
		MemoryPercent:  req.MemoryPercent,
		DiskPercent:    req.DiskPercent,
		LatencyMs:      req.LatencyMs,
		UploadMbps:     req.UploadMbps,
		DownloadMbps:   req.DownloadMbps,
		Uptime:         req.Uptime,
		CreatedAt:      time.Now(),
		Hostname:       req.Hostname,
		IPAddress:      req.IPAddress,
		OS:             req.OS,
		CPUTemperature: req.CPUTemperature,
		CPUCores:       int(req.CPUCores),
		CPUModel:       req.CPUModel,
		TotalMemory:    req.TotalMemory,
		FreeMemory:     req.FreeMemory,
		MemoryTotal:    req.MemoryTotal,
		MemoryUsed:     req.MemoryUsed,
		DiskTotal:      req.DiskTotal,
		DiskUsed:       req.DiskUsed,
	}

	return database.DB.Create(metricRecord).Error
}
