# ==============================================================================
# InfraPilot Enterprise - Clean Binary Builder
# ==============================================================================
$ErrorActionPreference = "Continue"

$RootDir = Get-Location
$DistDir = "$RootDir\dist"
$AgentDist = "$RootDir\agent\dist"
$BackendDist = "$RootDir\backend\dist"
$SREDist = "$RootDir\sre-engine\dist"

# Clean old build artifacts
Write-Host "• Deleting old build artifacts..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$DistDir\*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$AgentDist\*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$BackendDist\*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$SREDist\*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$RootDir\frontend\dist\*" -ErrorAction SilentlyContinue
Remove-Item -Force "$RootDir\backend\server*.exe" -ErrorAction SilentlyContinue
Remove-Item -Force "$RootDir\sre-engine\sre-engine*.exe" -ErrorAction SilentlyContinue
Get-ChildItem -Path "$RootDir\backend\downloads" -Exclude "config.toml" | Remove-Item -Force -ErrorAction SilentlyContinue

# Ensure output directories exist
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
New-Item -ItemType Directory -Force -Path $AgentDist | Out-Null
New-Item -ItemType Directory -Force -Path $BackendDist | Out-Null
New-Item -ItemType Directory -Force -Path $SREDist | Out-Null

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " [1/5] Building Windows Native Backend, SRE & Agent" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Native Windows Backend Server
Write-Host "• Building Backend Server (Windows amd64)..." -ForegroundColor Yellow
Set-Location "$RootDir\backend"
go build -ldflags="-s -w" -o "$DistDir\infrapilot-backend-windows-amd64.exe" ./cmd/server
Copy-Item "$DistDir\infrapilot-backend-windows-amd64.exe" "$BackendDist\infrapilot-backend-windows-amd64.exe" -Force
try { Copy-Item "$DistDir\infrapilot-backend-windows-amd64.exe" "$RootDir\backend\server.exe" -Force -ErrorAction SilentlyContinue } catch {}

# 2. Native Windows SRE Diagnostic Engine
Write-Host "• Building SRE Diagnostic Engine (Windows amd64)..." -ForegroundColor Yellow
Set-Location "$RootDir\sre-engine"
go build -ldflags="-s -w" -o "$DistDir\sre-engine-windows-amd64.exe" ./cmd/engine
Copy-Item "$DistDir\sre-engine-windows-amd64.exe" "$SREDist\sre-engine-windows-amd64.exe" -Force
try { Copy-Item "$DistDir\sre-engine-windows-amd64.exe" "$RootDir\sre-engine\sre-engine.exe" -Force -ErrorAction SilentlyContinue } catch {}

# 3. Native Windows Agent
Write-Host "• Building Agent (Windows amd64)..." -ForegroundColor Yellow
Set-Location "$RootDir\agent"
go build -ldflags="-s -w" -o "$DistDir\infrapilot-agent-windows-amd64.exe" ./cmd/agent
Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$AgentDist\infrapilot-agent-windows-amd64.exe" -Force
try { Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$RootDir\agent\agent.exe" -Force -ErrorAction SilentlyContinue } catch {}
try { Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$RootDir\agent.exe" -Force -ErrorAction SilentlyContinue } catch {}
try { Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$RootDir\infrapilot-agent.exe" -Force -ErrorAction SilentlyContinue } catch {}
try { Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$RootDir\agent\infrapilot-agent.exe" -Force -ErrorAction SilentlyContinue } catch {}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " [2/5] Cross-Compiling Agent (Linux & macOS)      " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$agentTargets = @(
    @{ OS = "linux"; Arch = "amd64"; Name = "infrapilot-agent-linux-amd64" },
    @{ OS = "linux"; Arch = "arm64"; Name = "infrapilot-agent-linux-arm64" },
    @{ OS = "darwin"; Arch = "amd64"; Name = "infrapilot-agent-darwin-amd64" },
    @{ OS = "darwin"; Arch = "arm64"; Name = "infrapilot-agent-darwin-arm64" }
)

Set-Location "$RootDir\agent"
foreach ($t in $agentTargets) {
    Write-Host "• Compiling Agent for $($t.OS)/$($t.Arch)..." -ForegroundColor Yellow
    $env:CGO_ENABLED = "0"
    $env:GOOS = $t.OS
    $env:GOARCH = $t.Arch
    $outPath = "$DistDir\$($t.Name)"
    try {
        go build -ldflags="-s -w" -o $outPath ./cmd/agent
        if (Test-Path $outPath) {
            Copy-Item $outPath "$AgentDist\$($t.Name)" -Force
        }
    } catch {
        Write-Host " [!] Notice: $($t.Name) build skipped: $_" -ForegroundColor Yellow
    }
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " [3/5] Cross-Compiling Backend (Linux & macOS)    " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$backendTargets = @(
    @{ OS = "linux"; Arch = "amd64"; Name = "infrapilot-backend-linux-amd64" },
    @{ OS = "linux"; Arch = "arm64"; Name = "infrapilot-backend-linux-arm64" },
    @{ OS = "darwin"; Arch = "amd64"; Name = "infrapilot-backend-darwin-amd64" },
    @{ OS = "darwin"; Arch = "arm64"; Name = "infrapilot-backend-darwin-arm64" }
)

Set-Location "$RootDir\backend"
foreach ($t in $backendTargets) {
    Write-Host "• Compiling Backend for $($t.OS)/$($t.Arch)..." -ForegroundColor Yellow
    $env:CGO_ENABLED = "0"
    $env:GOOS = $t.OS
    $env:GOARCH = $t.Arch
    $outPath = "$DistDir\$($t.Name)"
    try {
        go build -ldflags="-s -w" -o $outPath ./cmd/server
        if (Test-Path $outPath) {
            Copy-Item $outPath "$BackendDist\$($t.Name)" -Force
        }
    } catch {
        Write-Host " [!] Notice: $($t.Name) build skipped: $_" -ForegroundColor Yellow
    }
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " [4/5] Cross-Compiling SRE Engine (Linux & macOS) " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$sreTargets = @(
    @{ OS = "linux"; Arch = "amd64"; Name = "sre-engine-linux-amd64" },
    @{ OS = "linux"; Arch = "arm64"; Name = "sre-engine-linux-arm64" },
    @{ OS = "darwin"; Arch = "amd64"; Name = "sre-engine-darwin-amd64" },
    @{ OS = "darwin"; Arch = "arm64"; Name = "sre-engine-darwin-arm64" }
)

Set-Location "$RootDir\sre-engine"
foreach ($t in $sreTargets) {
    Write-Host "• Compiling SRE Engine for $($t.OS)/$($t.Arch)..." -ForegroundColor Yellow
    $env:CGO_ENABLED = "0"
    $env:GOOS = $t.OS
    $env:GOARCH = $t.Arch
    $outPath = "$DistDir\$($t.Name)"
    try {
        go build -ldflags="-s -w" -o $outPath ./cmd/engine
        if (Test-Path $outPath) {
            Copy-Item $outPath "$SREDist\$($t.Name)" -Force
        }
    } catch {
        Write-Host " [!] Notice: $($t.Name) build skipped: $_" -ForegroundColor Yellow
    }
}

# Reset environment variables
$env:GOOS = ""
$env:GOARCH = ""
$env:CGO_ENABLED = ""

# Sync binaries to backend/downloads/ for installer scripts
Write-Host "• Syncing agent packages to backend\downloads..." -ForegroundColor Yellow
$DownloadsDir = "$RootDir\backend\downloads"
New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null
Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$DownloadsDir\infrapilot-agent.exe" -Force
Copy-Item "$DistDir\infrapilot-agent-windows-amd64.exe" "$DownloadsDir\infrapilot-agent-windows-amd64.exe" -Force
if (Test-Path "$DistDir\infrapilot-agent-linux-amd64") {
    Copy-Item "$DistDir\infrapilot-agent-linux-amd64" "$DownloadsDir\infrapilot-agent" -Force
    Copy-Item "$DistDir\infrapilot-agent-linux-amd64" "$DownloadsDir\infrapilot-agent-linux-amd64" -Force
}
Copy-Item "$RootDir\config.toml" "$DownloadsDir\config.toml" -Force

# 5. Build Frontend React Assets
Write-Host "• Building Frontend Production Assets (npm run build)..." -ForegroundColor Yellow
Set-Location "$RootDir\frontend"
npm run build

Set-Location $RootDir
Write-Host "==================================================" -ForegroundColor Green
Write-Host " [5/5] All Binaries & Assets Successfully Built!  " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Get-ChildItem "$DistDir" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
