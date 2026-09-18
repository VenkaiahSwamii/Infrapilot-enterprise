package client

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	pb "infrapilot/agent/internal/proto/telemetry"
	"infrapilot/agent/internal/security"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type GRPCClient struct {
	conn      *grpc.ClientConn
	apiKey    string
	machineID string
	mu        sync.Mutex
	client    pb.TelemetryIngesterClient
}

func NewGRPCClient(serverAddr, apiKey, machineID, certPath, keyPath, caPath string, enablemTLS bool) (*GRPCClient, error) {
	var dialOpts []grpc.DialOption

	if enablemTLS || certPath != "" {
		tlsConfig, err := security.LoadClientTLSConfig(certPath, keyPath, caPath, true)
		if err != nil {
			log.Printf("[gRPC Client] mTLS config fallback: %v", err)
			dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
		} else {
			dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
			log.Println("[gRPC Client] Enterprise mTLS transport security enabled")
		}
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.Dial(serverAddr, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to dial gRPC server (%s): %w", serverAddr, err)
	}

	c := pb.NewTelemetryIngesterClient(conn)

	return &GRPCClient{
		conn:      conn,
		apiKey:    apiKey,
		machineID: machineID,
		client:    c,
	}, nil
}

func (g *GRPCClient) Close() {
	if g.conn != nil {
		_ = g.conn.Close()
	}
}

func (g *GRPCClient) getAuthContext(parentCtx context.Context) context.Context {
	md := metadata.Pairs(
		"x-api-key", g.apiKey,
		"x-machine-id", g.machineID,
		"authorization", "Bearer "+g.apiKey,
	)
	return metadata.NewOutgoingContext(parentCtx, md)
}

func (g *GRPCClient) StreamMetric(req *pb.TelemetryRequest) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	authCtx := g.getAuthContext(ctx)

	stream, err := g.client.StreamMetrics(authCtx)
	if err != nil {
		return fmt.Errorf("failed to initiate gRPC metric stream: %w", err)
	}

	if err := stream.Send(req); err != nil {
		return fmt.Errorf("failed to send metric payload over gRPC: %w", err)
	}

	_, err = stream.CloseAndRecv()
	return err
}

func (g *GRPCClient) SendHeartbeat(status string) (*pb.HeartbeatResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	authCtx := g.getAuthContext(ctx)

	req := &pb.HeartbeatRequest{
		MachineID: g.machineID,
		APIKey:    g.apiKey,
		Status:    status,
		Timestamp: time.Now().Unix(),
	}

	return g.client.SendHeartbeat(authCtx, req)
}
