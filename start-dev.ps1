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
Write-Host "✅ All processes launched in separate terminal windows." -ForegroundColor Green
Write-Host "• Frontend: http://192.168.1.2:5173" -ForegroundColor LightGray
Write-Host "• Backend:  http://192.168.1.2:8080" -ForegroundColor LightGray
