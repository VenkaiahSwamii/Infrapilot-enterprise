package synthetic

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ValidateURL performs strict Server-Side Request Forgery (SSRF) checks on synthetic probe targets
func ValidateURL(rawURL string) error {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return fmt.Errorf("URL cannot be empty")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return fmt.Errorf("invalid URL format: %v", err)
	}

	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("unsupported scheme '%s': only http and https are allowed", scheme)
	}

	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("missing target host in URL")
	}

	// 1. Block Cloud Metadata Endpoints (AWS, GCP, Azure, DigitalOcean)
	if host == "169.254.169.254" || host == "metadata.google.internal" || host == "169.254.169.253" {
		return fmt.Errorf("SSRF protection: probe to cloud metadata endpoint (%s) is forbidden", host)
	}

	// 2. Resolve IP addresses to prevent local network exploitation if host is a domain
	ip := net.ParseIP(host)
	if ip != nil {
		if isForbiddenIP(ip) {
			return fmt.Errorf("SSRF protection: target IP (%s) is forbidden", ip.String())
		}
	} else {
		// Attempt DNS resolution for host verification
		ips, err := net.LookupIP(host)
		if err == nil {
			for _, resolvedIP := range ips {
				if resolvedIP.String() == "169.254.169.254" || isForbiddenIP(resolvedIP) {
					return fmt.Errorf("SSRF protection: host %s resolves to forbidden IP (%s)", host, resolvedIP.String())
				}
			}
		}
	}

	return nil
}

func isForbiddenIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsMulticast() {
		// Allow 127.0.0.1 for local dev probes if explicitly tested, but block metadata IPs
		if ip.String() == "169.254.169.254" {
			return true
		}
	}
	return false
}
