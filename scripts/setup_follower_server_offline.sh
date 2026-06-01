#!/usr/bin/env bash
# Run ON THE ROBOT after extracting offline bundle to /opt/irl (or set BUNDLE_ROOT).
set -euo pipefail

BUNDLE_ROOT="${BUNDLE_ROOT:-/opt/irl}"
SRC="$BUNDLE_ROOT/src"
PORT="${IRL_PORT:-8020}"
PY="${PYTHON_VERSION:-3.10}"

export PATH="$BUNDLE_ROOT/bin:$HOME/.local/bin:$PATH"
export UV_PYTHON_DOWNLOADS=never

if [ ! -x "$BUNDLE_ROOT/bin/uv" ]; then
  echo "Missing $BUNDLE_ROOT/bin/uv — extract offline bundle first." >&2
  exit 1
fi

echo "Robot time: $(date -Is)"
if [ "$(date +%Y)" -lt 2025 ] 2>/dev/null; then
  echo "WARNING: System clock looks wrong. PyPI/HTTPS will fail until fixed:"
  echo "  sudo timedatectl set-ntp true"
  echo "  # or: sudo date -s '2026-06-01 13:30:00'"
fi

if ! groups "$USER" | grep -q dialout; then
  echo "Add dialout (needs sudo once): sudo usermod -aG dialout $USER"
fi

cd "$SRC/irl_robotics"

if [ -f .venv/bin/python ] && .venv/bin/python -c "import fastapi" 2>/dev/null; then
  echo "Using existing .venv (skip sync)."
elif [ -d "$BUNDLE_ROOT/wheels" ] && [ "$(ls -A "$BUNDLE_ROOT/wheels" 2>/dev/null)" ]; then
  echo "Installing from offline wheels..."
  uv sync --no-dev --python "$PY" --offline --find-links "$BUNDLE_ROOT/wheels" || \
  uv sync --no-dev --python 3.9 --offline --find-links "$BUNDLE_ROOT/wheels" || \
  uv sync --no-dev --python 3.8 --offline --find-links "$BUNDLE_ROOT/wheels"
else
  if ! getent hosts pypi.org >/dev/null 2>&1; then
    echo "No DNS for pypi.org. On robot run once:"
    echo "  echo 'nameserver 8.8.8.8' | sudo tee /etc/resolv.conf"
    echo "Or on controller build venv: ./scripts/build_robot_venv_bundle.sh && scp tarball to robot."
    exit 1
  fi
  echo "Installing deps from PyPI (--no-dev, may take 15+ min on ARM)..."
  uv sync --no-dev --python "$PY" || uv sync --no-dev --python 3.9 || uv sync --no-dev --python 3.8
fi

RUN_SCRIPT="$HOME/start_irl_follower_server.sh"
cat > "$RUN_SCRIPT" <<EOF
#!/usr/bin/env bash
export PATH="$BUNDLE_ROOT/bin:\$HOME/.local/bin:\$PATH"
cd "$SRC/irl_robotics"
exec uv run --no-sync irlrobotics run --host 0.0.0.0 --port $PORT --simulation=headless --no-telemetry
EOF
chmod +x "$RUN_SCRIPT"

echo "Done. Start server: $RUN_SCRIPT"
echo "Test: curl http://127.0.0.1:$PORT/status"
