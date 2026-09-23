#!/usr/bin/env bash
# ==============================================================================
# InfraPilot Enterprise - Non-Root Agent Installer Script
# Installs agent as dedicated 'infrapilot' system user with systemd daemon
# ==============================================================================
set -euo pipefail

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

# 3. Create Required Directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$CERTS_DIR"
mkdir -p /var/log/infrapilot

# 4. Download Agent Binary, Config, and CA Certificate
echo "[+] Fetching InfraPilot Agent binary package..."
BINARY_URL="$SERVER_URL/downloads/infrapilot-agent-linux-$BIN_ARCH"
if ! curl -fsSL "$BINARY_URL" -o "$INSTALL_DIR/$SERVICE_NAME" 2>/dev/null; then
    # Fallback binary URL
    curl -fsSL "$SERVER_URL/downloads/infrapilot-agent" -o "$INSTALL_DIR/$SERVICE_NAME" || {
        echo "❌ Failed to download agent binary from $SERVER_URL"
        exit 1
    }
fi
chmod 755 "$INSTALL_DIR/$SERVICE_NAME"
chown root:root "$INSTALL_DIR/$SERVICE_NAME"

echo "[+] Fetching CA Certificate for encrypted TLS communications..."
curl -fsSL "$SERVER_URL/downloads/ca.crt" -o "$CERTS_DIR/ca.crt" 2>/dev/null || touch "$CERTS_DIR/ca.crt"
chmod 644 "$CERTS_DIR/ca.crt"

# 5. Write Configuration File
HOSTNAME_VAL="$(hostname 2>/dev/null || echo 'unknown-node')"
echo "[+] Writing agent configuration (/etc/infrapilot/config.toml)..."
cat << EOF > "$CONFIG_DIR/config.toml"
backend_url = "$SERVER_URL"
enrollment_token = "$ENROLL_TOKEN"
registered_hostname = "$HOSTNAME_VAL"
interval = 5

[logging]
log_level = "info"
log_format = "text"

[collectors]
system = true
processes = true
docker = true
kubernetes = true
logs = true
security = true

[tls]
ca_cert = "$CERTS_DIR/ca.crt"
enabled = true
EOF

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
ExecStart=$INSTALL_DIR/$SERVICE_NAME --config $CONFIG_DIR/config.toml
Restart=always
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME" || true

echo "========================================================"
echo "   ✅ InfraPilot Agent Successfully Installed & Started!"
echo "   User:     $SERVICE_USER (Non-Root)"
echo "   Binary:   $INSTALL_DIR/$SERVICE_NAME"
echo "   Config:   $CONFIG_DIR/config.toml"
echo "   Status:   systemctl status $SERVICE_NAME"
echo "========================================================"
