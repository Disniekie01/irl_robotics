#!/usr/bin/env bash
set -euo pipefail

# Diagnose SO-100/SO-101 serial motor bus connectivity using setup endpoints.
#
# Usage:
#   bash scripts/diagnose_so100_bus.sh /dev/ttyACM0
#
# Optional env overrides:
#   HOST=127.0.0.1 PORT=8020 ID_FROM=0 ID_TO=20 PASSES=3 bash scripts/diagnose_so100_bus.sh /dev/ttyACM0

SERIAL_PORT="${1:-}"
if [[ -z "${SERIAL_PORT}" ]]; then
  echo "Usage: $0 /dev/ttyACM0"
  exit 1
fi

HOST="${HOST:-127.0.0.1}"
API_PORT="${PORT:-8020}"
BASE_URL="http://${HOST}:${API_PORT}"
ID_FROM="${ID_FROM:-0}"
ID_TO="${ID_TO:-20}"
PASSES="${PASSES:-3}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1"
    exit 1
  }
}

need_cmd curl
need_cmd python3

json_get() {
  local json="$1"
  local expr="$2"
  python3 - <<PY
import json
obj = json.loads('''$json''')
print($expr)
PY
}

scan_id() {
  local motor_id="$1"
  local payload raw body code
  payload="{\"from_id\":${motor_id},\"to_id\":${motor_id}}"
  raw="$(curl -sS -w $'\n%{http_code}' -X POST "${BASE_URL}/setup/scan" \
    -H "Content-Type: application/json" \
    -d "${payload}")"
  body="$(echo "${raw}" | sed '$d')"
  code="$(echo "${raw}" | tail -n1)"

  if [[ "${code}" != "200" ]]; then
    echo "ERROR:${code}:${body}"
    return 1
  fi

  # Endpoint returns found_ids: [] or [motor_id]
  if json_get "${body}" "${motor_id} in obj.get('found_ids', [])" | grep -qi "true"; then
    echo "FOUND"
  else
    echo "MISSING"
  fi
}

echo "=== IRL Robotics Motor Bus Diagnose ==="
echo "API: ${BASE_URL}"
echo "Serial port: ${SERIAL_PORT}"
echo "Passes: ${PASSES}"
echo

echo "[1/6] Check backend health..."
if ! curl -fsS "${BASE_URL}/docs" >/dev/null; then
  echo "[FAIL] Backend not reachable at ${BASE_URL}"
  echo "Start server first, e.g.:"
  echo "  cd ~/irl_robotics/irl_robotics"
  echo "  uv run --python 3.10 irlrobotics run --port ${API_PORT} --no-telemetry"
  exit 2
fi
echo "[OK] Backend reachable."

echo
echo "[2/6] Check local serial device..."
if [[ ! -e "${SERIAL_PORT}" ]]; then
  echo "[FAIL] ${SERIAL_PORT} does not exist."
  echo "Likely: wrong port, USB unplugged, bad USB cable, dead USB adapter."
  exit 3
fi
ls -l "${SERIAL_PORT}" || true
echo "Groups: $(id -nG)"
if ! id -nG | tr ' ' '\n' | grep -q '^dialout$'; then
  echo "[WARN] User is not in dialout group."
  echo "Run: sudo usermod -aG dialout \$USER && log out/in"
fi

echo
echo "[3/6] Connect setup bus..."
CONNECT_PAYLOAD="{\"port\":\"${SERIAL_PORT}\"}"
CONNECT_RAW="$(curl -sS -w $'\n%{http_code}' -X POST "${BASE_URL}/setup/connect" \
  -H "Content-Type: application/json" \
  -d "${CONNECT_PAYLOAD}")"
CONNECT_BODY="$(echo "${CONNECT_RAW}" | sed '$d')"
CONNECT_CODE="$(echo "${CONNECT_RAW}" | tail -n1)"

if [[ "${CONNECT_CODE}" != "200" ]]; then
  echo "[FAIL] /setup/connect failed (HTTP ${CONNECT_CODE})"
  echo "Response: ${CONNECT_BODY}"
  echo
  echo "Likely causes:"
  echo "- Port busy (another process owns it)"
  echo "- Permission denied"
  echo "- Wrong serial device"
  echo "- USB/adapter issue"
  exit 4
fi
echo "[OK] Setup bus connected."

echo
echo "[4/6] Servo-by-servo scan (${ID_FROM}-${ID_TO})..."
declare -A found_count_by_id
declare -A first_state_by_id
declare -A changed_by_id
fingerprints=()

for pass in $(seq 1 "${PASSES}"); do
  echo "  -- Pass ${pass}/${PASSES} --"
  fingerprint=""
  for motor_id in $(seq "${ID_FROM}" "${ID_TO}"); do
    status="$(scan_id "${motor_id}")" || {
      echo "[FAIL] scan failed for ID ${motor_id}: ${status}"
      exit 5
    }

    if [[ "${status}" == "FOUND" ]]; then
      echo "    ID ${motor_id}: FOUND"
      found_count_by_id["${motor_id}"]=$(( ${found_count_by_id["${motor_id}"]:-0} + 1 ))
      token="F"
    else
      echo "    ID ${motor_id}: missing"
      token="M"
    fi

    if [[ -z "${first_state_by_id["${motor_id}"]:-}" ]]; then
      first_state_by_id["${motor_id}"]="${token}"
    elif [[ "${first_state_by_id["${motor_id}"]}" != "${token}" ]]; then
      changed_by_id["${motor_id}"]=1
    fi

    fingerprint="${fingerprint}${token}"
  done
  fingerprints+=("${fingerprint}")
done

found_ids=()
missing_ids=()
first_missing_after_found=""
seen_found=0
prev_found=""

for motor_id in $(seq "${ID_FROM}" "${ID_TO}"); do
  found_passes="${found_count_by_id["${motor_id}"]:-0}"
  if (( found_passes > 0 )); then
    found_ids+=("${motor_id}")
    seen_found=1
    prev_found="${motor_id}"
  else
    missing_ids+=("${motor_id}")
    if [[ "${seen_found}" -eq 1 && -z "${first_missing_after_found}" ]]; then
      first_missing_after_found="${motor_id}"
    fi
  fi
done

FOUND_COUNT="${#found_ids[@]}"
MISSING_COUNT="${#missing_ids[@]}"
FOUND_IDS="[${found_ids[*]:-}]"
changed_ids=()
for motor_id in $(seq "${ID_FROM}" "${ID_TO}"); do
  if [[ "${changed_by_id["${motor_id}"]:-0}" -eq 1 ]]; then
    changed_ids+=("${motor_id}")
  fi
done
CHANGED_COUNT="${#changed_ids[@]}"

unique_fingerprints=0
if (( ${#fingerprints[@]} > 0 )); then
  unique_fingerprints="$(printf "%s\n" "${fingerprints[@]}" | sort -u | wc -l | tr -d ' ')"
fi

echo
echo "[5/6] Diagnosis..."
if [[ "${FOUND_COUNT}" -eq 0 ]]; then
  echo "[RESULT] No motors found."
  echo "Most likely:"
  echo "1) Power issue (motor bus not powered / low voltage)"
  echo "2) Data cable loose/reversed between controller and first motor"
  echo "3) Wrong serial adapter/port"
  echo "4) Permission/busy port issue (if connect intermittently fails)"
  echo
  echo "Quick physical checks:"
  echo "- Power off, reseat all bus/power connectors"
  echo "- Verify PSU and motor/controller LEDs"
  echo "- Try known-good USB cable + different USB port"
  echo "- Test with ONLY one motor connected"
elif [[ "${FOUND_COUNT}" -eq 1 ]]; then
  echo "[RESULT] Single motor found (${FOUND_IDS})."
  echo "Bus communication works; likely chain wiring issue if expecting more motors."
  echo "Check daisy-chain cables after the first responding motor."
else
  echo "[RESULT] Multiple motors found (${FOUND_IDS})."
  if [[ "${MISSING_COUNT}" -eq 0 ]]; then
    echo "Bus comms and power are likely OK."
  else
    echo "Missing IDs detected: [${missing_ids[*]}]"
    echo "If IDs should be contiguous, this points to cable/connector issues near first missing ID."
  fi
fi

echo
echo "[STABILITY]"
echo "- IDs that changed state across passes: ${CHANGED_COUNT}"
if [[ "${CHANGED_COUNT}" -gt 0 ]]; then
  echo "- Flaky IDs: [${changed_ids[*]}]"
fi
echo "- Unique pass patterns: ${unique_fingerprints}/${PASSES}"

if [[ "${CHANGED_COUNT}" -gt 0 || "${unique_fingerprints}" -gt 1 ]]; then
  echo "[LIKELY] Intermittent behavior detected -> more consistent with power/voltage drop or loose/bad contact."
else
  if [[ -n "${first_missing_after_found}" ]]; then
    echo "[LIKELY] Stable break point -> more consistent with cable/connector issue at a specific segment."
  fi
fi

if [[ -n "${first_missing_after_found}" ]]; then
  echo
  echo "[CHAIN HINT] First break appears at ID ${first_missing_after_found}."
  if [[ -n "${prev_found}" ]]; then
    echo "Check cable/connector between ID ${prev_found} and ID ${first_missing_after_found} first."
  fi
fi

echo
echo "[6/6] Cleanup..."
curl -sS -X POST "${BASE_URL}/setup/disconnect" >/dev/null || true
echo "[OK] Done."
