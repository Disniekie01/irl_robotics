#!/usr/bin/env bash
# Run on the Go2 after extracting go2_follower_server.tar.gz.
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${IRL_ROBOT_INSTALL_ROOT:-/opt/irl}"
PORT="${IRL_PORT:-8020}"

if command -v python3.10 >/dev/null 2>&1; then
  PYTHON_BIN="${PYTHON_BIN:-$(command -v python3.10)}"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="${PYTHON_BIN:-$(command -v python3)}"
else
  echo "python3 is required on the robot." >&2
  exit 1
fi

if [ -w "$(dirname "$INSTALL_ROOT")" ] || [ -w "$INSTALL_ROOT" ]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "Installing Go2 follower API to $INSTALL_ROOT"
$SUDO mkdir -p "$INSTALL_ROOT/src"
$SUDO cp -a "$PACKAGE_ROOT/src/." "$INSTALL_ROOT/src/"

$SUDO mkdir -p "$INSTALL_ROOT/.venv"
if [ ! -x "$INSTALL_ROOT/.venv/bin/python" ]; then
  $SUDO "$PYTHON_BIN" -m venv "$INSTALL_ROOT/.venv"
fi

$SUDO "$INSTALL_ROOT/.venv/bin/python" -m pip install --upgrade pip
$SUDO "$INSTALL_ROOT/.venv/bin/python" -m pip install -r "$PACKAGE_ROOT/go2_follower_requirements.txt"

if groups "$USER" | grep -q dialout; then
  echo "$USER is already in dialout."
else
  echo "Adding $USER to dialout for SO-100 serial access."
  $SUDO usermod -aG dialout "$USER" || true
  echo "Log out and back in, or reboot the robot, if serial access fails."
fi

RUN_SCRIPT="$HOME/start_irl_follower_server.sh"
cat > "$RUN_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export SO100_CONFIG="\${SO100_CONFIG:-$INSTALL_ROOT/src/irl_robotics/resources/default/so-100-12V.json}"
exec "$INSTALL_ROOT/.venv/bin/python" \\
  "$INSTALL_ROOT/src/scripts/minimal_so100_follower_server.py" \\
  --host 0.0.0.0 \\
  --port "$PORT"
EOF
chmod +x "$RUN_SCRIPT"

echo ""
echo "Go2 follower API install complete."
echo "Start it with:"
echo "  $RUN_SCRIPT"
echo ""
echo "Check it locally on the robot:"
echo "  curl http://127.0.0.1:$PORT/status"
