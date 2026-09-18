package telemetry

import (
	"context"

	"google.golang.org/grpc"
)

// TelemetryRequest represents telemetry metrics sent via gRPC stream
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

// TelemetryIngesterServer is the server API for TelemetryIngester service.
type TelemetryIngesterServer interface {
	StreamMetrics(TelemetryIngester_StreamMetricsServer) error
	SendHeartbeat(context.Context, *HeartbeatRequest) (*HeartbeatResponse, error)
}

// TelemetryIngester_StreamMetricsServer interface for streaming metrics
type TelemetryIngester_StreamMetricsServer interface {
	Recv() (*TelemetryRequest, error)
	SendAndClose(*TelemetryResponse) error
	grpc.ServerStream
}

// TelemetryIngesterClient is the client API for TelemetryIngester service.
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

func RegisterTelemetryIngesterServer(s *grpc.Server, srv TelemetryIngesterServer) {
	s.RegisterService(&TelemetryIngester_ServiceDesc, srv)
}

var TelemetryIngester_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "telemetry.TelemetryIngester",
	HandlerType: (*TelemetryIngesterServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "SendHeartbeat",
			Handler:    _TelemetryIngester_SendHeartbeat_Handler,
		},
	},
	Streams: []grpc.StreamDesc{
		{
			StreamName:    "StreamMetrics",
			Handler:       _TelemetryIngester_StreamMetrics_Handler,
			ClientStreams: true,
		},
	},
	Metadata: "proto/telemetry.proto",
}

func _TelemetryIngester_SendHeartbeat_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(HeartbeatRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TelemetryIngesterServer).SendHeartbeat(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/telemetry.TelemetryIngester/SendHeartbeat",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TelemetryIngesterServer).SendHeartbeat(ctx, req.(*HeartbeatRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _TelemetryIngester_StreamMetrics_Handler(srv interface{}, stream grpc.ServerStream) error {
	return srv.(TelemetryIngesterServer).StreamMetrics(&telemetryIngesterStreamMetricsServer{stream})
}

type telemetryIngesterStreamMetricsServer struct {
	grpc.ServerStream
}

func (x *telemetryIngesterStreamMetricsServer) Recv() (*TelemetryRequest, error) {
	m := new(TelemetryRequest)
	if err := x.ServerStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (x *telemetryIngesterStreamMetricsServer) SendAndClose(m *TelemetryResponse) error {
	return x.ServerStream.SendMsg(m)
}
