#!/usr/bin/env bash
# ==============================================================================
# InfraPilot Enterprise - Agent Complete Uninstaller Script
# Stops, disables, and removes the InfraPilot Agent daemon and all local data.
# ==============================================================================
set -euo pipefail

SERVICE_NAME="infrapilot-agent"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/infrapilot"
LOG_DIR="/var/log/infrapilot"
STATE_DIR="/var/lib/infrapilot"
SUDOERS_FILE="/etc/sudoers.d/infrapilot"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_USER="infrapilot"

echo "========================================================"
echo "   🛑 InfraPilot Enterprise Agent Uninstaller           "
echo "========================================================"

# Ensure running with root/sudo privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Error: This uninstaller must be run with root/sudo privileges."
    echo "   Usage: sudo ./agent-uninstall.sh"
    exit 1
fi

echo "[1/5] Stopping and disabling InfraPilot background service..."
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
pkill -9 -f "$SERVICE_NAME" 2>/dev/null || true

echo "[2/5] Removing systemd unit definition..."
if [ -f "$SERVICE_FILE" ]; then
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed 2>/dev/null || true
fi

echo "[3/5] Removing agent executable binary..."
rm -f "$INSTALL_DIR/$SERVICE_NAME"
rm -f "$INSTALL_DIR/infrapilot-agent-linux-amd64"
rm -f "$INSTALL_DIR/infrapilot-agent-linux-arm64"

echo "[4/5] Removing configuration, tokens, and telemetry caches..."
rm -rf "$CONFIG_DIR"
rm -rf "$LOG_DIR"
rm -rf "$STATE_DIR"
rm -f "$SUDOERS_FILE"

echo "[5/5] Cleaning up system user..."
if id -u "$SERVICE_USER" &>/dev/null; then
    userdel "$SERVICE_USER" 2>/dev/null || true
fi

echo "========================================================"
echo "   ✅ InfraPilot Agent successfully uninstalled!        "
echo "   The machine is cleanly decommissioned.               "
echo "========================================================"
