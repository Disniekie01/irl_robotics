#!/usr/bin/env bash
# Run on CONTROLLER (x86_64 + Docker). Builds aarch64 .venv for Ubuntu 20.04 / glibc 2.31.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_TAR="/tmp/irl_robotics_venv_u20_aarch64_$(date +%Y%m%d).tar.gz"

if ! command -v docker >/dev/null; then
  echo "Docker required." >&2
  exit 1
fi

STAGE="$(mktemp -d /tmp/irl_venv_stage.XXXXXX)"
mkdir -p "$STAGE/opt/irl/src"
rsync -a "$REPO_ROOT/irl_robotics/" "$STAGE/opt/irl/src/irl_robotics/"
rsync -a "$REPO_ROOT/scripts/fix_robot_venv_paths.sh" "$STAGE/opt/irl/src/scripts/"

echo "Building aarch64 venv on Debian bullseye (glibc 2.31, matches Ubuntu 20.04)..."
docker run --rm --platform linux/arm64 \
  -v "$STAGE/opt/irl:/opt/irl" \
  -w /opt/irl/src/irl_robotics \
  python:3.10-bullseye \
  bash -euxo pipefail -c '
    apt-get update -qq
    apt-get install -y -qq build-essential clang cmake libssl-dev git curl pkg-config \
      libportaudio2 portaudio19-dev
    curl -fsSL https://github.com/astral-sh/uv/releases/download/0.6.14/uv-aarch64-unknown-linux-gnu.tar.gz \
      | tar -xz --strip-components=1 -C /usr/local/bin
    export UV_PYTHON_DOWNLOADS=never
    export CC=gcc
    # Follower SO-100: skip heavy / native optional stacks
    sed -i.bak \
      -e "/cyclonedds/d" \
      -e "/go2-webrtc-connect/d" \
      -e "/unitree-webrtc-connect/d" \
      pyproject.toml
    uv sync --no-dev --python 3.10
    mv pyproject.toml.bak pyproject.toml
    mkdir -p /opt/irl/py310
    cp -a /usr/local/bin /usr/local/lib /usr/local/include /opt/irl/py310/
  '

echo "Packing py310 + .venv..."
tar -czf "$OUT_TAR" -C "$STAGE/opt/irl" py310 src/irl_robotics/.venv src/scripts/fix_robot_venv_paths.sh
sudo rm -rf "$STAGE" 2>/dev/null || rm -rf "$STAGE" 2>/dev/null || true
echo ""
echo "Created: $OUT_TAR"
echo "scp $OUT_TAR unitree@10.105.9.173:/tmp/"
echo "On robot:"
echo "  cd /opt/irl/src/irl_robotics && rm -rf .venv"
echo "  sudo tar -xzf /tmp/$(basename "$OUT_TAR") -C /opt/irl"
echo "  bash /opt/irl/src/scripts/fix_robot_venv_paths.sh"
echo "  /opt/irl/src/irl_robotics/.venv/bin/irlrobotics run --host 0.0.0.0 --port 8020 --simulation=headless --no-telemetry"
