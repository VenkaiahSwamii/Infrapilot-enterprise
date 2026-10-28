# InfraPilot Enterprise Native Dev Launcher (No Docker Required)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🚀 InfraPilot Enterprise Native Launcher" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Starting services natively..." -ForegroundColor Green
Write-Host ""

$RootDir = Get-Location

Write-Host "[1/3] Starting Backend API (Go)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\backend'; go run cmd/server/main.go"

Write-Host "[2/3] Starting Frontend UI (Node/Vite)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\frontend'; npm run dev"

Write-Host "[3/3] Starting InfraPilot Agent (Go)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\agent'; go run cmd/agent/main.go"

Write-Host ""
$BackendURL = "http://localhost:8080"
if (Test-Path "$RootDir\config.toml") {
    $cfgMatch = Select-String -Path "$RootDir\config.toml" -Pattern 'backend_url\s*=\s*"([^"]+)"'
    if ($cfgMatch -and $cfgMatch.Matches.Count -gt 0) {
        $BackendURL = $cfgMatch.Matches[0].Groups[1].Value
    }
}
$FrontendURL = "http://localhost:5173"
if ($BackendURL -match "://([^:/]+)") {
    $FrontendURL = "http://" + $Matches[1] + ":5173"
}

Write-Host "✅ All processes launched in separate terminal windows." -ForegroundColor Green
Write-Host "• Frontend: $FrontendURL" -ForegroundColor LightGray
Write-Host "• Backend:  $BackendURL" -ForegroundColor LightGray
