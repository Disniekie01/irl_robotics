#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${HOME}/.cache/irl-robotics"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/launcher.log"
exec >>"${LOG_FILE}" 2>&1

CONFIG_FILE="${HOME}/.config/irl-robotics-launcher.env"
if [[ -f "${CONFIG_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
fi

PORT="${IRL_PORT:-8020}"
PYTHON_VERSION="${IRL_PYTHON_VERSION:-3.10}"
IRL_ROBOTICS_HOME="${IRL_ROBOTICS_HOME:-${HOME}/irl_robotics-data}"
ISAAC_SIM_ROOT="${ISAAC_SIM_ROOT:-${HOME}/isaacsim}"

mkdir -p "${IRL_ROBOTICS_HOME}"

notify() {
  local message="$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "IRL Robotics Launcher" "${message}" || true
  fi
}

open_in_terminal() {
  local title="$1"
  local command="$2"

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="${title}" -- bash -lc "${command}; exec bash"
  elif command -v konsole >/dev/null 2>&1; then
    konsole --new-tab -p tabtitle="${title}" -e bash -lc "${command}; exec bash"
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --title="${title}" --command="bash -lc '${command}; exec bash'"
  elif command -v xterm >/dev/null 2>&1; then
    xterm -T "${title}" -e bash -lc "${command}; exec bash" &
  else
    return 1
  fi
}

echo "[IRL Launcher] Starting backend..."
notify "Starting backend and dashboard..."
BACKEND_CMD="cd \"${REPO_ROOT}/irl_robotics\" && export IRL_ROBOTICS_HOME=\"${IRL_ROBOTICS_HOME}\" && uv run --python ${PYTHON_VERSION} irlrobotics run --simulation=headless --port ${PORT} --no-telemetry"
if ! open_in_terminal "IRL Robotics Server" "${BACKEND_CMD}"; then
  nohup bash -lc "${BACKEND_CMD}" >"${HOME}/irl_robotics_server.log" 2>&1 &
  echo "[IRL Launcher] No GUI terminal found. Server logs: ${HOME}/irl_robotics_server.log"
fi

echo "[IRL Launcher] Opening dashboard in browser..."
if command -v xdg-open >/dev/null 2>&1; then
  nohup bash -lc "sleep 4; xdg-open \"http://127.0.0.1:${PORT}/\"" >/dev/null 2>&1 &
else
  echo "[IRL Launcher] xdg-open not found; open http://127.0.0.1:${PORT}/ manually."
fi

echo "[IRL Launcher] Starting Isaac Sim..."
ISAAC_EXE=""
# Prefer selector first so users can choose versions.
for candidate in "isaac-sim.selector.sh" "isaac-sim.sh" "isaac-sim"; do
  if [[ -x "${ISAAC_SIM_ROOT}/${candidate}" ]]; then
    ISAAC_EXE="${ISAAC_SIM_ROOT}/${candidate}"
    break
  fi
done

if [[ -n "${ISAAC_EXE}" ]]; then
  ISAAC_CMD="cd \"${ISAAC_SIM_ROOT}\" && \"${ISAAC_EXE}\""
  if ! open_in_terminal "Isaac Sim" "${ISAAC_CMD}"; then
    nohup bash -lc "${ISAAC_CMD}" >"${HOME}/isaac_sim.log" 2>&1 &
    echo "[IRL Launcher] No GUI terminal found. Isaac logs: ${HOME}/isaac_sim.log"
  fi
else
  echo "[IRL Launcher] Isaac executable not found in: ${ISAAC_SIM_ROOT}"
  echo "[IRL Launcher] Set ISAAC_SIM_ROOT in ${CONFIG_FILE} and rerun."
  notify "Backend started. Isaac path is missing."
fi

echo "[IRL Launcher] Done."
notify "Launch complete. See ${LOG_FILE} for details."
