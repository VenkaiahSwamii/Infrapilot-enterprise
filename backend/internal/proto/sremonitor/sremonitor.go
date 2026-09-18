package sremonitor

import (
	"context"

	"google.golang.org/grpc"
)

type SREBatchPayload struct {
	RawBatch    []byte `json:"raw_batch"`
	Signature   string `json:"signature"`
	MachineID   string `json:"machine_id"`
	TimestampMs int64  `json:"timestamp_ms"`
}

type SRETelemetryPayload struct {
	TimestampMs int64             `json:"timestamp_ms"`
	MachineID   string            `json:"machine_id"`
	Hostname    string            `json:"hostname"`
	APIKey      string            `json:"api_key"`
	Metric      *SystemMetric     `json:"metric,omitempty"`
	Event       *RemediationEvent `json:"event,omitempty"`
	Log         *LogEntry         `json:"log,omitempty"`
}

type SystemMetric struct {
	CPUPercent        float64                  `json:"cpu_percent"`
	MemoryUsedMB      int64                    `json:"memory_used_mb"`
	MemoryTotalMB     int64                    `json:"memory_total_mb"`
	AgentCPUPercent   float64                  `json:"agent_cpu_percent"`
	AgentMemoryMB     int64                    `json:"agent_memory_mb"`
	DiskUsagePercent  map[string]float64       `json:"disk_usage_percent"`
	Processes         []*ProcessMetric         `json:"processes"`
	ServiceStatus     map[string]int32         `json:"service_status"`
	DiskIOStats       map[string]*DiskIOMetric `json:"disk_io_stats"`
}

type DiskIOMetric struct {
	ReadBytesPerSec  float64 `json:"read_bytes_per_sec"`
	WriteBytesPerSec float64 `json:"write_bytes_per_sec"`
	ReadIOPS         float64 `json:"read_iops"`
	WriteIOPS        float64 `json:"write_iops"`
}

type ProcessMetric struct {
	PID         int32   `json:"pid"`
	ServiceName string  `json:"service_name"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryMB    int64   `json:"memory_mb"`
}

type RemediationEvent struct {
	EventType       string  `json:"event_type"`
	Target          string  `json:"target"`
	ActionTaken     string  `json:"action_taken"`
	Success         bool    `json:"success"`
	ErrorMessage    string  `json:"error_message"`
	Phase           string  `json:"phase"`
	AgentCPUPercent float64 `json:"agent_cpu_percent"`
	AgentMemoryMB   int64   `json:"agent_memory_mb"`
}

type LogEntry struct {
	ServiceName string `json:"service_name"`
	Level       string `json:"level"`
	Message     string `json:"message"`
}

type ServerCommandControl struct {
	CommandID string `json:"command_id"`
	Action    string `json:"action"`
	Target    string `json:"target"`
	Payload   string `json:"payload"`
	IssuedAt  int64  `json:"issued_at"`
}

type SREHistoryRequest struct {
	MachineID string `json:"machine_id"`
	SinceMs   int64  `json:"since_ms"`
	UntilMs   int64  `json:"until_ms"`
}

type SREHistoryResponse struct {
	Events  []*RemediationEvent `json:"events"`
	Metrics []*SystemMetric     `json:"metrics"`
}

// SREMonitorIngesterServer API interface
type SREMonitorIngesterServer interface {
	BiStreamTelemetry(SREMonitorIngester_BiStreamTelemetryServer) error
	GetTelemetryHistory(context.Context, *SREHistoryRequest) (*SREHistoryResponse, error)
}

type SREMonitorIngester_BiStreamTelemetryServer interface {
	Recv() (*SREBatchPayload, error)
	Send(*ServerCommandControl) error
	grpc.ServerStream
}

// SREMonitorIngesterClient API interface
type SREMonitorIngesterClient interface {
	BiStreamTelemetry(ctx context.Context, opts ...grpc.CallOption) (SREMonitorIngester_BiStreamTelemetryClient, error)
	GetTelemetryHistory(ctx context.Context, in *SREHistoryRequest, opts ...grpc.CallOption) (*SREHistoryResponse, error)
}

type SREMonitorIngester_BiStreamTelemetryClient interface {
	Send(*SREBatchPayload) error
	Recv() (*ServerCommandControl, error)
	grpc.ClientStream
}

type sreMonitorIngesterClient struct {
	cc grpc.ClientConnInterface
}

func NewSREMonitorIngesterClient(cc grpc.ClientConnInterface) SREMonitorIngesterClient {
	return &sreMonitorIngesterClient{cc}
}

func (c *sreMonitorIngesterClient) BiStreamTelemetry(ctx context.Context, opts ...grpc.CallOption) (SREMonitorIngester_BiStreamTelemetryClient, error) {
	stream, err := c.cc.NewStream(ctx, &grpc.StreamDesc{
		StreamName:    "BiStreamTelemetry",
		ServerStreams: true,
		ClientStreams: true,
	}, "/sremonitor.SREMonitorIngester/BiStreamTelemetry", opts...)
	if err != nil {
		return nil, err
	}
	x := &sreMonitorIngesterBiStreamTelemetryClient{stream}
	return x, nil
}

type sreMonitorIngesterBiStreamTelemetryClient struct {
	grpc.ClientStream
}

func (x *sreMonitorIngesterBiStreamTelemetryClient) Send(m *SREBatchPayload) error {
	return x.ClientStream.SendMsg(m)
}

func (x *sreMonitorIngesterBiStreamTelemetryClient) Recv() (*ServerCommandControl, error) {
	m := new(ServerCommandControl)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (c *sreMonitorIngesterClient) GetTelemetryHistory(ctx context.Context, in *SREHistoryRequest, opts ...grpc.CallOption) (*SREHistoryResponse, error) {
	out := new(SREHistoryResponse)
	err := c.cc.Invoke(ctx, "/sremonitor.SREMonitorIngester/GetTelemetryHistory", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func RegisterSREMonitorIngesterServer(s *grpc.Server, srv SREMonitorIngesterServer) {
	s.RegisterService(&SREMonitorIngester_ServiceDesc, srv)
}

var SREMonitorIngester_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "sremonitor.SREMonitorIngester",
	HandlerType: (*SREMonitorIngesterServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "GetTelemetryHistory",
			Handler:    _SREMonitorIngester_GetTelemetryHistory_Handler,
		},
	},
	Streams: []grpc.StreamDesc{
		{
			StreamName:    "BiStreamTelemetry",
			Handler:       _SREMonitorIngester_BiStreamTelemetry_Handler,
			ServerStreams: true,
			ClientStreams: true,
		},
	},
	Metadata: "proto/sremonitor.proto",
}

func _SREMonitorIngester_GetTelemetryHistory_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(SREHistoryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(SREMonitorIngesterServer).GetTelemetryHistory(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/sremonitor.SREMonitorIngester/GetTelemetryHistory",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(SREMonitorIngesterServer).GetTelemetryHistory(ctx, req.(*SREHistoryRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _SREMonitorIngester_BiStreamTelemetry_Handler(srv interface{}, stream grpc.ServerStream) error {
	return srv.(SREMonitorIngesterServer).BiStreamTelemetry(&sreMonitorIngesterBiStreamTelemetryServer{stream})
}

type sreMonitorIngesterBiStreamTelemetryServer struct {
	grpc.ServerStream
}

func (x *sreMonitorIngesterBiStreamTelemetryServer) Recv() (*SREBatchPayload, error) {
	m := new(SREBatchPayload)
	if err := x.ServerStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (x *sreMonitorIngesterBiStreamTelemetryServer) Send(m *ServerCommandControl) error {
	return x.ServerStream.SendMsg(m)
}
