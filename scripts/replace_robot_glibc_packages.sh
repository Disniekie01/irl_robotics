#!/usr/bin/env bash
# Run ON THE ROBOT. Replaces site-packages from the u20 venv bundle if GLIBC_2.33 is detected.
set -euo pipefail

APP="/opt/irl/src/irl_robotics"
BUNDLE="${1:-/tmp/irl_robotics_venv_u20_aarch64_20260601.tar.gz}"
VENV_SP="$APP/.venv/lib/python3.10/site-packages"

if [ ! -f "$BUNDLE" ]; then
  echo "Missing bundle: $BUNDLE" >&2
  echo "scp from PC: scp /tmp/irl_robotics_venv_u20_aarch64_20260601.tar.gz unitree@ROBOT:/tmp/" >&2
  exit 1
fi

if strings "$VENV_SP/cryptography/hazmat/bindings/_rust.abi3.so" 2>/dev/null | grep -q GLIBC_2.33; then
  echo "Found incompatible cryptography (GLIBC_2.33). Replacing site-packages from u20 bundle..."
else
  echo "cryptography looks compatible. No replace needed."
  exit 0
fi

rm -rf /tmp/irl_u20_extract
mkdir -p /tmp/irl_u20_extract
tar -xzf "$BUNDLE" -C /tmp/irl_u20_extract \
  src/irl_robotics/.venv/lib/python3.10/site-packages

rm -rf "$VENV_SP"
cp -a /tmp/irl_u20_extract/src/irl_robotics/.venv/lib/python3.10/site-packages "$VENV_SP"
rm -rf /tmp/irl_u20_extract

bash /opt/irl/src/scripts/fix_robot_venv_paths.sh 2>/dev/null || true

echo "Verify:"
strings "$VENV_SP/cryptography/hazmat/bindings/_rust.abi3.so" | grep GLIBC | sort -u
