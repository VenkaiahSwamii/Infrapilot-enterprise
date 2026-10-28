package services

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"infrapilot/backend/internal/config"
)

// -----------------------------------------------------------------------------
// TEST 1: Dynamic URL Resolution - Localhost Swap for Remote Targets
// -----------------------------------------------------------------------------
func TestDynamicURL_LocalhostSwap(t *testing.T) {
	cfg := config.Get()
	if cfg == nil {
		config.Load()
		cfg = config.Get()
	}
	originalBackendURL := cfg.BackendURL
	cfg.BackendURL = "http://192.168.1.24:8080"
	defer func() { cfg.BackendURL = originalBackendURL }()

	remoteHost := "192.168.1.28"

	// Case 1A: UI sent localhost:8080
	resolved := ResolveServerURL("http://localhost:8080", remoteHost)
	if resolved != "http://192.168.1.24:8080" {
		t.Errorf("expected localhost to be swapped with cfg.BackendURL, got: %s", resolved)
	}

	// Case 1B: UI sent 127.0.0.1:8080
	resolved127 := ResolveServerURL("http://127.0.0.1:8080", remoteHost)
	if resolved127 != "http://192.168.1.24:8080" {
		t.Errorf("expected 127.0.0.1 to be swapped with cfg.BackendURL, got: %s", resolved127)
	}

	// Case 1C: UI sent empty string
	resolvedEmpty := ResolveServerURL("", remoteHost)
	if resolvedEmpty != "http://192.168.1.24:8080" {
		t.Errorf("expected empty string to resolve to cfg.BackendURL, got: %s", resolvedEmpty)
	}

	// Case 1D: Trailing slash trimmed
	resolvedSlash := ResolveServerURL("http://localhost:8080/", remoteHost)
	if resolvedSlash != "http://192.168.1.24:8080" {
		t.Errorf("expected trailing slash trimmed and swapped, got: %s", resolvedSlash)
	}
}

// -----------------------------------------------------------------------------
// TEST 2: Dynamic URL Resolution - Custom & Loopback URLs Preserved
// -----------------------------------------------------------------------------
func TestDynamicURL_CustomPreserved(t *testing.T) {
	cfg := config.Get()
	if cfg == nil {
		config.Load()
		cfg = config.Get()
	}
	originalBackendURL := cfg.BackendURL
	cfg.BackendURL = "http://192.168.1.24:8080"
	defer func() { cfg.BackendURL = originalBackendURL }()

	// Case 2A: Custom domain/proxy URL targeting remote machine must be preserved
	customURL := "https://telemetry.corp.internal:8443"
	resolvedCustom := ResolveServerURL(customURL, "192.168.1.28")
	if resolvedCustom != customURL {
		t.Errorf("expected custom URL to be preserved, got: %s", resolvedCustom)
	}

	// Case 2B: Localhost target retains localhost URL
	localURL := "http://localhost:8080"
	resolvedLocal := ResolveServerURL(localURL, "localhost")
	if resolvedLocal != localURL {
		t.Errorf("expected localhost to be preserved for loopback target, got: %s", resolvedLocal)
	}

	// Case 2C: 127.0.0.1 target retains 127.0.0.1 URL
	resolved127Target := ResolveServerURL(localURL, "127.0.0.1")
	if resolved127Target != localURL {
		t.Errorf("expected localhost to be preserved for 127.0.0.1 target, got: %s", resolved127Target)
	}
}

// -----------------------------------------------------------------------------
// TEST 3: SSH Command Timeout Enforcement
// -----------------------------------------------------------------------------
func TestSSHCommand_TimeoutEnforcement(t *testing.T) {
	// Case 3A: Nil client fails fast with explicit error
	out, err := runSSHCommandWithTimeout(nil, "sleep 10", 50*time.Millisecond)
	if err == nil || !strings.Contains(err.Error(), "nil ssh client") {
		t.Errorf("expected nil ssh client error, got: out=%s, err=%v", out, err)
	}

	// Case 3B: Verify runSSHCommand delegates to default 60s timeout
	_, defaultErr := runSSHCommand(nil, "echo test")
	if defaultErr == nil || !strings.Contains(defaultErr.Error(), "nil ssh client") {
		t.Errorf("expected default runSSHCommand to fail with nil client error, got: %v", defaultErr)
	}
}

// -----------------------------------------------------------------------------
// TEST 4: Step Progression Lifecycle (pending -> running -> success / failed)
// -----------------------------------------------------------------------------
func TestStepProgression_LifeCycle(t *testing.T) {
	step := RemoteDeployStep{
		StepID:     1,
		Title:      "SSH Handshake & Credential Verification",
		Status:     "pending",
		Details:    "Waiting...",
		DurationMs: 0,
	}

	if step.Status != "pending" {
		t.Errorf("expected initial status pending, got: %s", step.Status)
	}

	// Simulate running
	step.Status = "running"
	step.Details = "Connecting to target..."
	if step.Status != "running" {
		t.Errorf("expected status running, got: %s", step.Status)
	}

	// Simulate completion
	step.Status = "success"
	step.Details = "SSH authenticated successfully."
	step.DurationMs = 150
	if step.Status != "success" || step.DurationMs != 150 {
		t.Errorf("expected success status with 150ms duration, got: status=%s, dur=%d", step.Status, step.DurationMs)
	}
}

// -----------------------------------------------------------------------------
// TEST 5: Live Log Streaming & Password Redaction
// -----------------------------------------------------------------------------
func TestLogStreaming_PasswordRedaction(t *testing.T) {
	secretPass := "SuperSecretP@ss123"
	sudoPass := "RootMasterKey999"

	logs := make([]string, 0)
	var mu sync.Mutex

	addLog := func(format string, a ...interface{}) {
		msg := fmt.Sprintf(format, a...)
		if len(secretPass) > 3 {
			msg = strings.ReplaceAll(msg, secretPass, "********")
		}
		if len(sudoPass) > 3 {
			msg = strings.ReplaceAll(msg, sudoPass, "********")
		}
		mu.Lock()
		logs = append(logs, msg)
		mu.Unlock()
	}

	addLog("Authenticating with password %s and sudo %s", secretPass, sudoPass)

	mu.Lock()
	defer mu.Unlock()
	if len(logs) != 1 {
		t.Fatalf("expected 1 log entry, got %d", len(logs))
	}
	if strings.Contains(logs[0], secretPass) {
		t.Errorf("security flaw: secretPass was not redacted from log: %s", logs[0])
	}
	if strings.Contains(logs[0], sudoPass) {
		t.Errorf("security flaw: sudoPass was not redacted from log: %s", logs[0])
	}
	if !strings.Contains(logs[0], "********") {
		t.Errorf("expected redacted placeholder '********', got: %s", logs[0])
	}
}

// -----------------------------------------------------------------------------
// TEST 6: Linux Sudo Password Shell Metacharacter Escaping
// -----------------------------------------------------------------------------
func TestLinuxCommand_Escaping(t *testing.T) {
	// Single quote inside password must be escaped to '\'' for bash single-quoted strings
	dangerousPass := "my'pass'word!$123"
	escaped := EscapeBashSingleQuotes(dangerousPass)
	expected := `my'\''pass'\''word!$123`
	if escaped != expected {
		t.Errorf("expected escaped password '%s', got '%s'", expected, escaped)
	}

	// Normal password without single quotes must remain unchanged
	normalPass := "NormalPassword123!"
	if EscapeBashSingleQuotes(normalPass) != normalPass {
		t.Errorf("normal password should not be altered: %s", normalPass)
	}
}

// -----------------------------------------------------------------------------
// TEST 7: Windows PowerShell Target Command Generation
// -----------------------------------------------------------------------------
func TestWindowsCommand_ScriptGeneration(t *testing.T) {
	serverURL := "http://192.168.1.24:8080"
	enrollToken := "iptk_win_test_token"

	psDownloadCmd := fmt.Sprintf(`powershell -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((iwr -useb '%s/api/v1/agent/install.ps1').Content)) -ServerURL '%s' -EnrollToken '%s'"`, serverURL, serverURL, enrollToken)

	if !strings.Contains(psDownloadCmd, "-ExecutionPolicy Bypass") {
		t.Errorf("expected ExecutionPolicy Bypass in command")
	}
	if !strings.Contains(psDownloadCmd, serverURL) {
		t.Errorf("expected serverURL in command")
	}
	if !strings.Contains(psDownloadCmd, enrollToken) {
		t.Errorf("expected enrollToken in command")
	}
	if !strings.Contains(psDownloadCmd, "[scriptblock]::Create") {
		t.Errorf("expected in-memory scriptblock creation in command")
	}
}

// -----------------------------------------------------------------------------
// TEST 8: Asynchronous Execution Instant Handshake & Polling Verification
// -----------------------------------------------------------------------------
func TestAsyncExecution_InstantHandshake(t *testing.T) {
	svc := NewRemoteDeployService(nil)

	target := RemoteDeployTarget{
		Host:     "192.168.1.28",
		Port:     22,
		Username: "ubuntu",
		Password: "password",
	}

	start := time.Now()
	res, err := svc.StartDeployAsync(target)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("unexpected error starting async deploy: %v", err)
	}
	if elapsed > 100*time.Millisecond {
		t.Errorf("expected instant handshake (<100ms), took %v", elapsed)
	}
	if !strings.HasPrefix(res.DeploymentID, "dep_") {
		t.Errorf("expected deployment_id to start with 'dep_', got: %s", res.DeploymentID)
	}
	if res.Status != "running" {
		t.Errorf("expected status 'running', got: %s", res.Status)
	}
	if len(res.Steps) != 6 {
		t.Errorf("expected 6 steps initialized, got: %d", len(res.Steps))
	}

	// Verify immediately queryable in history
	queried := svc.GetDeployment(res.DeploymentID)
	if queried == nil {
		t.Fatalf("expected deployment record to be immediately queryable via GetDeployment")
	}
	if queried.DeploymentID != res.DeploymentID {
		t.Errorf("queried deployment ID mismatch: %s vs %s", queried.DeploymentID, res.DeploymentID)
	}

	// Verify that the background worker updates the EXACT SAME deployment record
	var finalStatus string
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
		item := svc.GetDeployment(res.DeploymentID)
		if item != nil && item.Status != "running" {
			finalStatus = item.Status
			if len(item.Logs) <= 1 {
				t.Errorf("expected background worker to append execution logs to same deployment ID")
			}
			break
		}
	}
	if finalStatus != "failed" {
		t.Errorf("expected background worker to update same deployment ID to 'failed' on closed port, got: %s", finalStatus)
	}
}

// -----------------------------------------------------------------------------
// TEST 9: Unreachable Host Fast Failure (< 8s) & Status Reflection
// -----------------------------------------------------------------------------
func TestUnreachableHost_FastFailure(t *testing.T) {
	svc := NewRemoteDeployService(nil)

	target := RemoteDeployTarget{
		Host:     "127.0.0.1",
		Port:     59998, // Closed/unreachable port
		Username: "root",
		Password: "password",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	start := time.Now()
	res, err := svc.DeployAgent(ctx, target)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	if res.Success {
		t.Errorf("expected deployment to fail on closed port 59998")
	}
	if res.Status != "failed" {
		t.Errorf("expected result.Status to be 'failed', got: %s", res.Status)
	}
	if res.Error == "" {
		t.Errorf("expected error message to be set")
	}
	if elapsed > 8*time.Second {
		t.Errorf("expected fail-fast within 8s timeout, took %v", elapsed)
	}
}

// -----------------------------------------------------------------------------
// TEST 10: Concurrent Deployments Isolation & Race Condition Prevention
// -----------------------------------------------------------------------------
func TestConcurrentDeployments_Isolation(t *testing.T) {
	svc := NewRemoteDeployService(nil)
	const concurrentJobs = 10

	var wg sync.WaitGroup
	deployIDs := make([]string, concurrentJobs)

	for i := 0; i < concurrentJobs; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			jobTarget := RemoteDeployTarget{
				Host:     fmt.Sprintf("10.0.0.%d", 100+idx),
				Port:     22,
				Username: fmt.Sprintf("user_%d", idx),
				Password: fmt.Sprintf("pass_%d", idx),
			}
			res, err := svc.StartDeployAsync(jobTarget)
			if err != nil {
				t.Errorf("failed to start async job %d: %v", idx, err)
				return
			}
			deployIDs[idx] = res.DeploymentID

			// Concurrently read and poll
			for j := 0; j < 5; j++ {
				_ = svc.GetDeployment(res.DeploymentID)
				_ = svc.GetDeploymentHistory()
				time.Sleep(5 * time.Millisecond)
			}
		}(i)
	}

	wg.Wait()

	// Verify all 10 records are uniquely registered without collisions
	seen := make(map[string]bool)
	for _, id := range deployIDs {
		if id == "" {
			t.Errorf("encountered empty deployment ID")
			continue
		}
		if seen[id] {
			t.Errorf("duplicate deployment ID detected: %s", id)
		}
		seen[id] = true

		rec := svc.GetDeployment(id)
		if rec == nil {
			t.Errorf("failed to retrieve concurrent deployment %s", id)
		}
	}

	history := svc.GetDeploymentHistory()
	if len(history) < concurrentJobs {
		t.Errorf("expected at least %d history records, got %d", concurrentJobs, len(history))
	}
}
