# Requires administrator privileges to update C:\Program Files\InfraPilot
Write-Host "Stopping InfraPilot Agent..." -ForegroundColor Cyan
Stop-Service InfraPilotAgent -Force -ErrorAction SilentlyContinue

$dir = "C:\Program Files\InfraPilot"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$jsonContent = @'
{
  "backend_url": "http://192.168.1.2:8080",
  "machine_id": "8296e585-82b2-4f83-bf73-ca965accb7b6",
  "api_key": "ip_live_21cecaf15ba9e649ad84fd306ab26602",
  "key_version": 1,
  "organization": "Default Organization",
  "interval": 5,
  "heartbeat_interval": 15,
  "os": "windows"
}
'@
Set-Content -Path "$dir\config.json" -Value $jsonContent -Force

$tomlContent = @'
backend_url = "http://192.168.1.2:8080"
registered_hostname = "SSA"
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
'@
Set-Content -Path "$dir\config.toml" -Value $tomlContent -Force
Remove-Item -Path "$dir\offline_queue.json" -Force -ErrorAction SilentlyContinue

Write-Host "Starting InfraPilot Agent..." -ForegroundColor Cyan
Start-Service InfraPilotAgent
Write-Host "SUCCESS: Connected this machine (SSA) to central dashboard at http://192.168.1.2:8080!" -ForegroundColor Green
