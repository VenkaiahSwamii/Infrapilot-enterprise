#!/usr/bin/env bash
# ==============================================================================
# InfraPilot Enterprise - Non-Root Agent Installer Script
# Installs agent as dedicated 'infrapilot' system user with systemd daemon
# ==============================================================================
set -euo pipefail

if [ -z "${SERVER_URL:-}" ]; then
    if [ -f "./config.toml" ]; then
        SERVER_URL=$(grep -m 1 'backend_url' "./config.toml" | sed -E 's/.*backend_url\s*=\s*"([^"]+)".*/\1/' || true)
    elif [ -f "../config.toml" ]; then
        SERVER_URL=$(grep -m 1 'backend_url' "../config.toml" | sed -E 's/.*backend_url\s*=\s*"([^"]+)".*/\1/' || true)
    fi
fi
SERVER_URL="${SERVER_URL:-http://192.168.1.86:8080}"
ENROLL_TOKEN="${ENROLL_TOKEN:-}"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/infrapilot"
CERTS_DIR="/etc/infrapilot/certs"
SERVICE_NAME="infrapilot-agent"
SERVICE_USER="infrapilot"

echo "========================================================"
echo "   🚀 InfraPilot Enterprise Non-Root Agent Installer   "
echo "========================================================"

# Ensure running with root/sudo for single-pass installation
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Error: This installer must be run with root/sudo privileges."
    echo "   Usage: curl -fsSL $SERVER_URL/api/v1/agent/install.sh | sudo bash"
    exit 1
fi

# 1. Architecture Detection
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64|amd64) BIN_ARCH="amd64" ;;
    aarch64|arm64) BIN_ARCH="arm64" ;;
    *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "[+] Target system: Linux ($ARCH)"
echo "[+] Central Dashboard URL: $SERVER_URL"

# 2. Create Dedicated Non-Root System User
if ! id -u "$SERVICE_USER" &>/dev/null; then
    echo "[+] Creating dedicated non-root system user '$SERVICE_USER'..."
    useradd -r -s /usr/sbin/nologin -d /var/lib/infrapilot -c "InfraPilot Agent Daemon" "$SERVICE_USER" || true
fi

# Ensure service user has permissions for journalctl, syslog, and Docker socket
if getent group systemd-journal >/dev/null 2>&1; then
    usermod -aG systemd-journal "$SERVICE_USER" || true
fi
if getent group adm >/dev/null 2>&1; then
    usermod -aG adm "$SERVICE_USER" || true
fi
if getent group docker >/dev/null 2>&1; then
    echo "[+] Adding $SERVICE_USER to 'docker' group for container telemetry..."
    usermod -aG docker "$SERVICE_USER" || true
fi

# 3. Create Required Directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$CERTS_DIR"
mkdir -p /var/log/infrapilot

# Stop existing running service or leftover processes to prevent file locking
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
pkill -9 -f "$SERVICE_NAME" 2>/dev/null || true
rm -f "$CONFIG_DIR/config.json" 2>/dev/null || true

# 4. Download Agent Binary, Config, and CA Certificate
echo "[+] Fetching InfraPilot Agent binary package from $SERVER_URL (30-minute window)..."
BINARY_URL="$SERVER_URL/downloads/infrapilot-agent-linux-$BIN_ARCH"
if ! curl -fSL --connect-timeout 15 --max-time 1800 "$BINARY_URL" -o "$INSTALL_DIR/$SERVICE_NAME"; then
    # Fallback binary URL
    echo "[!] Architecture-specific binary not found, attempting generic binary..."
    curl -fSL --connect-timeout 15 --max-time 1800 "$SERVER_URL/downloads/infrapilot-agent" -o "$INSTALL_DIR/$SERVICE_NAME" || {
        echo "❌ Failed to download agent binary from $SERVER_URL"
        exit 1
    }
fi

if [ ! -s "$INSTALL_DIR/$SERVICE_NAME" ]; then
    echo "❌ Error: Downloaded agent binary at $INSTALL_DIR/$SERVICE_NAME is missing or 0 bytes."
    exit 1
fi
chmod 755 "$INSTALL_DIR/$SERVICE_NAME"
chown root:root "$INSTALL_DIR/$SERVICE_NAME"
echo "[+] Agent binary downloaded and verified successfully ($(wc -c < "$INSTALL_DIR/$SERVICE_NAME" | tr -d ' ') bytes)."

echo "[+] Fetching CA Certificate for encrypted TLS communications..."
curl -fsSL --connect-timeout 10 --max-time 30 "$SERVER_URL/downloads/ca.crt" -o "$CERTS_DIR/ca.crt" 2>/dev/null || touch "$CERTS_DIR/ca.crt"
chmod 644 "$CERTS_DIR/ca.crt"

# 5. Fetch Agent Configuration from Central Server
echo "[+] Fetching configuration from $SERVER_URL/downloads/config.toml..."
DOWNLOADED_CFG=false
if curl -fsSL --connect-timeout 10 --max-time 30 "$SERVER_URL/downloads/config.toml" -o "$CONFIG_DIR/config.toml"; then
    DOWNLOADED_CFG=true
    echo "[+] Configuration successfully downloaded from server."
elif [ -f "./config.toml" ]; then
    echo "[+] Using local config.toml from repository."
    cp "./config.toml" "$CONFIG_DIR/config.toml"
    DOWNLOADED_CFG=true
elif [ -f "../config.toml" ]; then
    cp "../config.toml" "$CONFIG_DIR/config.toml"
    DOWNLOADED_CFG=true
fi

# Ensure backend_url and enrollment_token point to this server
if [ -f "$CONFIG_DIR/config.toml" ]; then
    sed -i "s|backend_url\s*=.*|backend_url = \"$SERVER_URL\"|g" "$CONFIG_DIR/config.toml"
    if [ -n "$ENROLL_TOKEN" ]; then
        sed -i "s|enrollment_token\s*=.*|enrollment_token = \"$ENROLL_TOKEN\"|g" "$CONFIG_DIR/config.toml"
    fi
fi

chmod 640 "$CONFIG_DIR/config.toml"
chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" /var/log/infrapilot

# 6. Configure Targeted Sudoers Policy for Administrative Actions
echo "[+] Provisioning targeted sudoers policy for remote action execution..."
cat << EOF > /etc/sudoers.d/infrapilot
# InfraPilot Agent Authorized Administrative Commands
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/systemctl, /sbin/reboot, /sbin/shutdown, /usr/bin/apt, /usr/bin/yum, /usr/bin/dnf, /usr/bin/docker
EOF
chmod 440 /etc/sudoers.d/infrapilot

# 7. Register and Start Systemd Daemon Service
echo "[+] Registering Systemd background service ($SERVICE_NAME.service)..."
cat << EOF > "/etc/systemd/system/$SERVICE_NAME.service"
[Unit]
Description=InfraPilot Enterprise Agent Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
SupplementaryGroups=docker
ExecStart=$INSTALL_DIR/$SERVICE_NAME --config $CONFIG_DIR/config.toml
Restart=always
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "⚠️ Warning: Service $SERVICE_NAME is not active immediately after restart. Systemd status:"
    systemctl status "$SERVICE_NAME" --no-pager || true
    echo "Recent journal entries:"
    journalctl -u "$SERVICE_NAME" -n 20 --no-pager || true
fi

echo "========================================================"
echo "   ✅ InfraPilot Agent Installation Script Finished"
echo "   User:     $SERVICE_USER (Non-Root)"
echo "   Binary:   $INSTALL_DIR/$SERVICE_NAME"
echo "   Config:   $CONFIG_DIR/config.toml"
echo "   Status:   systemctl status $SERVICE_NAME"
echo "========================================================"
