#!/usr/bin/env bash
# Run ON the robot computer (e.g. unitree@10.105.9.173) with the follower SO-100 USB plugged in.
# Installs a minimal IRL Robotics API server for network leader-follower (no full dashboard build).
set -euo pipefail

REPO_URL="${IRL_REPO_URL:-https://github.com/Disniekie01/irl_robotics.git}"
INSTALL_DIR="${IRL_INSTALL_DIR:-$HOME/irl_robotics}"
PORT="${IRL_PORT:-8020}"
PYTHON_VERSION="${PYTHON_VERSION:-3.10}"

echo "=== IRL follower server setup ==="
echo "Install dir: $INSTALL_DIR"
echo "Port: $PORT"

export PATH="$HOME/.local/bin:$PATH"

if ! command -v git >/dev/null; then
  echo "Installing git..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq git curl build-essential python3-dev libudev-dev v4l-utils
fi

if ! groups "$USER" | grep -q dialout; then
  echo "Adding $USER to dialout for USB serial..."
  sudo usermod -aG dialout "$USER" || true
  echo "NOTE: log out and back in (or reboot) if serial access fails later."
fi

if [ -n "${UV_BIN:-}" ] && [ -x "$UV_BIN" ]; then
  mkdir -p "$HOME/.local/bin"
  cp -f "$UV_BIN" "$HOME/.local/bin/uv"
  chmod +x "$HOME/.local/bin/uv"
fi

if ! command -v uv >/dev/null; then
  if [ "${UV_SKIP_NETWORK_INSTALL:-0}" = "1" ]; then
    echo "uv not found and UV_SKIP_NETWORK_INSTALL=1." >&2
    echo "Copy uv from your PC: scp /tmp/uv-aarch64-unknown-linux-gnu/uv unitree@ROBOT:~/.local/bin/" >&2
    echo "Or run scripts/offline_bundle_for_robot.sh on the controller, then setup_follower_server_offline.sh on the robot." >&2
    exit 1
  fi
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  grep -q '\.local/bin' ~/.bashrc 2>/dev/null || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
fi

if [ ! -f "$INSTALL_DIR/irl_robotics/pyproject.toml" ]; then
  echo "Cloning repository to $INSTALL_DIR..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
else
  echo "Using existing repo at $INSTALL_DIR"
fi

cd "$INSTALL_DIR/irl_robotics"
echo "Installing Python dependencies (this can take several minutes on ARM)..."
uv sync --python "$PYTHON_VERSION"

# Copy pre-built dashboard from sync if present; otherwise skip (API still works)
if [ -d "$INSTALL_DIR/dashboard/dist" ]; then
  mkdir -p irl_robotics/resources/dist
  rsync -a "$INSTALL_DIR/dashboard/dist/" irl_robotics/resources/dist/ 2>/dev/null || \
    cp -r "$INSTALL_DIR/dashboard/dist/"* irl_robotics/resources/dist/ 2>/dev/null || true
fi

RUN_SCRIPT="$HOME/start_irl_follower_server.sh"
cat > "$RUN_SCRIPT" <<EOF
#!/usr/bin/env bash
set -e
export PATH="\$HOME/.local/bin:\$PATH"
cd "$INSTALL_DIR/irl_robotics"
exec uv run --python $PYTHON_VERSION irlrobotics run \\
  --host 0.0.0.0 \\
  --port $PORT \\
  --simulation=headless \\
  --no-telemetry
EOF
chmod +x "$RUN_SCRIPT"

echo ""
echo "=== Setup complete ==="
echo "Start the follower API server:"
echo "  $RUN_SCRIPT"
echo ""
echo "From your controller PC, verify:"
echo "  curl http://$(hostname -I | awk '{print $1}'):$PORT/status"
echo ""
echo "Then on the controller dashboard: Control -> Leader Arm"
echo "  Leader = local arm, Follower = remote entry for this machine IP:$PORT"
