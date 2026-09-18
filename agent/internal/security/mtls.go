package security

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// LoadClientTLSConfig builds mTLS credentials for infrapilot-agent connecting to backend gRPC server
func LoadClientTLSConfig(certPath, keyPath, caPath string, insecureSkipVerify bool) (*tls.Config, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: insecureSkipVerify,
		MinVersion:         tls.VersionTLS12,
	}

	// Load Agent Client Certificates if present
	if certPath != "" && keyPath != "" && fileExists(certPath) && fileExists(keyPath) {
		cert, err := tls.LoadX509KeyPair(certPath, keyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load agent client certificate (%s, %s): %w", certPath, keyPath, err)
		}
		tlsConfig.Certificates = []tls.Certificate{cert}
	}

	// Load CA Root Certificate if present
	if caPath != "" && fileExists(caPath) {
		caPem, err := os.ReadFile(caPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read CA certificate (%s): %w", caPath, err)
		}
		caPool := x509.NewCertPool()
		if !caPool.AppendCertsFromPEM(caPem) {
			return nil, fmt.Errorf("failed to parse CA certificate from PEM (%s)", caPath)
		}
		tlsConfig.RootCAs = caPool
	}

	return tlsConfig, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}
