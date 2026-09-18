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

	outDir := filepath.Join(".", "dist")
	_ = os.MkdirAll(outDir, 0755)

	fmt.Println("==================================================")
	fmt.Println(" Starting SREMonitor / InfraPilot Cross-Compilation")
	fmt.Println("==================================================")

	// Cross compile Agent binary
	agentDir := filepath.Join(".", "agent")

	for _, t := range targets {
		agentOut := filepath.Join(outDir, fmt.Sprintf("infrapilot-agent-%s-%s%s", t.OS, t.Arch, t.Ext))
		fmt.Printf("Building Agent for %s/%s -> %s\n", t.OS, t.Arch, agentOut)

		cmd := exec.Command("go", "build", "-ldflags", "-s -w", "-o", agentOut, "./cmd/agent")
		cmd.Dir = agentDir
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.OS, "GOARCH="+t.Arch)

		if err := cmd.Run(); err != nil {
			fmt.Printf(" [FAILED] %s/%s: %v\n", t.OS, t.Arch, err)
		} else {
			fmt.Printf(" [SUCCESS] Built %s\n", agentOut)
		}
	}


	// Cross compile Backend API server binary
	backendDir := filepath.Join(".", "backend")
	for _, t := range targets {
		serverOut := filepath.Join(outDir, fmt.Sprintf("infrapilot-backend-%s-%s%s", t.OS, t.Arch, t.Ext))
		fmt.Printf("Building Backend Server for %s/%s -> %s\n", t.OS, t.Arch, serverOut)

		cmd := exec.Command("go", "build", "-ldflags", "-s -w", "-o", serverOut, "./cmd/api")
		cmd.Dir = backendDir
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.OS, "GOARCH="+t.Arch)

		if err := cmd.Run(); err != nil {
			fmt.Printf(" [FAILED] %s/%s: %v\n", t.OS, t.Arch, err)
		} else {
			fmt.Printf(" [SUCCESS] Built %s\n", serverOut)
		}
	}

	fmt.Println("==================================================")
	fmt.Println(" Cross-Compilation Completed! All binaries in ./dist/")
	fmt.Println("==================================================")
}
