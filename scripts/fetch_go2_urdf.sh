#!/usr/bin/env bash
# Download Unitree Go2 URDF + meshes into dashboard/public for the Demo 3D view.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${REPO_ROOT}/dashboard/public/urdf/go2_description"
TMP="${TMPDIR:-/tmp}/unitree_ros_go2_$$"

if [ -d "${DEST}/urdf/go2_description.urdf" ] || [ -f "${DEST}/urdf/go2_description.urdf" ]; then
  echo "Go2 URDF already present at ${DEST}"
else
  echo "Cloning unitree_ros (shallow)…"
  git clone --depth 1 https://github.com/unitreerobotics/unitree_ros.git "${TMP}"
  mkdir -p "$(dirname "${DEST}")"
  rm -rf "${DEST}"
  cp -a "${TMP}/robots/go2_description" "${DEST}"
  rm -rf "${TMP}"
fi

echo "Rewriting mesh paths for static hosting…"
sed -i 's|package://go2_description/dae/|/urdf/go2_description/dae/|g' \
  "${DEST}/urdf/go2_description.urdf"

echo "Done: ${DEST}"
