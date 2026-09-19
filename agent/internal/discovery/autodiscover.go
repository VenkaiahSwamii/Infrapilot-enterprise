package discovery

import (
	"fmt"
	"log"
	"net"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	discoveryMu      sync.Mutex
	lastDiscoveryTime time.Time
)

// DiscoverServerURL broadcasts a UDP ping on port 50052 to locate the InfraPilot server on the LAN
func DiscoverServerURL(configPath string, currentURL string) string {
	discoveryMu.Lock()
	defer discoveryMu.Unlock()

	// Prevent spamming UDP discovery if executed frequently
	if time.Since(lastDiscoveryTime) < 10*time.Second {
		return ""
	}
	lastDiscoveryTime = time.Now()

	log.Printf("[AutoDiscovery] Backend unreachable at %s. Broadcasting UDP discovery ping on LAN (port 50052)...", currentURL)

	addr, err := net.ResolveUDPAddr("udp4", "255.255.255.255:50052")
	if err != nil {
		log.Printf("[AutoDiscovery] Error resolving UDP broadcast address: %v", err)
		return ""
	}

	conn, err := net.DialUDP("udp4", nil, addr)
	if err != nil {
		log.Printf("[AutoDiscovery] Error opening UDP broadcast socket: %v", err)
		return ""
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))

	msg := []byte("INFRAPILOT_DISCOVERY_PING")
	_, err = conn.Write(msg)
	if err != nil {
		log.Printf("[AutoDiscovery] Error writing UDP discovery ping: %v", err)
		return ""
	}

	buf := make([]byte, 1024)
	n, _, err := conn.ReadFromUDP(buf)
	if err != nil {
		log.Printf("[AutoDiscovery] No UDP response received from LAN server: %v", err)
		return ""
	}

	respStr := strings.TrimSpace(string(buf[:n]))
	if strings.HasPrefix(respStr, "INFRAPILOT_DISCOVERY_PONG:") {
		newURL := strings.TrimPrefix(respStr, "INFRAPILOT_DISCOVERY_PONG:")
		newURL = strings.TrimSpace(newURL)

		if newURL != "" && newURL != currentURL {
			log.Printf("[AutoDiscovery] ✅ Discovered new InfraPilot server IP: %s (Previous: %s)", newURL, currentURL)
			UpdateLocalConfig(configPath, newURL)
			return newURL
		}
	}

	return ""
}

// UpdateLocalConfig rewrites backend_url in local config.toml file
func UpdateLocalConfig(configPath string, newURL string) {
	if configPath == "" {
		// Attempt standard config locations
		candidates := []string{
			"/etc/infrapilot/config.toml",
			`C:\Program Files\InfraPilot\config.toml`,
			"./config.toml",
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				configPath = c
				break
			}
		}
	}

	if configPath == "" {
		return
	}

	contentBytes, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("[AutoDiscovery] Error reading config file %s for update: %v", configPath, err)
		return
	}

	contentStr := string(contentBytes)
	re := regexp.MustCompile(`(?m)^backend_url\s*=\s*".*?"`)
	newContent := re.ReplaceAllString(contentStr, fmt.Sprintf(`backend_url = "%s"`, newURL))

	err = os.WriteFile(configPath, []byte(newContent), 0640)
	if err != nil {
		log.Printf("[AutoDiscovery] Error writing updated config.toml: %v", err)
	} else {
		log.Printf("[AutoDiscovery] Successfully updated backend_url to '%s' in %s", newURL, configPath)
	}
}
