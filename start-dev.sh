#!/usr/bin/env bash
# InfraPilot Enterprise Native Dev Launcher (No Docker Required)

echo "========================================="
echo "🚀 InfraPilot Enterprise Native Launcher"
echo "========================================="
echo "Starting services natively..."
echo ""

ROOT_DIR="$(pwd)"

echo "[1/3] Starting Backend API (Go)..."
(cd "$ROOT_DIR/backend" && go run cmd/server/main.go) &

echo "[2/3] Starting Frontend UI (Node/Vite)..."
(cd "$ROOT_DIR/frontend" && npm run dev) &

echo "[3/3] Starting InfraPilot Agent (Go)..."
(cd "$ROOT_DIR/agent" && go run cmd/agent/main.go) &

echo ""
echo "✅ All processes launched in background."
echo "• Frontend: http://192.168.1.2:5173"
echo "• Backend:  http://192.168.1.2:8080"
echo ""
echo "Press Ctrl+C to stop all services."
wait
