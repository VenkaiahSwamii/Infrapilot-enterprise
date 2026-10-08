package commands

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"infrapilot/agent/internal/config"
)

type Command struct {
	ID        string    `json:"id"`
	MachineID string    `json:"machine_id"`
	Command   string    `json:"command"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type CommandResult struct {
	CommandID string `json:"command_id"`
	Output    string `json:"output"`
	Status    string `json:"status"`
}

type TerminalCommand struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	MachineID string `json:"machine_id"`
	Command   string `json:"command"`
}

type TerminalCommandResult struct {
	CommandID string `json:"command_id"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	Output    string `json:"output"`
	ExitCode  int    `json:"exit_code"`
	Status    string `json:"status"`
}

// PollAndExecute runs a loop checking for pending generic commands and terminal commands every 3 seconds
func PollAndExecute(backendURL string, machineID string, apiKey string) {
	client := &http.Client{Timeout: 10 * time.Second}
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		fetchAndExecuteCommands(client, backendURL, machineID, apiKey)
		fetchAndExecuteTerminalCommands(client, backendURL, machineID, apiKey)
	}
}

func fetchAndExecuteCommands(client *http.Client, backendURL, machineID, apiKey string) {
	reqURL := fmt.Sprintf("%s/api/v1/agent/commands?machine_id=%s", backendURL, machineID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		log.Printf("[CommandPoll] Error creating request: %v", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[CommandPoll] Error polling backend: %v", err)
		return
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return
	}

	var pending []Command
	if err := json.NewDecoder(resp.Body).Decode(&pending); err != nil {
		log.Printf("[CommandPoll] Decode error: %v", err)
		resp.Body.Close()
		return
	}
	resp.Body.Close()

	for _, cmd := range pending {
		log.Printf("[CommandExecutor] Executing command: %s", cmd.Command)
		go executeCommand(client, backendURL, apiKey, cmd)
	}
}

func fetchAndExecuteTerminalCommands(client *http.Client, backendURL, machineID, apiKey string) {
	reqURL := fmt.Sprintf("%s/api/v1/terminal/commands/pending?machine_id=%s", backendURL, machineID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		log.Printf("[TerminalPoll] Error creating request: %v", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[TerminalPoll] Error polling backend: %v", err)
		return
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return
	}

	var pending []TerminalCommand
	if err := json.NewDecoder(resp.Body).Decode(&pending); err != nil {
		log.Printf("[TerminalPoll] Decode error: %v", err)
		resp.Body.Close()
		return
	}
	resp.Body.Close()

	for _, tcmd := range pending {
		log.Printf("[TerminalExecutor] Executing terminal command: %s", tcmd.Command)
		go executeTerminalCommand(client, backendURL, apiKey, tcmd)
	}
}

func executeCommand(client *http.Client, backendURL, apiKey string, cmd Command) {
	var out bytes.Buffer
	status := "Completed"

	allowed := config.GetAllowedCommands()
	allowedOK := false
	for _, a := range allowed {
		if strings.HasPrefix(cmd.Command, a) {
			allowedOK = true
			break
		}
	}
	if !allowedOK {
		status = "Failed"
		out.WriteString("Command not allowed by policy")
	} else {
		var execCmd *exec.Cmd
		if runtime.GOOS == "windows" {
			execCmd = exec.Command("cmd", "/C", cmd.Command)
		} else {
			execCmd = exec.Command("bash", "-c", cmd.Command)
		}
		execCmd.Stdout = &out
		execCmd.Stderr = &out
		if err := execCmd.Run(); err != nil {
			status = "Failed"
			out.WriteString(fmt.Sprintf("\n[Execution Error]: %v", err))
		}
	}

	result := CommandResult{CommandID: cmd.ID, Output: out.String(), Status: status}
	payload, _ := json.Marshal(result)
	reqURL := backendURL + "/api/v1/commands/result"
	req, _ := http.NewRequest("POST", reqURL, bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
		log.Printf("[CommandExecutor] Sent output back. Status: %s", status)
	} else {
		log.Printf("[CommandExecutor] Failed to send output back: %v", err)
	}
}

func executeTerminalCommand(client *http.Client, backendURL, apiKey string, tcmd TerminalCommand) {
	var stdoutBuf, stderrBuf bytes.Buffer
	status := "SUCCESS"
	exitCode := 0

	allowed := config.GetAllowedCommands()
	allowedOK := false
	cmdTrimmed := strings.TrimSpace(tcmd.Command)
	for _, a := range allowed {
		if strings.HasPrefix(cmdTrimmed, a) {
			allowedOK = true
			break
		}
	}
	if !allowedOK {
		stderrBuf.WriteString("Command not allowed by policy")
		status = "FAILED"
		exitCode = 1
	} else {
		var execCmd *exec.Cmd
		if runtime.GOOS == "windows" {
			execCmd = exec.Command("cmd", "/C", tcmd.Command)
		} else {
			execCmd = exec.Command("bash", "-c", tcmd.Command)
		}
		execCmd.Stdout = &stdoutBuf
		execCmd.Stderr = &stderrBuf
		if err := execCmd.Run(); err != nil {
			status = "FAILED"
			exitCode = 1
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			}
			stderrBuf.WriteString(fmt.Sprintf("\n[Execution Error]: %v", err))
		}
	}

	result := TerminalCommandResult{
		CommandID: tcmd.ID,
		Stdout:    stdoutBuf.String(),
		Stderr:    stderrBuf.String(),
		Output:    stdoutBuf.String(),
		ExitCode:  exitCode,
		Status:    status,
	}
	payload, _ := json.Marshal(result)
	reqURL := backendURL + "/api/v1/terminal/commands/result"
	req, _ := http.NewRequest("POST", reqURL, bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
		log.Printf("[TerminalExecutor] Sent output back. Status: %s", status)
	} else {
		log.Printf("[TerminalExecutor] Failed to send output back: %v", err)
	}
}
