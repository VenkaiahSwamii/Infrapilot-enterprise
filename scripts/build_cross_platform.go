//go:build ignore

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

type Target struct {
	OS   string
	Arch string
	Ext  string
}

func main() {
	targets := []Target{
		{"linux", "amd64", ""},
		{"linux", "arm64", ""},
		{"windows", "amd64", ".exe"},
		{"darwin", "amd64", ""},
		{"darwin", "arm64", ""},
	}

	absOutDir, err := filepath.Abs(filepath.Join(".", "dist"))
	if err != nil {
		absOutDir = filepath.Join(".", "dist")
	}
	_ = os.MkdirAll(absOutDir, 0755)

	agentDist := filepath.Join(".", "agent", "dist")
	backendDist := filepath.Join(".", "backend", "dist")
	_ = os.MkdirAll(agentDist, 0755)
	_ = os.MkdirAll(backendDist, 0755)

	fmt.Println("==================================================")
	fmt.Println(" Starting SREMonitor / InfraPilot Cross-Compilation")
	fmt.Println("==================================================")

	// Cross compile Agent binary
	agentDir := filepath.Join(".", "agent")

	for _, t := range targets {
		binName := fmt.Sprintf("infrapilot-agent-%s-%s%s", t.OS, t.Arch, t.Ext)
		agentOut := filepath.Join(absOutDir, binName)
		agentLocalOut := filepath.Join(agentDist, binName)

		fmt.Printf("Building Agent for %s/%s -> %s\n", t.OS, t.Arch, agentOut)

		cmd := exec.Command("go", "build", "-ldflags", "-s -w", "-o", agentOut, "./cmd/agent")
		cmd.Dir = agentDir
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.OS, "GOARCH="+t.Arch)

		if err := cmd.Run(); err != nil {
			fmt.Printf(" [FAILED] %s/%s: %v\n", t.OS, t.Arch, err)
		} else {
			// Copy to agent/dist as well for HTTP download serving
			data, err := os.ReadFile(agentOut)
			if err == nil {
				_ = os.WriteFile(agentLocalOut, data, 0755)
			}
			fmt.Printf(" [SUCCESS] Built %s\n", agentOut)
		}
	}

	// Cross compile Backend API server binary
	backendDir := filepath.Join(".", "backend")
	for _, t := range targets {
		binName := fmt.Sprintf("infrapilot-backend-%s-%s%s", t.OS, t.Arch, t.Ext)
		serverOut := filepath.Join(absOutDir, binName)
		serverLocalOut := filepath.Join(backendDist, binName)

		fmt.Printf("Building Backend Server for %s/%s -> %s\n", t.OS, t.Arch, serverOut)

		cmd := exec.Command("go", "build", "-ldflags", "-s -w", "-o", serverOut, "./cmd/server")
		cmd.Dir = backendDir
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.OS, "GOARCH="+t.Arch)

		if err := cmd.Run(); err != nil {
			fmt.Printf(" [FAILED] %s/%s: %v\n", t.OS, t.Arch, err)
		} else {
			data, err := os.ReadFile(serverOut)
			if err == nil {
				_ = os.WriteFile(serverLocalOut, data, 0755)
			}
			fmt.Printf(" [SUCCESS] Built %s\n", serverOut)
		}
	}

	fmt.Println("==================================================")
	fmt.Printf(" Cross-Compilation Completed! All binaries in %s\n", absOutDir)
	fmt.Println("==================================================")
}
