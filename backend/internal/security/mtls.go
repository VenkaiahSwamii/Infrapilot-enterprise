package security

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// LoadServerTLSConfig builds an enterprise mTLS tls.Config for backend gRPC and HTTPS servers
func LoadServerTLSConfig(certPath, keyPath, caPath string, requireClientCert bool) (*tls.Config, error) {
	// If cert files do not exist, attempt to auto-generate self-signed certs for zero-config mTLS
	if certPath == "" || keyPath == "" || !fileExists(certPath) || !fileExists(keyPath) {
		certDir := "certs"
		genCertPath, genKeyPath, genCAPath, err := GenerateSelfSignedCertificates(certDir)
		if err == nil {
			certPath = genCertPath
			keyPath = genKeyPath
			if caPath == "" {
				caPath = genCAPath
			}
		}
	}

	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load server certificate pair (%s, %s): %w", certPath, keyPath, err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
		CipherSuites: []uint16{
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
		},
	}

	if requireClientCert {
		tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
	} else {
		tlsConfig.ClientAuth = tls.VerifyClientCertIfGiven
	}

	if caPath != "" && fileExists(caPath) {
		caPem, err := os.ReadFile(caPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read CA certificate (%s): %w", caPath, err)
		}
		caPool := x509.NewCertPool()
		if !caPool.AppendCertsFromPEM(caPem) {
			return nil, fmt.Errorf("failed to parse CA certificate from PEM (%s)", caPath)
		}
		tlsConfig.ClientCAs = caPool
	}

	return tlsConfig, nil
}

// GenerateSelfSignedCertificates creates CA, Server, and Agent PEM certificates for enterprise mTLS
func GenerateSelfSignedCertificates(outputDir string) (string, string, string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", "", "", err
	}

	caCertPath := filepath.Join(outputDir, "ca.crt")
	serverCertPath := filepath.Join(outputDir, "server.crt")
	serverKeyPath := filepath.Join(outputDir, "server.key")
	agentCertPath := filepath.Join(outputDir, "agent.crt")
	agentKeyPath := filepath.Join(outputDir, "agent.key")

	if fileExists(caCertPath) && fileExists(serverCertPath) && fileExists(serverKeyPath) {
		return serverCertPath, serverKeyPath, caCertPath, nil
	}

	// 1. Generate CA Private Key and Certificate
	caKey, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return "", "", "", err
	}

	caTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"InfraPilot Enterprise CA"},
			CommonName:   "InfraPilot Root CA",
		},
		NotBefore:             time.Now().Add(-10 * time.Minute),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
	}

	caCertBytes, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		return "", "", "", err
	}

	writePEM(caCertPath, "CERTIFICATE", caCertBytes)

	// 2. Generate Server Private Key and Certificate
	serverKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return "", "", "", err
	}

	serverTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject: pkix.Name{
			Organization: []string{"InfraPilot Enterprise"},
			CommonName:   "localhost",
		},
		NotBefore:   time.Now().Add(-10 * time.Minute),
		NotAfter:    time.Now().Add(5 * 365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("0.0.0.0")},
		DNSNames:    []string{"localhost", "infrapilot-backend"},
	}

	serverCertBytes, err := x509.CreateCertificate(rand.Reader, serverTemplate, caTemplate, &serverKey.PublicKey, caKey)
	if err != nil {
		return "", "", "", err
	}

	writePEM(serverCertPath, "CERTIFICATE", serverCertBytes)
	writePEM(serverKeyPath, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(serverKey))

	// 3. Generate Agent Private Key and Certificate
	agentKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return "", "", "", err
	}

	agentTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject: pkix.Name{
			Organization: []string{"InfraPilot Enterprise Agent"},
			CommonName:   "infrapilot-agent",
		},
		NotBefore:   time.Now().Add(-10 * time.Minute),
		NotAfter:    time.Now().Add(5 * 365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	agentCertBytes, err := x509.CreateCertificate(rand.Reader, agentTemplate, caTemplate, &agentKey.PublicKey, caKey)
	if err != nil {
		return "", "", "", err
	}

	writePEM(agentCertPath, "CERTIFICATE", agentCertBytes)
	writePEM(agentKeyPath, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(agentKey))

	return serverCertPath, serverKeyPath, caCertPath, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func writePEM(path, blockType string, rawBytes []byte) {
	buf := new(bytes.Buffer)
	_ = pem.Encode(buf, &pem.Block{Type: blockType, Bytes: rawBytes})
	_ = os.WriteFile(path, buf.Bytes(), 0600)
}
