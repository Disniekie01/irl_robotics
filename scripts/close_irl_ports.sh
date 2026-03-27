#!/usr/bin/env bash
# Close all irl_robotics server ports (80 and 8020-8039) by killing listening processes.
# Run on the machine where irl_robotics is running (e.g. SSH server).
# Usage: bash scripts/close_phospho_ports.sh

set -e

PORTS="80 8020 8021 8022 8023 8024 8025 8026 8027 8028 8029 8030 8031 8032 8033 8034 8035 8036 8037 8038 8039"
KILLED=""

for port in $PORTS; do
  # Get PIDs listening on this port (optional: only python/uvicorn to avoid killing nginx etc.)
  pids=$(lsof -t -i ":$port" 2>/dev/null || true)
  for pid in $pids; do
    [ -z "$pid" ] && continue
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || true)
    # Kill python/uvicorn (irl_robotics server); optionally skip others
    if echo "$cmd" | grep -qE "python|uvicorn"; then
      echo "Killing PID $pid ($cmd) on port $port"
      kill "$pid" 2>/dev/null || true
      KILLED="$KILLED $pid"
    fi
  done
done

# If no python found, kill any process on irl_robotics ports (user asked to close irl_robotics ports)
if [ -z "$KILLED" ]; then
  for port in $PORTS; do
    pids=$(lsof -t -i ":$port" 2>/dev/null || true)
    for pid in $pids; do
      [ -z "$pid" ] && continue
      echo "Killing PID $pid on port $port"
      kill "$pid" 2>/dev/null || true
      KILLED="$KILLED $pid"
    done
  done
fi

if [ -z "$KILLED" ]; then
  echo "No processes found listening on irl_robotics ports (80, 8020-8039)."
else
  echo "Done. Sent SIGTERM to:$KILLED"
fi
