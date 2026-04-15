# IRL Robotics

Control robot arms with leader-follower teleoperation, record datasets, run simulation, and play back episodes.

This README is the main Linux install and run guide.

## What Is In This Repo

- `dashboard/`: web dashboard (React/Vite)
- `irl_robotics/`: Python backend package
- `so-arm101-ros2-bridge/`: ROS2 bridge workspace for teleop
- `vr-client/`: WebXR/VR teleop client assets
- `install.sh`: one-shot bootstrap installer
- `scripts/create_linux_one_click_app.sh`: creates desktop/app-menu launcher
- `scripts/run_linux_one_click.sh`: launches backend + browser + Isaac Sim

## Supported Robots

- SO-100 / SO-101
- Koch v1.1
- WX-250 (Trossen Robotics)
- Unitree Go2
- AgileX Piper (Linux)
- LeKiwi mobile base

## Quick Install (Ubuntu/Pop!_OS)

From a fresh terminal:

```bash
cd ~
git clone --recurse-submodules https://github.com/Disniekie01/irl_robotics.git
cd irl_robotics
bash install.sh
```

What `install.sh` does:

- installs required system dependencies (when `sudo` is available)
- installs `uv` and Node (via `nvm`) if missing
- installs Python dependencies
- builds dashboard assets into `irl_robotics/resources/dist/`
- optionally builds ROS2 bridge tooling when ROS2 is present

## First Run (Manual)

Start the backend on port `8020`:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 irlrobotics run --simulation=headless --port 8020 --no-telemetry
```

Then open:

- `http://127.0.0.1:8020/` (dashboard)
- `http://127.0.0.1:8020/docs` (API docs)

For real hardware, remove `--simulation=headless` (or use your preferred run flags).

## One-Click Linux App (Desktop + App Menu)

Create a clickable launcher for desktop and app menu:

```bash
cd ~/irl_robotics
bash scripts/create_linux_one_click_app.sh
```

This creates:

- `~/.local/share/applications/irl-robotics-launcher.desktop`
- `~/Desktop/IRL-Robotics.desktop` (if your Desktop folder exists)
- `~/.config/irl-robotics-launcher.env` (per-user config)

Set your Isaac Sim install path in:

```bash
~/.config/irl-robotics-launcher.env
```

Required setting:

```bash
ISAAC_SIM_ROOT="/path/to/folder/that/contains/isaac-sim.selector.sh"
```

The launcher will then:

- start IRL Robotics backend
- open your browser to the dashboard
- start Isaac Sim (prefers `isaac-sim.selector.sh`, then fallback executables)

If clicking the icon does nothing, check:

```bash
~/.cache/irl-robotics/launcher.log
```

## Simulation-Only (No Hardware)

```bash
cd ~/irl_robotics
make sim
```

Alternative direct command:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 irlrobotics run --simulation=headless --only-simulation --simulate-cameras --port 8020 --no-telemetry
```

## ROS2 / Isaac Sim Notes (Optional)

If you use ROS2 Bridge features from the dashboard:

```bash
sudo apt update
sudo apt install -y ros-jazzy-topic-tools
```

Build teleop bridge workspace (Jazzy example):

```bash
cd ~/irl_robotics/so-arm101-ros2-bridge
source /opt/ros/jazzy/setup.bash
colcon build
```

If using Humble, source `/opt/ros/humble/setup.bash` instead.

## Troubleshooting

- `Failed to spawn: irlrobotics`: run command from `~/irl_robotics/irl_robotics` (inner folder with `pyproject.toml`).
- `dist directory does not exist`: run `make build_frontend` from repo root.
- USB permission errors: `sudo usermod -aG dialout $USER`, re-login, then retry.
- Immediate permission errors for data/config paths: set `IRL_ROBOTICS_HOME="$HOME/irl_robotics-data"` and create it.
- Desktop icon not launching: right-click icon and allow launching/trust it, then re-run the launcher creation script.

## More Detailed Guides

- Beginner step-by-step: `INSTALL_FOR_BEGINNERS.md`
- Runtime and operations guide: `HOW_TO_RUN.md`

## License

MIT - see `LICENSE`.
