# How to run IRL Robotics (IRL Robotics)

This guide explains how to build the dashboard and run the server from the irl_robotics repo.

**New to the terminal?** Use the step-by-step guide with copy-paste commands: [INSTALL_FOR_BEGINNERS.md](INSTALL_FOR_BEGINNERS.md) (clone, install, run, and change servo limits).

## Prerequisites

- **Python 3.9+** (3.10 recommended)
- **uv** – [Install](https://docs.astral.sh/uv/getting-started/installation/) (e.g. `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Node.js and npm** – required to build the dashboard (only if you want the web UI)

On a fresh Ubuntu/Pop!_OS machine you can use the project install script:

```bash
bash install.sh
```

## Repo layout

From the **repo root** (the folder that contains both `dashboard/` and `irl_robotics/`):

```
irl_robotics/                 ← repo root (run make and commands from here)
├── dashboard/               ← frontend source (npm build)
├── irl_robotics/              ← Python package
│   ├── irl_robotics/          ← app code
│   └── resources/
│       └── dist/            ← built dashboard (created by make build_frontend)
├── Makefile
└── HOW_TO_RUN.md
```

## 1. Build the dashboard

The server expects the built frontend at `irl_robotics/resources/dist/`. Build and copy it from the repo root:

```bash
make build_frontend
```

This installs dashboard deps, runs `npm run build`, and copies `dashboard/dist/*` to `irl_robotics/resources/dist/`. You can run `make build_frontend` from any directory; the Makefile uses its own path so the copy target is always correct.

If you see *"The 'dist' directory does not exist"* when starting the server, run `make build_frontend` from the repo root and try again.

## 2. Run the server

All run commands assume you start from the **repo root**.

### Quick run (no telemetry)

```bash
cd irl_robotics && uv run irlrobotics run --port 8020
```

Or with simulation GUI:

```bash
cd irl_robotics && uv run irlrobotics run --simulation=gui --port 8020 --no-telemetry
```

### Using the Makefile

From the repo root:

| Target | Description |
|--------|-------------|
| `make prod_no_telemetry` | Build frontend (if needed) and run server, headless sim, no telemetry |
| `make prod` | Run with telemetry (builds frontend first) |
| `make prod_gui` | Run with simulation GUI |
| `make local` | Run on localhost:8080, GUI, no telemetry |
| `make build_frontend` | Only build and copy the dashboard |

Example:

```bash
make prod_no_telemetry
```

The dashboard is then available at `http://<your-ip>:8020` (or the port you passed with `--port`). Default port is 80 if you don’t pass `--port`.

## 3. Port and host

- **Port:** e.g. `irlrobotics run --port 8020` (default is 80).
- **Host:** default is `0.0.0.0` (all interfaces). For local-only: `--host 127.0.0.1`.

## 4. App data directory (optional)

User data (recordings, config, tokens, calibration) is stored under a “home app” directory. By default it is:

- `~/irl_robotics` (e.g. `/home/ubuntu/irl_robotics` on that machine)

To use a different path (e.g. on a new machine or a custom volume), set:

```bash
export IRL_ROBOTICS_HOME=/path/to/your/irl_robotics-data
cd irl_robotics && uv run irlrobotics run --port 8020
```

Then run the server as usual.

## 5. Isaac Sim relays (SSH / headless)

When running IRL Robotics on an SSH machine and using **Start relays** (or **Start all**) from the dashboard ROS2 page, the relays need only base ROS2 and the `topic_tools` package. You do **not** need to build the `so-arm101-ros2-bridge` workspace for relays to work.

On the SSH machine you need ROS2 and the **topic_tools** package. The backend **auto-detects** the installed distro (Jazzy, Humble, etc.) and uses it for relays and teleop.

Quick distro reminder:
- **Jazzy** (usually Ubuntu 24.04): use `ros-jazzy-*` packages and `/opt/ros/jazzy/setup.bash`.
- **Humble** (usually Ubuntu 22.04): use `ros-humble-*` packages and `/opt/ros/humble/setup.bash`.

**Important:** Install topic_tools **before** starting the server, otherwise relays will fail:

```bash
# If you have ROS2 Jazzy (e.g. Ubuntu 24.04):
sudo apt install -y ros-jazzy-topic-tools

# If you have ROS2 Humble (e.g. Ubuntu 22.04):
sudo apt install -y ros-humble-topic-tools
```

To force a specific distro (optional): `export ROS_DISTRO=jazzy` (or `humble`) before starting the server.

Then start the server as usual. From the dashboard, use **Start relays** or **Start all**; relay processes use the detected ROS2 install (no workspace required). If Isaac Sim runs on another machine, ensure both use the same ROS2 domain, e.g. `export ROS_DOMAIN_ID=0` on both.

To run the **teleop** node from the dashboard (same on Jazzy or Humble), build the bridge once. From the **irl_robotics repo** (the folder that contains `so-arm101-ros2-bridge` and `irl_robotics/`), e.g. `~/IRL ROBOTICS/irl_robotics`:

```bash
# Jazzy (e.g. Ubuntu 24.04)
source /opt/ros/jazzy/setup.bash
cd ~/IRL\ ROBOTICS/irl_robotics/so-arm101-ros2-bridge && colcon build

# Or from inside the irl_robotics repo:
cd ~/IRL\ ROBOTICS/irl_robotics
source /opt/ros/jazzy/setup.bash && cd so-arm101-ros2-bridge && colcon build

# Humble (e.g. Ubuntu 22.04): use /opt/ros/humble/setup.bash instead
```

**Required:** Install topic_tools **before** starting the server: `sudo apt install -y ros-jazzy-topic-tools` (or `ros-humble-topic-tools`). Without it, relays will fail immediately.

The server auto-detects the workspace next to the irl_robotics package; to use a different path set `export ROS2_BRIDGE_PATH=/path/to/so-arm101-ros2-bridge` before starting.

## 6. Go2 dog demo workflow

The `DOGUPDATES` demo setup supports a local SO-100 leader arm controlling a dog-mounted SO-100 follower arm, plus Go2 camera/marker localization and Position A/B movement presets.

### Start the host backend

From the repo root:

```bash
make build_frontend
cd irl_robotics
export UV_PROJECT_ENVIRONMENT="$HOME/.cache/irl-host-venv"
uv run --python 3.10 irlrobotics run --simulation=headless --port 8020 --no-telemetry
```

Open the dashboard at:

```text
http://<host-ip>:8020/demo
```

### Demo page setup

1. Open **Demo** in the sidebar.
2. Save dog SSH credentials:
   - Dog IP, for example `10.105.9.173`
   - SSH user, for example `unitree`
   - Follower API port, usually `8020`
3. Click **Start dog follower server (SSH)**.
4. Click **Connect remote follower**.
5. Connect the Go2 from the dashboard robot connection flow.
6. Click **Start full demo**.

The leader-follower loop uses relative start, so the dog-mounted follower does not jump to calibration zero when teleop starts.

### Dog follower server

The dog follower API runs:

```text
/opt/irl/.venv/bin/python /opt/irl/src/scripts/minimal_so100_follower_server.py --host 0.0.0.0 --port 8020
```

The Demo page can start it over SSH. If you update `scripts/minimal_so100_follower_server.py`, copy the script to:

```text
/opt/irl/src/scripts/minimal_so100_follower_server.py
```

Then restart the follower API from the Demo page.

### Go2 camera feed and marker localization

The Demo page shows the Go2 WebRTC camera feed through:

```text
/demo/go2-video
```

Marker detection uses OpenCV ArUco dictionary **4x4_50** through:

```text
/demo/go2-marker-detect
```

Configure markers in **Admin > GO2 setup**:

| Setting | Description |
|---------|-------------|
| Enable marker localization | Turns on marker-based setup for Go2 presets |
| Camera ID | Local fallback camera ID; Go2 video is used on the Demo page |
| Marker size (m) | Measured printed marker side length |
| Position A marker ID | Default `10` |
| Position B marker ID | Default `11` |
| X/Y/Yaw | Stored target pose metadata for each marker |

Print/place ArUco markers with matching IDs. The Demo camera panel lists detected marker IDs, pixel centers, estimated distance, and yaw.

### Position presets

| Button | Behavior |
|--------|----------|
| Position A | Drives forward about 2 m using Go2 feedback |
| Position B | Turns about 180 degrees, drives forward about 2 m, then turns back |

These presets use Go2 position/yaw feedback. If feedback is unavailable, the backend refuses to run the preset instead of moving blind.

### After a backend restart

Reconnect Go2 in the dashboard after restarting the backend. The Go2 WebRTC camera stream and marker detection are attached to the live Go2 connection.

## 7. Troubleshooting

| Issue | What to do |
|-------|------------|
| `FileNotFoundError: The 'dist' directory does not exist` | From repo root run `make build_frontend`. Ensure Node/npm are installed. |
| `Failed to spawn: irlrobotics` | Run from inside the `irl_robotics` package dir: `cd irl_robotics && uv run irlrobotics run ...` (from repo root: `irl_robotics` is the inner package that has `pyproject.toml`). |
| Serial/robot not found | Check USB/serial connections and that your user is in the `dialout` group: `sudo usermod -aG dialout $USER` (then log out and back in). |
| Isaac Sim relays not starting | On the machine running Phospho, install ROS2 (Jazzy or Humble) and the matching `topic-tools` package (`ros-jazzy-topic-tools` or `ros-humble-topic-tools`). Relays do not require the bridge workspace. If Isaac is on another host, set the same `ROS_DOMAIN_ID` on both. |
| Demo camera is blank | Reconnect Go2 after backend restart, then hard refresh the Demo page. |
| Marker detector shows no markers | Check that the printed ArUco IDs match Admin > GO2 setup and that marker size is correct. |
| Position B spins too far | Rebuild/restart the latest branch; the safer turn controller accumulates yaw deltas and uses a small turn command. |

## 8. One-liner from repo root

Build frontend and run on port 8020 with no telemetry:

```bash
make build_frontend && cd irl_robotics && uv run irlrobotics run --port 8020 --no-telemetry
```

Or use the combined Make target:

```bash
make prod_no_telemetry
```
