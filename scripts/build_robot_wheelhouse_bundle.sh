#!/usr/bin/env bash
# Run on CONTROLLER (x86_64 + Docker). Builds a Python 3.9/aarch64 wheelhouse
# the robot can install offline using its own /usr/bin/python3.9.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/tmp/irl_robotics_wheelhouse_aarch64_py39}"
OUT_TAR="/tmp/irl_robotics_wheelhouse_aarch64_py39_$(date +%Y%m%d).tar.gz"

if ! command -v docker >/dev/null; then
  echo "Docker required." >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/wheels"

echo "Building aarch64/Python 3.9 wheelhouse in Docker..."
docker run --rm --platform linux/arm64 \
  -v "$REPO_ROOT/irl_robotics:/src:ro" \
  -v "$OUT_DIR/wheels:/wheels" \
  python:3.9-bullseye \
  bash -euxo pipefail -c '
    apt-get update -qq
    apt-get install -y -qq build-essential cmake git pkg-config libssl-dev \
      libportaudio2 portaudio19-dev \
      libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev \
      libavfilter-dev libswscale-dev libswresample-dev
    cp -a /src /work
    cd /work
    # SO-100 follower does not need these hardware-specific deps.
    sed -i "/cyclonedds/d;/pyrealsense2/d" pyproject.toml
    python -m pip install --upgrade pip setuptools wheel
    python -m pip wheel --wheel-dir /wheels .
  '

cat > "$OUT_DIR/install_on_robot.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/irl/src/irl_robotics}"
PY="${PY:-python3.9}"
cd "$APP_DIR"

rm -rf .venv
"$PY" -m venv .venv
. .venv/bin/activate
python -m pip install --no-index --find-links /opt/irl/wheels irl-robotics

cat > "$HOME/start_irl_follower_server.sh" <<'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/irl/src/irl_robotics
exec .venv/bin/irlrobotics run --host 0.0.0.0 --port 8020 --simulation=headless --no-telemetry
RUNEOF
chmod +x "$HOME/start_irl_follower_server.sh"

echo "Installed. Start with: $HOME/start_irl_follower_server.sh"
EOF
chmod +x "$OUT_DIR/install_on_robot.sh"

tar -czf "$OUT_TAR" -C "$OUT_DIR" .
echo ""
echo "Created: $OUT_TAR"
echo "Copy to robot:"
echo "  scp $OUT_TAR unitree@10.105.9.173:/tmp/"
echo "On robot:"
echo "  sudo mkdir -p /opt/irl/wheels"
echo "  sudo tar -xzf /tmp/$(basename "$OUT_TAR") -C /opt/irl"
echo "  sudo chown -R \"\$USER:\$USER\" /opt/irl"
echo "  bash /opt/irl/install_on_robot.sh"
