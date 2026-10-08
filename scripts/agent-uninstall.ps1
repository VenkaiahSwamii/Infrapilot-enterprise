# ==============================================================================
# InfraPilot Enterprise - Windows Agent Service Uninstaller Script
# Stops, removes the service, and cleans up local installation files.
# ==============================================================================
param()

$ErrorActionPreference = "SilentlyContinue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   🛑 InfraPilot Enterprise Windows Agent Uninstaller   " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$ServiceName = "infrapilot-agent"
$LegacyServiceName = "InfraPilotAgent"
$InstallDir = "$env:ProgramFiles\InfraPilot"

Write-Host "[1/3] Stopping InfraPilot Agent service..." -ForegroundColor Yellow
Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
Stop-Service $LegacyServiceName -Force -ErrorAction SilentlyContinue
Stop-Process -Name "infrapilot-agent" -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] Deleting Windows Service registration..." -ForegroundColor Yellow
sc.exe delete $ServiceName | Out-Null
sc.exe delete $LegacyServiceName | Out-Null

Write-Host "[3/3] Removing installed files and configuration..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "========================================================" -ForegroundColor Green
Write-Host "   ✅ InfraPilot Agent successfully uninstalled!        " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
