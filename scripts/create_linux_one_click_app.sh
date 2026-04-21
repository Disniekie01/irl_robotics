#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RUNNER_SCRIPT="${REPO_ROOT}/scripts/run_linux_one_click.sh"
DESKTOP_FILE="${HOME}/.local/share/applications/irl-robotics-launcher.desktop"
DESKTOP_SHORTCUT="${HOME}/Desktop/IRL-Robotics.desktop"
CONFIG_FILE="${HOME}/.config/irl-robotics-launcher.env"

mkdir -p "${HOME}/.local/share/applications"
mkdir -p "${HOME}/.config"

chmod +x "${RUNNER_SCRIPT}"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  cat >"${CONFIG_FILE}" <<'EOF'
# Optional launcher config overrides
# Set this to the folder that contains isaac-sim.selector.sh / isaac-sim.sh
ISAAC_SIM_ROOT="$HOME/isaacsim"

# Optional overrides:
# IRL_PORT=8020
# IRL_PYTHON_VERSION=3.10
# IRL_ROBOTICS_HOME="$HOME/irl_robotics-data"

# Desktop icon: starts the IRL server + (by default) browser + Isaac Sim.
# The dashboard HTTP ROS2 bridge (teleop + relays) is never started by this launcher; use
# Dashboard → ROS2 Bridge when you need it.
# Set to 0 to only run the backend (no Isaac / no NVIDIA ROS2 bridge from the launcher):
# IRL_LAUNCH_ISAAC_SIM=0
# Set to 0 to skip opening the browser:
# IRL_LAUNCH_BROWSER=0
EOF
  echo "Created config: ${CONFIG_FILE}"
fi

cat >"${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=IRL Robotics (Server + Browser + Isaac)
Comment=Launch IRL Robotics backend, dashboard browser, and Isaac Sim
Exec=${RUNNER_SCRIPT}
Terminal=false
Categories=Development;Science;
StartupNotify=true
EOF

chmod +x "${DESKTOP_FILE}"

if [[ -d "${HOME}/Desktop" ]]; then
  cp "${DESKTOP_FILE}" "${DESKTOP_SHORTCUT}"
  chmod +x "${DESKTOP_SHORTCUT}"
  if command -v gio >/dev/null 2>&1; then
    gio set "${DESKTOP_SHORTCUT}" metadata::trusted true || true
  fi
  echo "Desktop shortcut created: ${DESKTOP_SHORTCUT}"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${HOME}/.local/share/applications" || true
fi

echo "Launcher installed: ${DESKTOP_FILE}"
echo "Run once now with:"
echo "  ${RUNNER_SCRIPT}"
