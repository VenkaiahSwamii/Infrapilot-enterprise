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
BACKEND_URL="http://localhost:8080"
if [ -f "$ROOT_DIR/config.toml" ]; then
    CFG_BACKEND=$(grep -m 1 'backend_url' "$ROOT_DIR/config.toml" | sed -E 's/.*backend_url\s*=\s*"([^"]+)".*/\1/' || true)
    if [ -n "$CFG_BACKEND" ]; then
        BACKEND_URL="$CFG_BACKEND"
    fi
fi
FRONTEND_HOST=$(echo "$BACKEND_URL" | sed -E 's|https?://([^:/]+).*|\1|')
FRONTEND_URL="http://${FRONTEND_HOST:-localhost}:5173"

echo "✅ All processes launched in background."
echo "• Frontend: $FRONTEND_URL"
echo "• Backend:  $BACKEND_URL"
echo ""
echo "Press Ctrl+C to stop all services."
wait
