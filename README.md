# IRL Robotics

Control robot arms with leader-follower teleoperation, record datasets, and play back episodes.

This repo contains:
- `dashboard/`: the web dashboard (React/Vite)
- `install.sh`: a bootstrap script that installs dependencies and clones/builds the Python backend into `~/irl_robotics`

The backend (Python FastAPI) is in the separate repo cloned by `install.sh` into `~/irl_robotics`.

## Supported Robots

- SO-100 / SO-101
- Koch v1.1
- WX-250 (Trossen Robotics)
- Unitree Go2
- AgileX Piper (Linux)
- LeKiwi mobile base

## Prerequisites (Ubuntu/Linux)

- Python 3.10+
- Node.js 20+
- `curl`, `git`, `build-essential`
- `uv` (the provided `install.sh` installs it if missing)

Optional:
- `ufw` for firewall checks
- `git-lfs` (recommended if you use Isaac Sim assets / USD files)

## Install (one time)

From this repo root:

```bash
./install.sh
```

What `install.sh` does:
- installs system deps (if `sudo` is available)
- installs `uv` and Node (via `nvm`)
- clones the backend repo into `~/irl_robotics` (unless already present)
- installs Python deps and builds the dashboard into the backend’s `resources/dist/`
- (optional) builds the ROS2 bridge if ROS2 is installed

## Run IRL backend (Terminal 1)

The VR client expects the backend’s teleop APIs on `127.0.0.1:8020`.
So run the backend with an explicit port:

```bash
cd ~/irl_robotics
uv run --python 3.10 irlrobotics run --simulation=headless --port 8020
```

Open the dashboard in a browser:
`http://127.0.0.1:8020/`

Notes:
- For real hardware, start without `--simulation=headless` (or use the simulation flags your setup requires).
- If you want to test teleop without hardware, `--simulation=headless` is the quick way.

If `irlrobotics` complains about serial permissions (USB):

```bash
sudo chmod 666 /dev/ttyACM*
```

If you need a writable home for recordings/config/calibration:

```bash
export IRL_ROBOTICS_HOME="$HOME/irl_robotics-data"
mkdir -p "$IRL_ROBOTICS_HOME"
```

## Simulation-only (no hardware) (optional)

If you want to test the dashboard without connecting robot hardware:

```bash
cd ~/irl_robotics
make sim
```

Alternative (equivalent command from the backend repo):

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 irlrobotics run --simulation=headless --only-simulation --simulate-cameras --port 8020 --no-telemetry
```

Then open:
`http://localhost:8020/`

## Optional: ROS2 bridge (Jazzy) (only if you use Isaac/ROS2 teleop)

If you have ROS2 Jazzy installed and use the dashboard’s ROS2 Bridge page:

```bash
sudo apt update
sudo apt install -y ros-jazzy-topic-tools
```

To build the bridge workspace:
```bash
cd ~/irl_robotics/so-arm101-ros2-bridge
source /opt/ros/jazzy/setup.bash
colcon build
```

Restart the IRL Robotics server afterward.

## Where to look in logs

The backend terminal (the one running `irlrobotics run`) is the primary log source.
If ports fail to bind, the app will print which port it tried and suggests running with `--port <custom>`.

## API Documentation

Backend docs are served by the backend process (typically on `http://127.0.0.1:8020/docs`).

## License

MIT - see `LICENSE` for details.
