#!/usr/bin/env bash
# Portable CPython 3.10 for robot at /opt/irl/cpython (matches prebuilt .venv interpreter path).
set -euo pipefail

OUT_TAR="/tmp/irl_robotics_portable_py310_aarch64_$(date +%Y%m%d).tar.gz"
STAGE="$(mktemp -d /tmp/irl_py310_stage.XXXXXX)"
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20260510/cpython-3.10.20%2B20260510-aarch64-unknown-linux-gnu-install_only.tar.gz"

mkdir -p "$STAGE/opt/irl"
echo "Downloading portable Python 3.10 (aarch64)..."
curl -fsSL "$PY_URL" | tar -xz -C "$STAGE/opt/irl"
mv "$STAGE/opt/irl/python" "$STAGE/opt/irl/cpython"

cat > "$STAGE/opt/irl/install_portable_python.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# Run on robot after: sudo tar -xzf irl_robotics_portable_py310_*.tar.gz -C /
sudo mkdir -p /usr/local/bin
sudo ln -sf /opt/irl/cpython/bin/python3.10 /usr/local/bin/python3.10
/opt/irl/cpython/bin/python3.10 --version
echo "OK. Re-extract venv tarball into /opt/irl/src/irl_robotics, then run:"
echo "  /opt/irl/src/irl_robotics/.venv/bin/irlrobotics run --host 0.0.0.0 --port 8020 --simulation=headless --no-telemetry"
EOF
chmod +x "$STAGE/opt/irl/install_portable_python.sh"

tar -czf "$OUT_TAR" -C "$STAGE" opt
rm -rf "$STAGE"
echo "Created: $OUT_TAR"
echo "scp $OUT_TAR unitree@10.105.9.173:/tmp/"
