param(
    [string]$ServerURL = ""
)

if (-not $ServerURL) {
    if (Test-Path ".\config.toml") {
        $cfgMatch = Select-String -Path ".\config.toml" -Pattern 'backend_url\s*=\s*"([^"]+)"'
        if ($cfgMatch -and $cfgMatch.Matches.Count -gt 0) {
            $ServerURL = $cfgMatch.Matches[0].Groups[1].Value
        }
    } elseif (Test-Path "..\config.toml") {
        $cfgMatch = Select-String -Path "..\config.toml" -Pattern 'backend_url\s*=\s*"([^"]+)"'
        if ($cfgMatch -and $cfgMatch.Matches.Count -gt 0) {
            $ServerURL = $cfgMatch.Matches[0].Groups[1].Value
        }
    }
}
if (-not $ServerURL) {
    $ServerURL = "http://localhost:8080"
}

# Requires administrator privileges to update C:\Program Files\InfraPilot
Write-Host "Stopping InfraPilot Agent..." -ForegroundColor Cyan
Stop-Service -Name "infrapilot-agent", "InfraPilotAgent" -Force -ErrorAction SilentlyContinue

$dir = "C:\Program Files\InfraPilot"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# Sync authoritative config.toml
$sourceConfig = ""
if (Test-Path ".\config.toml") {
    $sourceConfig = ".\config.toml"
} elseif (Test-Path "..\config.toml") {
    $sourceConfig = "..\config.toml"
}

if ($sourceConfig -ne "") {
    Copy-Item $sourceConfig "$dir\config.toml" -Force
    $cfgRaw = Get-Content -Path "$dir\config.toml" -Raw
    $cfgRaw = $cfgRaw -replace 'backend_url\s*=\s*"[^"]*"', "backend_url = `"$ServerURL`""
    Set-Content -Path "$dir\config.toml" -Value $cfgRaw -Encoding UTF8
    Write-Host "[+] Synced config.toml from repository to $dir" -ForegroundColor Green
}

# Clean stale cached identity to trigger fresh re-enrollment
Remove-Item -Path "$dir\config.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$dir\offline_queue.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:ProgramData\InfraPilot\offline_queue.json" -Force -ErrorAction SilentlyContinue

Write-Host "Starting InfraPilot Agent..." -ForegroundColor Cyan
Start-Service -Name "infrapilot-agent"
Write-Host "SUCCESS: Connected this machine (SSA) to central dashboard at $ServerURL!" -ForegroundColor Green
Write-Host "[+] View Live Logs: Get-Content `"$env:ProgramData\InfraPilot\logs\agent.log`" -Wait -Tail 30" -ForegroundColor Yellow
