export interface DocSection {
  id: string;
  title: string;
  icon?: string;
  content: string;
}

export interface DocCategory {
  id: string;
  label: string;
  sections: DocSection[];
}

export const docs: DocCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    sections: [
      {
        id: "overview",
        title: "Overview",
        content: `
# IRL Robotics Dashboard

IRL Robotics is a unified platform for controlling, recording, training, and deploying robotic arms. It provides a web-based dashboard with real-time control, dataset management, AI training, and 3D visualization.

## Key Features

- **Multi-mode robot control** — keyboard, gamepad, leader arm, sliders, phone, VR, and macros
- **Dataset recording** — record episodes at configurable FPS with multi-camera support
- **AI training** — train SmolVLA and gr00t models locally on your GPU
- **3D visualizer** — real-time URDF-based rendering of the SO-100 arm
- **Macro recorder** — record and replay movement sequences
- **Skill graph editor** — visual node-based workflow builder with conditions, loops, parallel execution, and live progress
- **Simulation mode** — test without hardware using a simulated robot
- **ROS2 bridge** — connect to Isaac Sim with per-joint offset sliders
- **WebXR VR client** — control the robot with hand tracking on Apple Vision Pro or Meta Quest

## System Requirements

- Python 3.10+
- Node.js 18+ (for dashboard development)
- A supported robot: SO-100, Koch v1.1, Piper, WX-250s
- NVIDIA GPU recommended for local AI training
`,
      },
      {
        id: "quickstart",
        title: "Quick Start",
        content: `
# Quick Start

## 1. Install & Run

\`\`\`bash
# Clone the repository
git clone https://github.com/Disniekie01/irl_robotics.git
cd irl_robotics

# Run the server (simulation mode, no hardware needed)
uv run --python 3.10 irl_robotics run --simulation=headless
\`\`\`

The dashboard will be available at **http://localhost:80**.

## 2. Connect a Robot

1. Plug in your robot via USB
2. Open the dashboard and check the **status indicator** in the top-right
3. The robot should appear as connected automatically
4. If not, go to **Admin** > configure the serial port

## 3. First Movement

1. Navigate to **Control Robot** in the sidebar
2. Select the **Keyboard** tab
3. Use arrow keys and \`W/S\` to move joints
4. Use \`Space\` to toggle the gripper

## 4. Record Your First Episode

1. In the Control page, click the **Record** button in the top bar
2. Move the robot through a task
3. Click **Stop** to save the episode
4. Browse recordings in **Datasets**
`,
      },
      {
        id: "configuration",
        title: "Configuration",
        content: `
# Configuration

## Admin Settings

Navigate to **Admin** in the sidebar to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| Dataset Name | Name for recorded datasets | \`my_dataset\` |
| Recording FPS | Capture frequency | \`30\` |
| Episode Format | \`lerobot_v2.1\`, \`lerobot_v2\`, or \`json\` | \`lerobot_v2.1\` |
| Video Codec | Codec for video recordings | \`mp4v\` |
| Video Size | Resolution for recorded video | \`640x480\` |
| Task Instruction | Text description of the task | — |
| Cameras to Record | Select which cameras to include | All |
| HF Private Mode | Keep HuggingFace uploads private | \`false\` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`IRL_ROBOTICS_PORT\` | Server port (default: 80) |
| \`IRL_ROBOTICS_HOST\` | Server host (default: 0.0.0.0) |
| \`HF_TOKEN\` | HuggingFace API token for uploads |
| \`WANDB_API_KEY\` | Weights & Biases key for training logs |

## Command Line Options

\`\`\`bash
uv run irl_robotics run \\
  --port 80 \\
  --simulation=headless \\  # Run with simulated robot
  --no-realsense \\         # Disable RealSense cameras
  --no-can \\               # Disable CAN bus
  --cameras 0,1 \\          # Specify camera indices
  --max-opencv-index 10     # Max camera search index
\`\`\`
`,
      },
    ],
  },
  {
    id: "control",
    label: "Robot Control",
    sections: [
      {
        id: "keyboard",
        title: "Keyboard Control",
        content: `
# Keyboard Control

Use your keyboard to jog individual joints of the robot.

## Controls

| Key | Action |
|-----|--------|
| \`←\` / \`→\` | Move selected joint negative / positive |
| \`↑\` / \`↓\` | Select previous / next joint |
| \`W\` / \`S\` | Alternative joint movement |
| \`Space\` | Toggle gripper open/close |
| \`1-6\` | Select joint directly |

## Tips

- Movement speed scales with how long you hold the key
- The active joint is highlighted in the joint readout
- Works well alongside the 3D Visualizer page for visual feedback
`,
      },
      {
        id: "gamepad",
        title: "Gamepad Control",
        content: `
# Gamepad Control

Connect a standard gamepad (Xbox, PlayStation, or generic) to control the robot with analog sticks.

## Setup

1. Connect a gamepad via USB or Bluetooth
2. Go to **Control Robot** > **Gamepad** tab
3. The gamepad should be auto-detected

## Controls

| Input | Action |
|-------|--------|
| Left Stick X/Y | Move joints 1-2 |
| Right Stick X/Y | Move joints 3-4 |
| L1 / R1 | Wrist roll left/right |
| L2 / R2 | Gripper close/open |
| D-Pad Up/Down | Adjust movement speed |

## Compatibility

Tested with Xbox One, PS4/PS5, and 8BitDo controllers. Any gamepad recognized by the browser's Gamepad API should work.
`,
      },
      {
        id: "leader-arm",
        title: "Leader Arm Control",
        content: `
# Leader Arm Control

Use a second robot arm (the "leader") to teleoperate the primary arm (the "follower") in real-time.

## Setup

1. Connect both leader and follower arms via USB
2. Go to **Admin** and ensure both robots are detected
3. Navigate to **Control Robot** > **Leader arm** tab
4. Select which robot is the leader and which is the follower
5. Click **Start** to begin teleoperation

## How It Works

The leader arm's joint positions are read at high frequency and mirrored to the follower arm. This is the most intuitive way to collect demonstration data for imitation learning.

## Tips

- Calibrate both arms first for best accuracy
- Leader arm control is the recommended method for recording training datasets
- The recording system automatically captures both leader and follower joint positions
`,
      },
      {
        id: "sliders",
        title: "Slider Control",
        content: `
# Slider Control

Directly set joint angles using slider UI controls.

## Usage

1. Go to **Control Robot** > **Sliders** tab
2. Each slider corresponds to one joint (Rotation, Pitch, Elbow, Wrist Pitch, Wrist Roll, Jaw)
3. Drag sliders to move joints
4. Values are shown in degrees

This mode is useful for precise positioning and testing joint ranges.
`,
      },
      {
        id: "phone",
        title: "Phone Control",
        content: `
# Phone / Mobile Control

Control the robot from your phone using touch joysticks and gyroscope.

## Connecting

1. Ensure your phone is on the **same Wi-Fi network** as the server
2. Find the server IP from the dashboard header (e.g. \`192.168.1.54\`)
3. On your phone browser, navigate to \`http://<server-ip>:80/mobile\`

## Controls

### Virtual Joysticks
- **Left joystick**: X/Y movement
- **Right joystick**: Z axis / rotation
- Joysticks send data at **60 Hz** via WebSocket for smooth control

### Gripper Buttons
- **Open** / **Close** buttons for gripper control
- Press and hold for continuous movement

### Gyroscope Mode
1. Tap **Connect** to establish WebSocket connection
2. Enable **Gyro Control**
3. Tilt your phone to move the robot:
   - Tilt left/right → X axis
   - Tilt forward/back → Y axis
4. A visual tilt indicator shows current orientation

### Speed Control
Use the speed slider to adjust movement sensitivity (0.1x to 2.0x).
`,
      },
      {
        id: "vr",
        title: "VR Control",
        content: `
# VR Control (WebXR)

Control the robot using hand tracking in VR with Apple Vision Pro or Meta Quest.

## Setup

The VR client is a standalone WebXR application served at \`/vr-client/\`.

### Apple Vision Pro
1. Open Safari on Vision Pro
2. Navigate to \`http://<server-ip>:80/vr-client/\`
3. Tap "Enter VR" to start the WebXR session
4. Allow hand tracking permissions

### Meta Quest
1. Open the Oculus Browser
2. Navigate to the VR client URL
3. Enable hand tracking in Quest settings

## How It Works

- **Hand tracking**: Your hand position is mapped to the robot's end-effector position
- **Pinch gesture**: Pinch thumb and index finger to close the gripper
- **Scaling**: Movement is scaled to match the robot's workspace
- **WebSocket**: Hand position data is sent at high frequency to \`ws://<host>/move/teleop/ws\`

## Tips

- Ensure both devices are on the same network
- HTTPS may be required for WebXR on some browsers — use a reverse proxy or self-signed cert
- Best results with good lighting for hand tracking
`,
      },
      {
        id: "macros",
        title: "Macros",
        content: `
# Macro Recorder

Record, save, and replay movement sequences.

## Recording a Macro

1. Go to **Control Robot** > **Macros** tab
2. Enter a name for the macro
3. Click **Start Recording**
4. Move the robot using any control method
5. Click **Stop Recording**

The macro captures joint positions at **30 FPS** and saves them as JSON files in \`~/.irl_robotics/macros/\`.

## Playing a Macro

1. Select a macro from the list
2. Adjust **playback speed** (0.25x to 4.0x)
3. Toggle **loop mode** for continuous playback
4. Click **Play**

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/macro/record/start\` | POST | Start recording (body: \`{"name": "my_macro"}\`) |
| \`/macro/record/stop\` | POST | Stop recording |
| \`/macro/play\` | POST | Play a macro (body: \`{"name": "...", "speed": 1.0, "loop": false}\`) |
| \`/macro/list\` | GET | List all saved macros |
| \`/macro/delete\` | DELETE | Delete a macro (body: \`{"name": "..."}\`) |
`,
      },
      {
        id: "skill-graph",
        title: "Skill Graph Editor",
        content: `
# Skill Graph Editor

A visual node-based editor for chaining macros, primitives, conditions, loops, and AI inference into complex robot behaviors — like Unreal Blueprints for robots.

## Accessing

Navigate to **Skill Graph** in the sidebar, or press \`Ctrl+K\` and search for it.

## Node Types

### Action Nodes

| Node | Color | Description |
|------|-------|-------------|
| **Macro** | Indigo | Play a previously recorded macro. Configure speed (0.25x–4x) and loop count. |
| **Delay** | Amber | Pause execution for N seconds. |
| **Go Home** | Emerald | Move all joints to the zero/home position. |
| **Gripper** | Pink | Open or close the gripper. |
| **Move To** | Blue | Move joints to specific angles (in radians). |

### Flow Control Nodes

| Node | Color | Description |
|------|-------|-------------|
| **If / Else** | Violet | Branch based on a condition (gripper torque threshold or gripping state). Has two output handles: green (True) and red (False). |
| **Loop** | Orange | Repeat a set of nodes N times. Has two output handles: orange (Body) for the loop contents and green (Done) for after the loop. |
| **Parallel** | Cyan | Fork execution — all connected children run concurrently. |
| **Join** | Teal | Synchronization point — waits for all incoming branches before continuing. |

### Advanced Nodes

| Node | Color | Description |
|------|-------|-------------|
| **AI Inference** | Purple | Run a trained model for a configurable number of steps. |
| **Wait Input** | Yellow | Pause execution until the user clicks **Continue** in the toolbar. Useful for semi-automated workflows. |
| **Snapshot** | Red | Capture and save the current joint positions as a named pose file. |
| **Leader-Follower** | Green | Start or stop leader-follower teleoperation mode within a workflow. |
| **Group** | Slate | Visual-only grouping node for organizing large graphs. Does not affect execution. |

## Building a Graph

1. Click a node type in the left palette to add it to the canvas
2. Drag nodes to arrange them (or use **Auto-layout** in the toolbar)
3. Connect nodes by dragging from the bottom handle (output) to the top handle (input) of another node
4. For **If/Else** nodes: drag from the green handle for the True path and the red handle for the False path
5. For **Loop** nodes: drag from the orange handle for the loop body and the green handle for what comes after
6. Click a node to edit its properties in the right panel
7. Each node has an **On Error** policy: Continue (skip errors), Abort (stop the graph), or Retry (re-run the node)
8. Enter a name and click **Save**

## Execution

Graphs execute top-to-bottom following connections. Nodes with no incoming connections start first.

- **Execute** — saves and runs the graph
- **Pause** — pauses between nodes (click **Resume** to continue)
- **Stop** — cancels execution
- **Continue** — appears when a Wait Input node is active

### Live Progress

During execution, nodes are highlighted in real-time:
- **Green pulse** — currently executing
- **Green border** — completed
- **Red glow** — error occurred

After execution completes, an **Execution Log** panel appears at the bottom showing timestamped entries for every node (started, completed, error, skipped).

## UX Features

### Undo / Redo
\`Ctrl+Z\` to undo, \`Ctrl+Shift+Z\` to redo. Tracks up to 50 snapshots of the graph state.

### Copy / Paste
Select a node, press \`Ctrl+C\` to copy, \`Ctrl+V\` to paste with an offset. Useful for repetitive workflows.

### Auto-Layout
Click the grid icon in the toolbar to automatically arrange nodes in a top-to-bottom tree layout using topological sorting.

### Minimap
A minimap in the bottom-right corner of the canvas helps navigate large graphs. Node colors match their type.

### Import / Export
- **Export**: Click the download icon to save the current graph as a JSON file
- **Import**: Click the upload icon and select a JSON file to load a graph from disk. Share workflows between machines.

## Dashboard Widget

A **Run Skill Graph** widget can be added to the main Dashboard via **Customize** > **Add Widget**. It lets you select and execute a saved graph without opening the editor.

## Scheduling

Graphs can be scheduled to run on a timer using the API:

\`\`\`
POST /skillgraph/schedule/start
{ "name": "my_graph", "interval_seconds": 60 }
\`\`\`

Stop a schedule with \`POST /skillgraph/schedule/stop\`.

## Webhook Trigger

Trigger any saved graph externally via:

\`\`\`
POST /skillgraph/trigger/{graph_name}
\`\`\`

This is useful for integrating with external systems, scripts, or automation tools.

## Saved Graphs

Graphs are stored as JSON in \`~/.irl_robotics/skill_graphs/\`. Load or delete saved graphs from the left panel.

## Example: Pick and Place

1. Add **Go Home** → **Macro** (approach) → **Gripper** (close) → **Macro** (lift) → **Macro** (move) → **Gripper** (open) → **Go Home**
2. Connect them in sequence
3. Save as "pick_and_place"
4. Execute!

## Example: Conditional Pick

1. **Go Home** → **Macro** (approach) → **Gripper** (close) → **If/Else** (gripperTorque ≥ 50)
2. True path: **Macro** (lift and place)
3. False path: **Delay** (1s) → **Gripper** (open) → loop back to retry

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/skillgraph/list\` | GET | List all saved graphs |
| \`/skillgraph/load/{name}\` | GET | Load a graph by name |
| \`/skillgraph/save\` | POST | Save a graph |
| \`/skillgraph/delete/{name}\` | DELETE | Delete a graph |
| \`/skillgraph/execute\` | POST | Execute a graph |
| \`/skillgraph/stop\` | POST | Stop execution |
| \`/skillgraph/pause\` | POST | Pause execution |
| \`/skillgraph/resume\` | POST | Resume execution |
| \`/skillgraph/continue\` | POST | Continue past a Wait Input node |
| \`/skillgraph/execution-status\` | GET | Current execution state (node, completed, errors) |
| \`/skillgraph/execution-log\` | GET | Full execution log with timestamps |
| \`/skillgraph/trigger/{name}\` | POST | External webhook trigger |
| \`/skillgraph/schedule/start\` | POST | Start scheduled execution |
| \`/skillgraph/schedule/stop\` | POST | Stop scheduled execution |
`,
      },
    ],
  },
  {
    id: "training",
    label: "AI Training",
    sections: [
      {
        id: "local-training",
        title: "Local Training",
        content: `
# Local AI Training

Train imitation learning models directly on your GPU without cloud dependencies.

## Supported Models

### SmolVLA (Local GPU)
- Vision-Language-Action model from HuggingFace
- Requires: NVIDIA GPU with 8GB+ VRAM
- Dataset format: LeRobot v2.1

### gr00t N1.5 (Local GPU)
- NVIDIA's foundation model for robot manipulation
- Requires: NVIDIA GPU with 16GB+ VRAM
- Dataset format: LeRobot v2.1

## Starting Training

1. Record a dataset with at least 20-50 episodes
2. Go to the **Dashboard** page
3. Find the **AI Training** card
4. Select your model type and dataset
5. Configure training parameters
6. Click **Start Training**

## Training Parameters

### SmolVLA
| Parameter | Default | Description |
|-----------|---------|-------------|
| Batch Size | 4 | Samples per training step |
| Steps | 1000 | Total training steps |

### gr00t
| Parameter | Default | Description |
|-----------|---------|-------------|
| Batch Size | 4 | Samples per training step |
| Learning Rate | 1e-4 | Optimizer learning rate |
| Epochs | 10 | Number of training epochs |

## API Endpoint

\`\`\`
POST /training/start-local
{
  "model_type": "smolvla",
  "dataset_name": "my_dataset",
  "model_name": "my_model",
  "training_params": {
    "batch_size": 4,
    "steps": 1000
  }
}
\`\`\`
`,
      },
      {
        id: "ai-control",
        title: "AI Control (Inference)",
        content: `
# AI Control

Deploy trained models to control the robot autonomously.

## Running Inference

1. Navigate to the **Dashboard**
2. Find the **AI Control** section
3. Select a trained model
4. Click **Start** to begin autonomous control

## Status

The AI control status is shown in the header:
- **Stopped**: No model running
- **Running**: Model actively controlling the robot
- **Paused**: Model loaded but paused
- **Waiting**: Model loading

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/ai-control/start\` | POST | Start AI inference |
| \`/ai-control/stop\` | POST | Stop AI inference |
| \`/ai-control/pause\` | POST | Pause AI inference |
| \`/ai-control/status\` | POST | Get current AI status |
`,
      },
    ],
  },
  {
    id: "visualization",
    label: "Visualization",
    sections: [
      {
        id: "3d-visualizer",
        title: "3D Robot Visualizer",
        content: `
# 3D Robot Visualizer

A real-time 3D view of the SO-100 arm using the actual URDF model and STL meshes.

## Accessing

Navigate to **3D Visualizer** in the sidebar, or press \`Ctrl+K\` and search for it.

## Features

- **Real URDF model**: Uses the SO-100 URDF with all 7 STL mesh files (Base, Rotation_Pitch, Upper_Arm, Lower_Arm, Wrist_Pitch_Roll, Fixed_Jaw, Moving Jaw)
- **Live joint updates**: Polls joint positions at 30 Hz from \`/joints/read\`
- **Smooth interpolation**: Lerp-based smoothing renders at 60 FPS even between data polls
- **Interactive camera**: Drag to orbit, scroll to zoom, right-click to pan
- **Joint readout**: Overlay showing all 6 joint angles in degrees with color coding

## Controls

| Input | Action |
|-------|--------|
| Left-click drag | Orbit camera |
| Scroll wheel | Zoom in/out |
| Right-click drag | Pan camera |

## Connection Status

The top-right indicator shows:
- **Green "Live"**: Successfully reading joint data
- **Red "Disconnected"**: Cannot reach the robot
`,
      },
      {
        id: "cameras",
        title: "Camera Overview",
        content: `
# Camera Overview

View live feeds from all connected cameras.

## Accessing

Navigate to **Cameras** in the sidebar.

## Features

- Live preview from all detected cameras (USB, RealSense, stereo)
- Camera selection for recording
- Resolution and FPS information per camera
- Toggle individual camera feeds on/off

## Camera Types

| Type | Description |
|------|-------------|
| Classic | Standard USB webcams |
| RealSense | Intel RealSense depth cameras |
| Stereo | Stereo camera pairs |
`,
      },
    ],
  },
  {
    id: "simulation",
    label: "Simulation",
    sections: [
      {
        id: "sim-mode",
        title: "Simulation Mode",
        content: `
# Simulation Mode

Run the dashboard without physical hardware using a simulated SO-100 robot.

## Enabling Simulation

### At Startup
\`\`\`bash
uv run irl_robotics run --simulation=headless
\`\`\`

### At Runtime
1. Open the **Dashboard** page
2. Click **Use Simulated Robot**
3. The status will change to show "Simulation Mode"

## API

\`\`\`
POST /simulation/toggle
{
  "enable": true
}
\`\`\`

## Behavior

In simulation mode:
- A virtual SO-100 robot is created in memory
- All control modes work normally (keyboard, gamepad, sliders, etc.)
- Joint positions are simulated and visible in the 3D Visualizer
- Recording works and produces valid datasets
- Useful for testing workflows without hardware
`,
      },
      {
        id: "ros2-bridge",
        title: "ROS2 Bridge & Isaac Sim",
        content: `
# ROS2 Bridge & Isaac Sim

Connect to NVIDIA Isaac Sim for simulation with per-joint offset sliders.

## Setup

1. Install ROS2 (Humble or later)
2. Build the \`irl_teleop\` package:
   \`\`\`bash
   cd so-arm101-ros2-bridge
   colcon build --packages-select irl_teleop
   source install/setup.bash
   \`\`\`
3. Launch Isaac Sim with the SO-100 scene

## Joint Offset Sliders

Navigate to **ROS2 Bridge** in the sidebar to access per-joint offset sliders:

| Joint | Range | Description |
|-------|-------|-------------|
| Rotation | -180° to +180° | Base rotation offset |
| Pitch | -90° to +90° | Shoulder pitch offset |
| Elbow | -90° to +90° | Elbow offset |
| Wrist Pitch | -90° to +90° | Wrist pitch offset |
| Wrist Roll | -180° to +180° | Wrist roll offset |
| Jaw | -45° to +45° | Gripper offset |

These offsets are added to the real joint values before publishing to Isaac Sim, allowing you to calibrate the simulated model to match the physical robot.
`,
      },
      {
        id: "isaacsim-launcher",
        title: "NVIDIA Isaac Sim",
        content: `
# NVIDIA Isaac Sim

Launch and manage NVIDIA Isaac Sim directly from the dashboard.

## Setup

1. Navigate to **Isaac Sim** in the sidebar (under Simulation)
2. Enter your **Isaac Sim installation directory** (the folder containing \`isaac-sim.bat\` or \`isaac-sim.sh\`)
3. Enter your **USD scene folder** (where your \`.usd\` scene files are stored)
4. Click **Save Configuration**

Paths are saved to \`~/.irl_robotics/isaacsim_config.json\` and persist across sessions — you only need to set them once.

## Launching Isaac Sim

Once configured, click **Launch Isaac Sim** to start it. The dashboard tracks the process and shows a green "Running" indicator.

To stop Isaac Sim, click **Stop Isaac Sim**.

## Opening the Scene Folder

Click **Open Scene Folder** to open your USD scene directory in your system's file explorer. From there you can manage, edit, or add new \`.usd\` scene files.

## Typical Isaac Sim Paths

| OS | Default Install Path |
|----|---------------------|
| Windows | \`C:\\Users\\<you>\\AppData\\Local\\ov\\pkg\\isaac-sim-4.x.x\` |
| Linux | \`~/.local/share/ov/pkg/isaac-sim-4.x.x\` |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/isaacsim/config\` | GET | Get current configuration and status |
| \`/isaacsim/config\` | POST | Save configuration paths |
| \`/isaacsim/launch\` | POST | Launch Isaac Sim |
| \`/isaacsim/stop\` | POST | Stop Isaac Sim |
| \`/isaacsim/open-scene-folder\` | POST | Open USD scene folder in file explorer |
`,
      },
    ],
  },
  {
    id: "datasets",
    label: "Datasets",
    sections: [
      {
        id: "recording",
        title: "Recording Episodes",
        content: `
# Recording Episodes

## Starting a Recording

1. Go to any **Control** mode
2. Click the **Record** button in the header bar
3. Perform the task with the robot
4. Click **Stop** to end the episode

## Recording Settings

Configure in **Admin**:
- **FPS**: 30 Hz default (adjustable)
- **Format**: LeRobot v2.1 (recommended), v2, or JSON
- **Cameras**: Select which cameras to record
- **Task instruction**: Text description for the dataset

## Storage

Recordings are saved to the local filesystem. Default location depends on the configured dataset name.

## Tips

- Record at least 20-50 episodes for basic imitation learning
- Keep tasks consistent across episodes
- Ensure good lighting for camera-based models
- Use leader arm control for the most natural demonstrations
`,
      },
      {
        id: "browsing",
        title: "Browsing Datasets",
        content: `
# Browsing Datasets

Navigate to **Datasets** in the sidebar to view and manage recorded data.

## Features

- View all local and pushed datasets
- Browse individual episodes
- Preview camera recordings
- Dataset metadata (robot type, DOF, episode count, image keys)
- Upload to HuggingFace Hub

## Dataset Info

Each dataset shows:
| Field | Description |
|-------|-------------|
| Robot Type | manipulator, mobile, etc. |
| Robot DOF | Degrees of freedom |
| Episodes | Total recorded episodes |
| Image Keys | Camera streams included |
`,
      },
    ],
  },
  {
    id: "setup-calibration",
    label: "Setup & Calibration",
    sections: [
      {
        id: "installation",
        title: "Installation",
        content: `
# Installation

## Quick Install (Windows)

Run the installer script in PowerShell:

\`\`\`powershell
irm https://raw.githubusercontent.com/irl-robotics/homebrew-irl_robotics/main/install.ps1 | iex
\`\`\`

This will:
1. Download the latest \`irl_robotics\` binary from GitHub releases
2. Install it to \`~/.local/bin/irl_robotics.exe\`
3. Add \`~/.local/bin\` to your system PATH

After installation, run:

\`\`\`powershell
irl_robotics run
\`\`\`

## Install from Source

### Prerequisites
- **Python 3.10+**
- **Node.js 20+**
- **uv** — Python package manager (\`pip install uv\` or \`curl -LsSf https://astral.sh/uv/install.sh | sh\`)

### Steps

1. Clone the repository:
\`\`\`bash
git clone https://github.com/irl-robotics/irl_robotics.git --depth 1
cd irl_robotics
\`\`\`

2. Build the dashboard:
\`\`\`bash
cd dashboard && npm install && npm run build
mkdir -p ../irl_robotics/resources/dist/
cp -r dist/* ../irl_robotics/resources/dist/
\`\`\`

On Windows PowerShell:
\`\`\`powershell
cd dashboard; npm install; npm run build
Copy-Item -Path "dist\\*" -Destination "..\\irl_robotics\\resources\\dist\\" -Recurse -Force
\`\`\`

3. Start the server:
\`\`\`bash
cd irl_robotics && uv run --python 3.10 irlrobotics run --simulation=headless
\`\`\`

4. Open the dashboard at **http://localhost:80** (or \`:8020\` if port 80 is in use).

## Command Line Options

| Flag | Description |
|------|-------------|
| \`--simulation=headless\` | Run with simulated robot (no hardware) |
| \`--simulation=gui\` | Simulated robot with PyBullet window |
| \`--no-telemetry\` | Disable crash telemetry |
| \`--no-realsense\` | Disable RealSense cameras |
| \`--no-can\` | Disable CAN bus |
| \`--cameras 0,1\` | Specify camera indices |
| \`--port 80\` | Set server port |

## Troubleshooting

### pybullet won't build on Windows
Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "C++ build tools" workload.

### Port 80 in use
The server auto-increments: 80 → 8020 → 8021 → etc. Check the startup log for the actual port.
`,
      },
      {
        id: "motor-setup",
        title: "Motor Setup",
        content: `
# Motor Setup

The **Setup** tab in Calibration lets you configure motor IDs and EEPROM limits. This is essential when setting up a new robot or replacing servos.

## When to Use Motor Setup

- **First-time assembly** — assign correct IDs to each servo
- **Replacing a servo** — new servos ship with ID 1; you need to reassign
- **Debugging** — check if all motors are responding

## Step 1: Connect to Motor Bus

1. Navigate to **Calibration** > **Setup** tab
2. Select the serial port for your motor bus from the dropdown
3. Click **Connect**

> **Tip**: Only connect **one motor at a time** when changing IDs to avoid conflicts. Disconnect the other servos from the bus.

## Step 2: Scan for Motors

1. Set the ID range to scan (default: 0–10)
2. Click **Scan**
3. Found motors appear in the list with their current IDs

## Step 3: Set Motor IDs

Each joint of the SO-100/SO-101 arm needs a specific motor ID:

| Joint | Motor ID | Description |
|-------|----------|-------------|
| Shoulder Pan | 1 | Base rotation |
| Shoulder Lift | 2 | Shoulder pitch |
| Elbow Flex | 3 | Elbow bend |
| Wrist Flex | 4 | Wrist pitch |
| Wrist Roll | 5 | Wrist rotation |
| Gripper | 6 | Jaw open/close |

To change a motor's ID:
1. Select the motor's **current ID** (from scan results)
2. Select the **target joint** (which sets the target ID)
3. Click **Set ID**

> **Important**: Only connect one motor to the bus when changing IDs. If multiple motors share the same ID, they'll conflict.

## Step 4: EEPROM Angle Limits

After setting IDs, you can manage the servo angle limits stored in EEPROM:

- **Read Limits** — shows the current min/max position values (0–4095) for each motor
- **Unlock All** — sets all motor limits to the full range (0–4095), useful before calibration

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/setup/connect\` | POST | Connect to motor bus (\`{"port": "COM3"}\`) |
| \`/setup/disconnect\` | POST | Disconnect from motor bus |
| \`/setup/scan\` | POST | Scan for motors (\`{"from_id": 0, "to_id": 10}\`) |
| \`/setup/set-motor-id\` | POST | Change motor ID (\`{"from_id": 1, "to_id": 3}\`) |
| \`/setup/read-eeprom-limits\` | POST | Read EEPROM angle limits |
| \`/setup/write-eeprom-limits\` | POST | Write EEPROM limits for one motor |
| \`/setup/unlock-all-limits\` | POST | Set all motors to full range (0–4095) |
`,
      },
      {
        id: "quick-calibration",
        title: "Quick Calibration",
        content: `
# Quick Calibration

The **Calibration** tab provides a single-step calibration process that is fast and easy.

## How It Works

1. Navigate to **Calibration** > **Calibration** tab
2. Physically move your robot to the **home position** — all joints at their midpoint
3. Click **Calibrate**

The system will:
- Disable motor torque (so the arm goes limp)
- Read the raw servo positions
- Compute joint offsets and direction signs
- Save the calibration config

After calibration, all joint angle readings will be accurate relative to the home position.

## When to Use

- After first setup (once motor IDs are assigned)
- After replacing any servo motor
- If the robot's position readings seem wrong
- Before recording training datasets

## Motor Position Limits

Below the calibration button, there is a **Motor Position Limits** section. This lets you record the physical min/max range of each joint:

### Recording Limits

1. Ensure the **Setup** tab is connected to the motor bus
2. Click **Start Recording**
3. Physically move each joint to its **minimum** and **maximum** positions
4. The dashboard shows live min/max values updating in real-time
5. Click **Stop & Save** to write the limits to the servo EEPROM
6. Or click **Stop (Discard)** to cancel without saving

> **Why record limits?** EEPROM limits prevent the servo from moving beyond safe angles, protecting the robot from physical damage. After unlocking all limits in the Setup tab, you should record proper limits here.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/calibrate/quick\` | POST | Run quick calibration (\`?robot_id=0\`) |
| \`/setup/record-limits/start\` | POST | Start limit recording |
| \`/setup/record-limits/sample\` | POST | Sample current positions |
| \`/setup/record-limits/stop\` | POST | Stop recording (\`?write=true\` to save) |
`,
      },
      {
        id: "advanced-calibration",
        title: "Advanced Calibration",
        content: `
# Advanced Calibration

The **Advanced Cal.** tab provides a multi-step guided calibration sequence with visual reference images.

## How It Works

1. Navigate to **Calibration** > **Advanced Cal.** tab
2. Click **Start Calibration**
3. The wizard shows a reference image for each calibration position
4. Move the robot to match the shown position
5. Click **Confirm** to record that position
6. Repeat for each calibration step (typically 2 positions)

This method is more accurate than quick calibration because it uses multiple known positions to compute joint offsets, directions, and gear ratios.

## When to Use

- For maximum calibration accuracy
- When quick calibration results are not satisfactory
- When setting up a new robot model for the first time

## Calibration Positions

### Position 1
The robot is placed in a specific pose (shown in the reference image). All joints are at defined angles.

### Position 2
The robot is moved to a second pose. The difference between the two positions allows the system to calculate accurate joint parameters.

## Tips

- Follow the reference images precisely
- Ensure the robot arm is not obstructed
- The arm will go limp (torque disabled) during calibration — support it if needed
- Calibration data persists in \`~/.irl_robotics/\`
`,
      },
      {
        id: "joint-control",
        title: "Joint Control",
        content: `
# Joint Control

The **Joints Control** tab on the Calibration page provides a direct interface to test individual servo motors.

## Features

- Read current position of each joint in raw servo ticks and degrees
- Send position commands to individual joints
- Useful for verifying calibration results
- Test that each motor ID is assigned to the correct physical joint

## Usage

1. Navigate to **Calibration** > **Joints Control** tab
2. Use the controls to read or write individual joint positions
3. Verify that moving joint 1 actually rotates the base, joint 2 moves the shoulder, etc.

## Tips

- Start with small movements to verify correct joint-to-ID mapping
- If a joint moves in the wrong direction, recalibrate
- If the wrong joint moves, the motor IDs need to be reassigned in the Setup tab
`,
      },
    ],
  },
  {
    id: "api",
    label: "API Reference",
    sections: [
      {
        id: "api-overview",
        title: "API Overview",
        content: `
# API Reference

The IRL Robotics server exposes a RESTful API on the same port as the dashboard. Full interactive API docs are available at:

\`\`\`
http://<server-ip>:80/docs
\`\`\`

## Core Endpoints

### Status
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/status\` | GET | Server status, connected robots, cameras |

### Robot Control
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/joints/read\` | POST | Read current joint positions |
| \`/joints/write\` | POST | Write joint positions |
| \`/move/teleop/ws\` | WebSocket | Real-time teleoperation |

### Recording
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/recording/start\` | POST | Start recording an episode |
| \`/recording/stop\` | POST | Stop recording |
| \`/recording/status\` | GET | Current recording state |

### Macros
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/macro/record/start\` | POST | Start macro recording |
| \`/macro/record/stop\` | POST | Stop macro recording |
| \`/macro/play\` | POST | Play a saved macro |
| \`/macro/list\` | GET | List all macros |
| \`/macro/delete\` | DELETE | Delete a macro |

### Training
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/training/start-local\` | POST | Start local model training |
| \`/training/status\` | GET | Training job status |

### AI Control
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/ai-control/start\` | POST | Start AI inference |
| \`/ai-control/stop\` | POST | Stop AI inference |
| \`/ai-control/status\` | POST | Get inference status |

### Setup & Calibration
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/setup/connect\` | POST | Connect to motor bus |
| \`/setup/disconnect\` | POST | Disconnect from motor bus |
| \`/setup/scan\` | POST | Scan for motors in ID range |
| \`/setup/set-motor-id\` | POST | Change a motor's ID |
| \`/setup/read-eeprom-limits\` | POST | Read servo EEPROM angle limits |
| \`/setup/write-eeprom-limits\` | POST | Write EEPROM limits for one motor |
| \`/setup/unlock-all-limits\` | POST | Set all motors to full range |
| \`/setup/record-limits/start\` | POST | Start recording position limits |
| \`/setup/record-limits/sample\` | POST | Sample current positions |
| \`/setup/record-limits/stop\` | POST | Stop recording, optionally write |
| \`/calibrate\` | POST | Multi-step guided calibration |
| \`/calibrate/quick\` | POST | Single-step quick calibration |

### Skill Graph
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/skillgraph/list\` | GET | List saved graphs |
| \`/skillgraph/load/{name}\` | GET | Load a graph |
| \`/skillgraph/save\` | POST | Save a graph |
| \`/skillgraph/delete/{name}\` | DELETE | Delete a graph |
| \`/skillgraph/execute\` | POST | Execute a graph |
| \`/skillgraph/stop\` | POST | Stop execution |
| \`/skillgraph/pause\` | POST | Pause execution |
| \`/skillgraph/resume\` | POST | Resume execution |
| \`/skillgraph/continue\` | POST | Continue past Wait Input |
| \`/skillgraph/execution-status\` | GET | Live execution state |
| \`/skillgraph/execution-log\` | GET | Execution log |
| \`/skillgraph/trigger/{name}\` | POST | Webhook trigger |
| \`/skillgraph/schedule/start\` | POST | Start scheduled runs |
| \`/skillgraph/schedule/stop\` | POST | Stop scheduled runs |

### Simulation
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/simulation/toggle\` | POST | Toggle simulation mode |

### Camera
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/cameras/status\` | GET | All camera statuses |
| \`/cameras/preview\` | GET | Camera preview stream |
`,
      },
      {
        id: "websocket",
        title: "WebSocket API",
        content: `
# WebSocket API

## Teleoperation WebSocket

\`\`\`
ws://<host>:<port>/move/teleop/ws
\`\`\`

### Message Format (Client → Server)

\`\`\`json
{
  "x": 0.0,
  "y": 0.0,
  "z": 0.0,
  "roll": 0.0,
  "pitch": 0.0,
  "yaw": 0.0,
  "gripper": 0.0,
  "robot_name": "SO-100",
  "speed": 1.0
}
\`\`\`

### Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| x, y, z | float | -1.0 to 1.0 | Cartesian movement |
| roll, pitch, yaw | float | -1.0 to 1.0 | Orientation movement |
| gripper | float | -1.0 to 1.0 | Gripper open/close |
| robot_name | string | — | Target robot name |
| speed | float | 0.1 to 2.0 | Movement speed multiplier |

### Usage

Send messages at 30-60 Hz for smooth control. The server processes the latest message and discards older ones if it falls behind.
`,
      },
    ],
  },
  {
    id: "shortcuts",
    label: "Keyboard Shortcuts",
    sections: [
      {
        id: "global-shortcuts",
        title: "Global Shortcuts",
        content: `
# Keyboard Shortcuts

## Global

| Shortcut | Action |
|----------|--------|
| \`Ctrl+K\` | Open command palette |
| \`Esc\` | Close command palette / dialogs |

## Command Palette

| Key | Action |
|-----|--------|
| \`↑\` / \`↓\` | Navigate items |
| \`Enter\` | Select item |
| \`Esc\` | Close palette |

The command palette gives quick access to all pages, control modes, and actions. Type to filter by name or keyword.

## Skill Graph Editor

| Shortcut | Action |
|----------|--------|
| \`Ctrl+Z\` | Undo (up to 50 steps) |
| \`Ctrl+Shift+Z\` | Redo |
| \`Ctrl+C\` | Copy selected node |
| \`Ctrl+V\` | Paste copied node |
| \`Delete\` | Delete selected node (when using the Delete button) |

## Notifications

Click the **bell icon** in the header to view notifications. The system automatically notifies you about:

- Robot connect/disconnect events
- Recording start/stop
- AI control status changes
- Simulation mode changes
`,
      },
    ],
  },
];
