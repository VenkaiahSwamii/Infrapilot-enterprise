# InfraPilot Enterprise v1.0 Production Windows Installer Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   🚀 Installing InfraPilot Enterprise v1.0 Platform    " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Docker Desktop for Windows is required. Please install Docker." -ForegroundColor Red
    Exit 1
}

Write-Host "[+] Launching InfraPilot Enterprise production stack..." -ForegroundColor Green
docker compose up -d

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   ✅ InfraPilot Enterprise v1.0 Successfully Deployed! " -ForegroundColor Green
Write-Host "   Web Dashboard:  http://localhost:5173                 " -ForegroundColor Yellow
Write-Host "   API Endpoint:   http://localhost:8080/api/v1/health   " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
