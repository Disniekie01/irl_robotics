#!/usr/bin/env bash
# Run on your CONTROLLER PC (with internet). Builds a tarball for the robot (aarch64).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/tmp/irl_robotics_offline_bundle}"
ARCH="${ROBOT_ARCH:-aarch64}"
UV_VERSION="${UV_VERSION:-0.6.14}"

mkdir -p "$OUT_DIR/bin" "$OUT_DIR/src"

echo "Downloading uv for ${ARCH}..."
case "$ARCH" in
  aarch64|arm64)
    UV_URL="https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-unknown-linux-gnu.tar.gz"
    ;;
  x86_64|amd64)
    UV_URL="https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz"
    ;;
  *)
    echo "Unsupported ROBOT_ARCH=$ARCH" >&2
    exit 1
    ;;
esac

UV_TGZ="$(mktemp /tmp/uv-XXXXXX.tar.gz)"
curl -fsSL "$UV_URL" -o "$UV_TGZ"
tar -xzf "$UV_TGZ" -C "$OUT_DIR/bin" --strip-components=1
rm -f "$UV_TGZ"
chmod +x "$OUT_DIR/bin/uv" "$OUT_DIR/bin/uvx" 2>/dev/null || true
if [ ! -x "$OUT_DIR/bin/uv" ]; then
  echo "uv binary missing after extract in $OUT_DIR/bin" >&2
  ls -la "$OUT_DIR/bin" >&2
  exit 1
fi

echo "Copying source (no node_modules / .venv)..."
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dashboard/node_modules' \
  --exclude 'irl_robotics/.venv' \
  --exclude '**/__pycache__' \
  "$REPO_ROOT/" "$OUT_DIR/src/"

# Pre-build dashboard on controller so robot does not need npm
if [ -d "$REPO_ROOT/dashboard/dist" ]; then
  mkdir -p "$OUT_DIR/src/irl_robotics/irl_robotics/resources/dist"
  rsync -a "$REPO_ROOT/dashboard/dist/" "$OUT_DIR/src/irl_robotics/irl_robotics/resources/dist/"
else
  echo "WARNING: dashboard/dist missing. Run: cd dashboard && npm run build"
fi

echo "Downloading Python wheels for aarch64 (Docker; may take 10–20 min)..."
if command -v docker >/dev/null 2>&1; then
  mkdir -p "$OUT_DIR/wheels"
  docker run --rm --platform linux/arm64 \
    -v "$OUT_DIR/src/irl_robotics:/app" \
    -v "$OUT_DIR/wheels:/wheels" \
    -w /app \
    python:3.10-slim-bookworm \
    bash -c '
      pip install -q uv
      uv export --no-hashes --no-dev -o /tmp/req.txt 2>/dev/null || pip freeze > /tmp/req.txt
      pip download -r /tmp/req.txt -d /wheels || pip download . -d /wheels
    ' || echo "Wheel download failed; robot may need brief internet for uv sync"
else
  echo "Docker not found — skip wheels. Robot will need internet OR you install deps manually."
fi

TARBALL="/tmp/irl_robotics_offline_$(date +%Y%m%d).tar.gz"
tar -czf "$TARBALL" -C "$OUT_DIR" .
echo ""
echo "Created: $TARBALL"
echo "Copy to robot:"
echo "  scp $TARBALL unitree@10.105.9.173:/tmp/"
echo "On robot:"
echo "  sudo mkdir -p /opt/irl && sudo tar -xzf /tmp/$(basename $TARBALL) -C /opt/irl"
echo "  bash /opt/irl/src/scripts/setup_follower_server_offline.sh"
