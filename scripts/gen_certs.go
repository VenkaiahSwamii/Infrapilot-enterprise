package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	outDir := flag.String("dir", "certs", "Output directory for PEM certificate files")
	customIP := flag.String("ip", "", "Comma-separated IP addresses for Server SANs")
	customDNS := flag.String("dns", "", "Comma-separated DNS names for Server SANs")
	flag.Parse()

	if err := os.MkdirAll(*outDir, 0755); err != nil {
		log.Fatalf("Failed to create certificates directory: %v", err)
	}

	fmt.Println("===================================================================================================")
	fmt.Println("               INFRAPILOT ENTERPRISE - mTLS CERTIFICATE GENERATOR")
	fmt.Println("===================================================================================================")
	fmt.Printf("Output Directory : %s\n", *outDir)

	// 1. Generate Root CA
	caPriv, caCertBytes, err := generateCA(*outDir)
	if err != nil {
		log.Fatalf("Failed to generate Root CA: %v", err)
	}

	caCert, err := x509.ParseCertificate(caCertBytes)
	if err != nil {
		log.Fatalf("Failed to parse Root CA certificate: %v", err)
	}

	// 2. Determine Server Subject Alternative Names (SANs)
	sans := []string{"localhost", "127.0.0.1", "infrapilot-backend", "0.0.0.0"}

	// Auto-detect IPs from local machine interfaces
	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			if addrs, err := iface.Addrs(); err == nil {
				for _, addr := range addrs {
					if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
						if ip4 := ipnet.IP.To4(); ip4 != nil {
							sans = append(sans, ip4.String())
						}
					}
				}
			}
		}
	}

	if *customIP != "" {
		sans = append(sans, strings.Split(*customIP, ",")...)
	}
	if *customDNS != "" {
		sans = append(sans, strings.Split(*customDNS, ",")...)
	}

	fmt.Printf("Server SANs      : %v\n", sans)
	fmt.Println("---------------------------------------------------------------------------------------------------")

	// 3. Generate Server Certificate
	err = generateCert(*outDir, "server", "InfraPilot Enterprise Backend", sans, caCert, caPriv, x509.ExtKeyUsageServerAuth)
	if err != nil {
		log.Fatalf("Failed to generate server cert: %v", err)
	}

	// 4. Generate Agent Client Certificate
	err = generateCert(*outDir, "agent", "InfraPilot Edge Agent", nil, caCert, caPriv, x509.ExtKeyUsageClientAuth)
	if err != nil {
		log.Fatalf("Failed to generate agent cert: %v", err)
	}

	// 5. Generate Benchmark/Client Certificate
	err = generateCert(*outDir, "client", "InfraPilot Benchmark Client", nil, caCert, caPriv, x509.ExtKeyUsageClientAuth)
	if err != nil {
		log.Fatalf("Failed to generate client cert: %v", err)
	}

	fmt.Println("===================================================================================================")
	fmt.Printf("SUCCESS: All enterprise mTLS certificates issued successfully in: %s/\n", *outDir)
	fmt.Println("===================================================================================================")
}

func generateCA(outDir string) (*ecdsa.PrivateKey, []byte, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}

	caTemplate := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"InfraPilot Enterprise CA"},
			CommonName:   "InfraPilot Root CA",
		},
		NotBefore:             time.Now().Add(-10 * time.Minute),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
	}

	caBytes, err := x509.CreateCertificate(rand.Reader, &caTemplate, &caTemplate, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}

	writePEM(filepath.Join(outDir, "ca.crt"), "CERTIFICATE", caBytes)
	privBytes, _ := x509.MarshalECPrivateKey(priv)
	writePEM(filepath.Join(outDir, "ca.key"), "EC PRIVATE KEY", privBytes)

	fmt.Printf("[+] Issued Root CA      : %s/ca.crt (Valid: 10 Years)\n", outDir)
	return priv, caBytes, nil
}

func generateCert(outDir, filename, commonName string, sans []string, caCert *x509.Certificate, caPriv *ecdsa.PrivateKey, extKeyUsage x509.ExtKeyUsage) error {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"InfraPilot Enterprise"},
			CommonName:   commonName,
		},
		NotBefore:             time.Now().Add(-10 * time.Minute),
		NotAfter:              time.Now().AddDate(2, 0, 0),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{extKeyUsage},
		BasicConstraintsValid: true,
	}

	for _, san := range sans {
		san = strings.TrimSpace(san)
		if san == "" {
			continue
		}
		if ip := net.ParseIP(san); ip != nil {
			template.IPAddresses = append(template.IPAddresses, ip)
		} else {
			template.DNSNames = append(template.DNSNames, san)
		}
	}

	certBytes, err := x509.CreateCertificate(rand.Reader, &template, caCert, &priv.PublicKey, caPriv)
	if err != nil {
		return err
	}

	crtPath := filepath.Join(outDir, filename+".crt")
	keyPath := filepath.Join(outDir, filename+".key")

	writePEM(crtPath, "CERTIFICATE", certBytes)
	privBytes, _ := x509.MarshalECPrivateKey(priv)
	writePEM(keyPath, "EC PRIVATE KEY", privBytes)

	fmt.Printf("[+] Issued Certificate  : %s (CommonName: %s)\n", crtPath, commonName)
	return nil
}

func writePEM(path, blockType string, rawBytes []byte) {
	file, err := os.Create(path)
	if err != nil {
		log.Printf("Failed to write PEM file %s: %v", path, err)
		return
	}
	defer file.Close()

	_ = pem.Encode(file, &pem.Block{Type: blockType, Bytes: rawBytes})
}
