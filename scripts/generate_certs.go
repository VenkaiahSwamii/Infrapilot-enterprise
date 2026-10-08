//go:build ignore

package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"time"
)

func main() {
	os.MkdirAll("certs", 0755)

	// Generate CA
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}

	caTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization:       []string{"InfraPilot Enterprise"},
			Country:            []string{"US"},
			Province:           []string{"State"},
			Locality:           []string{"City"},
			OrganizationalUnit: []string{"CA"},
			CommonName:         "InfraPilot Enterprise CA",
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().AddDate(10, 0, 0),
		KeyUsage:    x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
		IsCA:        true,
	}

	caCert, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		panic(err)
	}

	// Save CA
	writeFile("certs/ca.key", encodePrivateKey(caKey))
	writeFile("certs/ca.crt", encodeCert(caCert))

	// Generate Server cert
	serverKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}

	dnsNames := []string{"localhost", "infrapilot-api", "infrapilot-backend"}
	ipAddresses := []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("0.0.0.0")}

	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			if addrs, err := iface.Addrs(); err == nil {
				for _, addr := range addrs {
					if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
						if ip4 := ipnet.IP.To4(); ip4 != nil {
							ipAddresses = append(ipAddresses, ip4)
						}
					}
				}
			}
		}
	}

	serverTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject: pkix.Name{
			Organization:       []string{"InfraPilot Enterprise"},
			Country:            []string{"US"},
			Province:           []string{"State"},
			Locality:           []string{"City"},
			OrganizationalUnit: []string{"Server"},
			CommonName:         "InfraPilot API Server",
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().AddDate(1, 0, 0),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:    dnsNames,
		IPAddresses: ipAddresses,
	}

	serverCert, err := x509.CreateCertificate(rand.Reader, serverTemplate, caTemplate, &serverKey.PublicKey, caKey)
	if err != nil {
		panic(err)
	}

	writeFile("certs/server.key", encodePrivateKey(serverKey))
	writeFile("certs/server.crt", encodeCert(serverCert))

	// Generate Agent cert
	agentKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}

	agentTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject: pkix.Name{
			Organization:       []string{"InfraPilot Enterprise"},
			Country:            []string{"US"},
			Province:           []string{"State"},
			Locality:           []string{"City"},
			OrganizationalUnit: []string{"Agent"},
			CommonName:         "InfraPilot Agent",
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().AddDate(1, 0, 0),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	agentCert, err := x509.CreateCertificate(rand.Reader, agentTemplate, caTemplate, &agentKey.PublicKey, caKey)
	if err != nil {
		panic(err)
	}

	writeFile("certs/agent.key", encodePrivateKey(agentKey))
	writeFile("certs/agent.crt", encodeCert(agentCert))

	fmt.Println("✓ Generated certificates in certs/:")
	fmt.Println("  - ca.key, ca.crt")
	fmt.Println("  - server.key, server.crt")
	fmt.Println("  - agent.key, agent.crt")
}

func encodePrivateKey(key interface{}) []byte {
	var buf []byte
	switch k := key.(type) {
	case *ecdsa.PrivateKey:
		b, err := x509.MarshalECPrivateKey(k)
		if err != nil {
			panic(err)
		}
		buf = pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: b})
	}
	return buf
}

func encodeCert(cert []byte) []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert})
}

func writeFile(path string, data []byte) {
	if err := os.WriteFile(path, data, 0644); err != nil {
		panic(err)
	}
}
