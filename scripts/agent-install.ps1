# ==============================================================================
# InfraPilot Enterprise - Windows Agent Service Installer Script
# Installs agent as a native Windows Service (InfraPilotAgent)
# ==============================================================================
param(
    [string]$ServerURL = "http://192.168.1.2:8080",
    [string]$EnrollToken = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   🚀 InfraPilot Enterprise Windows Agent Installer     " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$InstallDir = "$env:ProgramFiles\InfraPilot"
$CertsDir = "$InstallDir\certs"
$ServiceName = "InfraPilotAgent"
$BinaryPath = "$InstallDir\infrapilot-agent.exe"
$ConfigPath = "$InstallDir\config.toml"
$CertPath = "$CertsDir\ca.crt"

# 1. Create Target Directories
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}
if (-not (Test-Path $CertsDir)) {
    New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null
}

# 2. Download Windows Agent Binary
Write-Host "[+] Downloading InfraPilot Agent binary from $ServerURL..." -ForegroundColor Green
$BinaryURL = "$ServerURL/downloads/infrapilot-agent-windows-amd64.exe"
try {
    Invoke-WebRequest -Uri $BinaryURL -OutFile $BinaryPath -UseBasicParsing
} catch {
    $FallbackURL = "$ServerURL/downloads/infrapilot-agent.exe"
    Invoke-WebRequest -Uri $FallbackURL -OutFile $BinaryPath -UseBasicParsing
}

# 3. Download CA Certificate
Write-Host "[+] Fetching CA Certificate for encrypted TLS communication..." -ForegroundColor Green
try {
    Invoke-WebRequest -Uri "$ServerURL/downloads/ca.crt" -OutFile $CertPath -UseBasicParsing
} catch {
    "" | Out-File -FilePath $CertPath -Encoding ascii
}

# 4. Write Configuration File
Write-Host "[+] Writing agent configuration ($ConfigPath)..." -ForegroundColor Green
$Hostname = $env:COMPUTERNAME
$ConfigContent = @"
backend_url = "$ServerURL"
enrollment_token = "$EnrollToken"
registered_hostname = "$Hostname"
interval = 5

[logging]
log_level = "info"
log_format = "text"

[collectors]
system = true
processes = true
docker = true
kubernetes = true
logs = true
security = true

[tls]
ca_cert = "$($CertPath -replace '\\', '/')"
enabled = true
"@

Set-Content -Path $ConfigPath -Value $ConfigContent -Encoding UTF8

# 5. Stop existing service if running
$ExistingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($ExistingService) {
    Write-Host "[+] Stopping existing $ServiceName service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 6. Register & Start Windows Service
Write-Host "[+] Registering Windows Service '$ServiceName'..." -ForegroundColor Green
if (-not $ExistingService) {
    New-Service -Name $ServiceName `
                -BinaryPathName "`"$BinaryPath`" --config `"$ConfigPath`"" `
                -DisplayName "InfraPilot Enterprise Telemetry Agent" `
                -Description "Collects metrics, logs, and system health telemetries for InfraPilot Enterprise." `
                -StartupType Automatic | Out-Null
}

Write-Host "[+] Starting $ServiceName..." -ForegroundColor Green
Start-Service -Name $ServiceName

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   ✅ InfraPilot Windows Agent Successfully Installed!  " -ForegroundColor Green
Write-Host "   Service:  $ServiceName                               " -ForegroundColor Green
Write-Host "   Path:     $BinaryPath                                " -ForegroundColor Green
Write-Host "   Config:   $ConfigPath                                " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
