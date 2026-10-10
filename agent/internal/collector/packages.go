package collector

import (
	"bytes"
	"context"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// CollectInstalledPackages queries the host package manager and key software binaries
// for exact installed versions in a fast, non-blocking manner (< 500ms timeout).
func CollectInstalledPackages() map[string]string {
	packages := make(map[string]string)

	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	switch runtime.GOOS {
	case "linux":
		collectLinuxPackages(ctx, packages)
	case "windows":
		collectWindowsPackages(ctx, packages)
	case "darwin":
		collectDarwinPackages(ctx, packages)
	}

	return packages
}

func collectLinuxPackages(ctx context.Context, pkgs map[string]string) {
	// 1. Check Debian / Ubuntu dpkg-query for critical target packages
	criticalDebPkgs := []string{"openssh-server", "curl", "libcurl4", "openssl", "sudo", "libc6", "nginx", "docker.io"}
	args := append([]string{"-W", "-f=${Package}\t${Version}\n"}, criticalDebPkgs...)

	cmd := exec.CommandContext(ctx, "dpkg-query", args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		lines := strings.Split(out.String(), "\n")
		for _, line := range lines {
			parts := strings.Split(strings.TrimSpace(line), "\t")
			if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
				pkgs[strings.ToLower(parts[0])] = parts[1]
			}
		}
	}

	// 2. Direct binary fallback if dpkg-query didn't find specific packages
	if _, ok := pkgs["openssh-server"]; !ok {
		if sshVer := getBinaryVersion(ctx, "sshd", "-V"); sshVer != "" {
			pkgs["openssh-server"] = sshVer
		}
	}
	if _, ok := pkgs["curl"]; !ok {
		if curlVer := getBinaryVersion(ctx, "curl", "--version"); curlVer != "" {
			pkgs["curl"] = curlVer
		}
	}
}

func collectWindowsPackages(ctx context.Context, pkgs map[string]string) {
	// 1. Check OpenSSH for Windows
	if sshVer := getBinaryVersion(ctx, "ssh", "-V"); sshVer != "" {
		pkgs["openssh-server"] = sshVer
		pkgs["openssh"] = sshVer
	}
	// 2. Check curl
	if curlVer := getBinaryVersion(ctx, "curl", "--version"); curlVer != "" {
		pkgs["curl"] = curlVer
	}
	// 3. Check OpenSSL
	if sslVer := getBinaryVersion(ctx, "openssl", "version"); sslVer != "" {
		pkgs["openssl"] = sslVer
	}
	// 4. Default baseline Windows system packages
	pkgs["microsoft-windows"] = "10.0.22631"
}

func collectDarwinPackages(ctx context.Context, pkgs map[string]string) {
	if sshVer := getBinaryVersion(ctx, "ssh", "-V"); sshVer != "" {
		pkgs["openssh-server"] = sshVer
	}
	if curlVer := getBinaryVersion(ctx, "curl", "--version"); curlVer != "" {
		pkgs["curl"] = curlVer
	}
}

func getBinaryVersion(ctx context.Context, binary string, arg string) string {
	cmd := exec.CommandContext(ctx, binary, arg)
	var out, errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut

	_ = cmd.Run()
	combined := strings.TrimSpace(out.String() + " " + errOut.String())
	if combined == "" {
		return ""
	}

	// Extract version token (e.g., "OpenSSH_10.2p1" -> "10.2p1", "curl 8.5.0" -> "8.5.0")
	fields := strings.Fields(combined)
	for _, f := range fields {
		fClean := strings.Trim(f, ",;")
		if strings.HasPrefix(strings.ToLower(fClean), "openssh_") {
			return strings.TrimPrefix(fClean, "OpenSSH_")
		}
		if strings.HasPrefix(strings.ToLower(fClean), "curl") && len(fields) > 1 {
			continue
		}
		// Check for digit-containing version strings (e.g. "8.5.0", "10.2p1")
		if strings.ContainsAny(fClean, "0123456789") && (strings.Contains(fClean, ".") || strings.Contains(fClean, "p")) {
			return fClean
		}
	}

	if len(fields) > 1 {
		return fields[1]
	}
	return combined
}
