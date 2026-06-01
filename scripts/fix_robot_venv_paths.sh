#!/usr/bin/env bash
# Run ON THE ROBOT after extracting venv bundle to /opt/irl.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/irl/src/irl_robotics}"
PY="${PY:-/opt/irl/py310/bin/python3.10}"

if [ ! -x "$PY" ]; then
  echo "Missing $PY — extract venv bundle with py310/ first." >&2
  exit 1
fi
if [ ! -d "$APP_DIR/.venv" ]; then
  echo "Missing $APP_DIR/.venv" >&2
  exit 1
fi

cd "$APP_DIR"
echo "Fixing .venv for robot paths..."

rm -f .venv/bin/python .venv/bin/python3 .venv/bin/python3.10
ln -sf "$PY" .venv/bin/python3.10
ln -sf python3.10 .venv/bin/python3
ln -sf python3.10 .venv/bin/python

for f in .venv/bin/*; do
  [ -f "$f" ] || continue
  head -1 "$f" 2>/dev/null | grep -q '^#!' || continue
  tail -n +2 "$f" > /tmp/launcher.body
  printf '#!%s\n' "$APP_DIR/.venv/bin/python3" | cat - /tmp/launcher.body > "$f"
  chmod +x "$f"
done

if [ -f .venv/pyvenv.cfg ]; then
  sed -i "s|^home = .*|home = /opt/irl/py310/bin|" .venv/pyvenv.cfg
  sed -i "s|/app|$APP_DIR|g" .venv/pyvenv.cfg
fi

SP="$APP_DIR/.venv/lib/python3.10/site-packages"
if [ -d "$SP" ]; then
  sed -i "s|/app|$APP_DIR|g" "$SP/__editable___irl_robotics_"*_finder.py" 2>/dev/null || true
  sed -i "s|file:///app|file://$APP_DIR|g" "$SP/irl_robotics-"*.dist-info/direct_url.json" 2>/dev/null || true
fi

.venv/bin/python3 -c "import irl_robotics, cryptography; print('OK', irl_robotics.__file__)"
echo "Start: $APP_DIR/.venv/bin/irlrobotics run --host 0.0.0.0 --port 8020 --simulation=headless --no-telemetry"
