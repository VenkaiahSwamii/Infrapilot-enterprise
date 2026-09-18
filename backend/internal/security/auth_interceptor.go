package security

import (
	"context"
	"strings"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// UnaryAuthInterceptor validates API key metadata on single gRPC RPC calls
func UnaryAuthInterceptor() grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		if err := validateGRPCMetadataAuth(ctx); err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// StreamAuthInterceptor validates API key metadata on streaming gRPC RPC calls
func StreamAuthInterceptor() grpc.StreamServerInterceptor {
	return func(
		srv interface{},
		ss grpc.ServerStream,
		info *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		if err := validateGRPCMetadataAuth(ss.Context()); err != nil {
			return err
		}
		return handler(srv, ss)
	}
}

func validateGRPCMetadataAuth(ctx context.Context) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Errorf(codes.Unauthenticated, "missing gRPC metadata context")
	}

	var apiKey string

	// Check metadata header keys: x-api-key, authorization, or api-key
	if keys := md.Get("x-api-key"); len(keys) > 0 {
		apiKey = keys[0]
	} else if keys := md.Get("authorization"); len(keys) > 0 {
		apiKey = strings.TrimPrefix(keys[0], "Bearer ")
	} else if keys := md.Get("api-key"); len(keys) > 0 {
		apiKey = keys[0]
	}

	if apiKey == "" {
		return status.Errorf(codes.Unauthenticated, "missing required API key in gRPC metadata")
	}

	// Validate API Key in Database if GORM is initialized
	if database.DB != nil {
		var machine models.Machine
		err := database.DB.Where("api_key = ?", apiKey).First(&machine).Error
		if err != nil {
			// Check Server table fallback
			var server models.Server
			serverErr := database.DB.Where("api_key = ?", apiKey).First(&server).Error
			if serverErr != nil {
				return status.Errorf(codes.Unauthenticated, "invalid gRPC authentication token or API key")
			}
		}
	}

	return nil
}
