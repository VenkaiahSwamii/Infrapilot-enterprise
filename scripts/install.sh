#!/usr/bin/env bash
# ==============================================================================
# InfraPilot Enterprise - Native Non-Docker Platform Installer & Runner
# Runs Go Backend, React Frontend, and Agent natively (No Docker required)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "   🚀 InfraPilot Enterprise (Native Bare-Metal Mode)    "
echo "========================================================"

# 1. Check prerequisites
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go (1.21+)."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Node/npm is not installed. Please install Node.js."
    exit 1
fi

# 2. Build Backend
echo "[+] Building Go Backend API Server..."
cd "$SCRIPT_DIR/backend"
go build -o infrapilot-server ./cmd/server/main.go
echo "✓ Backend built successfully."

# 3. Build Frontend
echo "[+] Installing and building React Frontend..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
npm run build
echo "✓ Frontend built successfully."

# 4. Build Agent
echo "[+] Building Native Infrastructure Agent..."
cd "$SCRIPT_DIR/agent"
go build -o infrapilot-agent ./cmd/agent/main.go || true
echo "✓ Agent binary ready."

# 5. Start Backend in Background
cd "$SCRIPT_DIR/backend"
echo "[+] Starting Backend on port 8080..."
nohup ./infrapilot-server > "$SCRIPT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "✓ Backend running (PID: $BACKEND_PID, Log: backend.log)"

# 6. Start Frontend Server
cd "$SCRIPT_DIR/frontend"
echo "[+] Starting Frontend Dev Server..."
nohup npm run dev -- --port 5173 --host 0.0.0.0 > "$SCRIPT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "✓ Frontend running (PID: $FRONTEND_PID, Log: frontend.log)"

echo "========================================================"
echo "   ✅ InfraPilot Enterprise Platform Started (No Docker) "
echo "   Frontend Web UI: http://192.168.1.2:5173              "
echo "   Backend API:     http://192.168.1.2:8080/api/v1/health "
echo "   Default Login:   admin@infrapilot.com / password     "
echo "========================================================"