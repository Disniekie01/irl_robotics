#!/usr/bin/env bash
# Build the small Go2 follower API tarball that gets copied to the robot.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$REPO_ROOT/robot_install}"
PACKAGE_NAME="go2_follower_server"
OUT_TAR="$OUT_DIR/${PACKAGE_NAME}.tar.gz"
STAGE="$(mktemp -d /tmp/go2_follower_stage.XXXXXX)"
PKG="$STAGE/$PACKAGE_NAME"

cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

mkdir -p \
  "$PKG/src/scripts" \
  "$PKG/src/irl_robotics/irl_robotics/hardware/motors" \
  "$PKG/src/irl_robotics/resources/default" \
  "$OUT_DIR"

cp "$REPO_ROOT/scripts/install_go2_follower_from_tar.sh" "$PKG/install_go2_follower.sh"
cp "$REPO_ROOT/scripts/go2_follower_requirements.txt" "$PKG/go2_follower_requirements.txt"
cp "$REPO_ROOT/scripts/minimal_so100_follower_server.py" "$PKG/src/scripts/minimal_so100_follower_server.py"

cp "$REPO_ROOT/irl_robotics/irl_robotics/__init__.py" "$PKG/src/irl_robotics/irl_robotics/__init__.py"
cp "$REPO_ROOT/irl_robotics/irl_robotics/hardware/__init__.py" "$PKG/src/irl_robotics/irl_robotics/hardware/__init__.py"
cp "$REPO_ROOT/irl_robotics/irl_robotics/hardware/motors/__init__.py" "$PKG/src/irl_robotics/irl_robotics/hardware/motors/__init__.py"
cp "$REPO_ROOT/irl_robotics/irl_robotics/hardware/motors/feetech.py" "$PKG/src/irl_robotics/irl_robotics/hardware/motors/feetech.py"
cp "$REPO_ROOT/irl_robotics/irl_robotics/hardware/motors/motor_utils.py" "$PKG/src/irl_robotics/irl_robotics/hardware/motors/motor_utils.py"
cp "$REPO_ROOT/irl_robotics/resources/default/so-100-12V.json" "$PKG/src/irl_robotics/resources/default/so-100-12V.json"

chmod +x "$PKG/install_go2_follower.sh"

tar -czf "$OUT_TAR" -C "$STAGE" "$PACKAGE_NAME"

echo "Created: $OUT_TAR"
echo ""
echo "Copy to robot:"
echo "  scp $OUT_TAR unitree@10.105.9.173:/tmp/"
echo ""
echo "Install on robot:"
echo "  sudo mkdir -p /opt/irl"
echo "  sudo tar -xzf /tmp/$(basename "$OUT_TAR") -C /opt/irl"
echo "  bash /opt/irl/$PACKAGE_NAME/install_go2_follower.sh"
