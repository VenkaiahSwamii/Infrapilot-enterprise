package telemetry

import (
	"context"

	"google.golang.org/grpc"
)

type TelemetryRequest struct {
	MachineID      string  `json:"machine_id"`
	APIKey         string  `json:"api_key"`
	CPUUsage       float64 `json:"cpu_usage"`
	MemoryUsage    float64 `json:"memory_usage"`
	DiskUsage      float64 `json:"disk_usage"`
	MemoryPercent  float64 `json:"memory_percent"`
	DiskPercent    float64 `json:"disk_percent"`
	LatencyMs      float64 `json:"latency_ms"`
	UploadMbps     float64 `json:"upload_mbps"`
	DownloadMbps   float64 `json:"download_mbps"`
	Uptime         uint64  `json:"uptime"`
	Hostname       string  `json:"hostname"`
	IPAddress      string  `json:"ip_address"`
	OS             string  `json:"os"`
	CPUTemperature float64 `json:"cpu_temperature"`
	CPUCores       int32   `json:"cpu_cores"`
	CPUModel       string  `json:"cpu_model"`
	TotalMemory    uint64  `json:"total_memory"`
	FreeMemory     uint64  `json:"free_memory"`
	MemoryTotal    uint64  `json:"memory_total"`
	MemoryUsed     uint64  `json:"memory_used"`
	DiskTotal      uint64  `json:"disk_total"`
	DiskUsed       uint64  `json:"disk_used"`
	Timestamp      int64   `json:"timestamp"`
}

type TelemetryResponse struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	ProcessedAt int64  `json:"processed_at"`
}

type HeartbeatRequest struct {
	MachineID string `json:"machine_id"`
	APIKey    string `json:"api_key"`
	Hostname  string `json:"hostname"`
	Status    string `json:"status"`
	Timestamp int64  `json:"timestamp"`
}

type HeartbeatResponse struct {
	Acknowledged bool  `json:"acknowledged"`
	ServerTime   int64 `json:"server_time"`
}

type TelemetryIngesterClient interface {
	StreamMetrics(ctx context.Context, opts ...grpc.CallOption) (TelemetryIngester_StreamMetricsClient, error)
	SendHeartbeat(ctx context.Context, in *HeartbeatRequest, opts ...grpc.CallOption) (*HeartbeatResponse, error)
}

type TelemetryIngester_StreamMetricsClient interface {
	Send(*TelemetryRequest) error
	CloseAndRecv() (*TelemetryResponse, error)
	grpc.ClientStream
}

type telemetryIngesterClient struct {
	cc grpc.ClientConnInterface
}

func NewTelemetryIngesterClient(cc grpc.ClientConnInterface) TelemetryIngesterClient {
	return &telemetryIngesterClient{cc}
}

func (c *telemetryIngesterClient) StreamMetrics(ctx context.Context, opts ...grpc.CallOption) (TelemetryIngester_StreamMetricsClient, error) {
	stream, err := c.cc.NewStream(ctx, &grpc.StreamDesc{
		StreamName:    "StreamMetrics",
		ClientStreams: true,
	}, "/telemetry.TelemetryIngester/StreamMetrics", opts...)
	if err != nil {
		return nil, err
	}
	x := &telemetryIngesterStreamMetricsClient{stream}
	return x, nil
}

type telemetryIngesterStreamMetricsClient struct {
	grpc.ClientStream
}

func (x *telemetryIngesterStreamMetricsClient) Send(m *TelemetryRequest) error {
	return x.ClientStream.SendMsg(m)
}

func (x *telemetryIngesterStreamMetricsClient) CloseAndRecv() (*TelemetryResponse, error) {
	if err := x.ClientStream.CloseSend(); err != nil {
		return nil, err
	}
	m := new(TelemetryResponse)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (c *telemetryIngesterClient) SendHeartbeat(ctx context.Context, in *HeartbeatRequest, opts ...grpc.CallOption) (*HeartbeatResponse, error) {
	out := new(HeartbeatResponse)
	err := c.cc.Invoke(ctx, "/telemetry.TelemetryIngester/SendHeartbeat", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}
