# SO-ARM101 IRL Robotics Teleoperation Integration

This document describes the integration of the SO-ARM101 robot with [Phospho's teleoperation system](https://docs.phospho.ai/control/move-teleoperation-ws) using ROS2.

## Overview

The IRL Robotics teleoperation integration enables real-time control of the SO-ARM101 robot arm through phospho's WebSocket API. This allows for:

- **Remote Control**: Control the robot from anywhere via phospho's teleoperation interface
- **Real-time Feedback**: Get status updates and robot state information
- **Safety Features**: Built-in velocity limits and error handling
- **ROS2 Integration**: Seamless integration with existing ROS2 ecosystem

## Architecture

```
┌─────────────────┐    WebSocket    ┌──────────────────┐    ROS2 Topics    ┌─────────────────┐
│   IRL Robotics       │ ◄─────────────► │  IRL Robotics Teleop  │ ◄──────────────► │   SO-ARM101     │
│   Interface     │                 │      Node         │                  │    Robot        │
└─────────────────┘                 └──────────────────┘                  └─────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  Hardware        │
                                    │  Interface       │
                                    │  (jointstatereader) │
                                    └──────────────────┘
```

## Components

### 1. IRL Robotics Teleop Node (`irl_teleop_node.py`)

**Purpose**: Main interface between irl_robotics WebSocket and ROS2 system

**Key Features**:
- WebSocket client for irl_robotics communication
- ROS2 publishers for robot control commands
- Forward kinematics computation
- Status feedback to phospho
- Safety and error handling

**Topics**:
- **Subscribes**: `/joint_states` (robot state)
- **Publishes**: 
  - `/robot/cmd_pose` (target end-effector pose)
  - `/robot/cmd_vel` (velocity commands)
  - `/robot/gripper` (gripper control)

### 2. Hardware Interface (`jointstatereader`)

**Purpose**: Reads actual robot joint positions from hardware

**Features**:
- STS3215 servo communication protocol
- Real-time joint state publishing
- Error handling and reconnection logic
- TF2 transform broadcasting

### 3. Launch System (`irl_teleop.launch.py`)

**Purpose**: Orchestrates all components for easy startup

**Components Launched**:
- Joint state reader (hardware interface)
- TF2 broadcaster
- IRL Robotics teleop node

## IRL Robotics Protocol Implementation

### Incoming Commands

The system accepts IRL Robotics teleoperation commands in JSON format:

```json
{
  "x": 0.5,        // X position (meters)
  "y": 1.2,        // Y position (meters) 
  "z": -0.7,       // Z position (meters)
  "rx": 45.0,      // X rotation (degrees)
  "ry": 30.0,      // Y rotation (degrees)
  "rz": 90.0,      // Z rotation (degrees)
  "open": 1,       // Gripper state (1=open, 0=closed)
  "source": "left" // Control source
}
```

### Status Updates

The system sends status updates back to phospho:

```json
{
  "nb_actions_received": 5,
  "is_object_gripped": false,
  "is_object_gripped_source": "left"
}
```

## Installation & Setup

### Prerequisites

1. **ROS2 Humble** installed and sourced
2. **SO-ARM101 robot** connected via USB
3. **Python dependencies**:
   ```bash
   pip3 install websockets numpy
   ```

### Build Instructions

```bash
# Clone repository
git clone https://github.com/your-repo/so-arm101-ros2-bridge.git
cd so-arm101-ros2-bridge

# Build packages
colcon build --packages-select irl_teleop jointstatereader

# Source workspace
source install/setup.bash
```

### Hardware Setup

1. **Connect SO-ARM101 robot** to USB ports:
   - Hardware interface: `/dev/ttyACM0`
   - TF2 broadcaster: `/dev/ttyACM1`

2. **Set USB permissions** (if needed):
   ```bash
   sudo chmod 666 /dev/ttyACM0 /dev/ttyACM1
   ```

## Usage

### Quick Start

```bash
# Start IRL Robotics teleoperation system
ros2 launch irl_teleop irl_teleop.launch.py
```

### Manual Node Execution

```bash
# Terminal 1: Hardware interface
ros2 run jointstatereader joint_state_reader.py

# Terminal 2: TF2 broadcaster  
ros2 run jointstatereader soarm_tf2.py

# Terminal 3: IRL Robotics teleop node
ros2 run irl_teleop irl_teleop_node
```

### Demo Script

Test the system with the included demo:

```bash
python3 src/irl_teleop/demo/irl_demo.py
```

## Configuration

### WebSocket URL

Change the irl_robotics WebSocket URL:

```bash
ros2 launch irl_teleop irl_teleop.launch.py websocket_url:=ws://your-server/move/teleop/ws
```

### Control Parameters

Edit `src/irl_teleop/config/irl_teleop.yaml`:

```yaml
irl_teleop_node:
  ros__parameters:
    max_linear_velocity: 0.1    # m/s
    max_angular_velocity: 0.5   # rad/s
    control_frequency: 50       # Hz
    emergency_stop_timeout: 5.0 # seconds
```

## Monitoring & Debugging

### ROS2 Topics

Monitor robot control:

```bash
# Check pose commands
ros2 topic echo /robot/cmd_pose

# Check gripper commands
ros2 topic echo /robot/gripper

# Check joint states
ros2 topic echo /joint_states
```

### WebSocket Communication

Test WebSocket connection:

```bash
# Test connection
python3 src/irl_teleop/test/test_irl_teleop.py
```

### TF Transforms

View robot transforms:

```bash
# Generate TF tree diagram
ros2 run tf2_tools view_frames

# Check specific transforms
ros2 run tf2_ros tf2_echo base_link ee_control_frame
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Refused**
   - Ensure irl_robotics server is running
   - Check WebSocket URL in configuration
   - Verify network connectivity

2. **Robot Not Responding**
   - Check USB connections (`/dev/ttyACM0`, `/dev/ttyACM1`)
   - Verify serial port permissions
   - Check robot power and servo status

3. **Commands Out of Range**
   - Adjust velocity limits in configuration
   - Check robot workspace constraints
   - Verify DH parameters for your robot

### Error Messages

- `"WebSocket connection failed"`: Network/server issues
- `"Serial port not found"`: USB connection problems
- `"Invalid position"`: Command outside robot workspace
- `"Servo communication error"`: Hardware interface issues

## Safety Features

### Built-in Protections

1. **Velocity Limits**: Commands are clamped to safe speeds
2. **Position Limits**: Commands outside workspace are rejected
3. **Timeout Handling**: Emergency stop on communication loss
4. **Error Recovery**: Automatic reconnection attempts

### Emergency Stop

```bash
# Emergency stop all robot motion
ros2 service call /emergency_stop std_srvs/srv/Trigger
```

## Development

### Adding Features

1. **New Control Modes**: Extend `irl_teleop_node.py`
2. **Safety Features**: Implement in control loop
3. **Custom Protocols**: Modify WebSocket handlers

### Testing

```bash
# Run tests
colcon test --packages-select irl_teleop

# View results
colcon test-result --verbose
```

## API Reference

### IRL Robotics Teleop Node

**Class**: `PhosphoTeleopNode`

**Methods**:
- `websocket_handler()`: WebSocket communication loop
- `handle_phospho_command(data)`: Process incoming commands
- `send_status_update()`: Send status to phospho
- `control_loop()`: Main control loop

**Parameters**:
- `websocket_url`: IRL Robotics WebSocket endpoint
- `max_linear_velocity`: Maximum linear velocity (m/s)
- `max_angular_velocity`: Maximum angular velocity (rad/s)
- `control_frequency`: Control loop frequency (Hz)

### Configuration Files

- `config/irl_teleop.yaml`: Node parameters
- `launch/irl_teleop.launch.py`: Launch configuration
- `demo/irl_demo.py`: Demo script

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## Support

- **Documentation**: [IRL Robotics Docs](https://docs.phospho.ai/)
- **Issues**: GitHub repository issues
- **Community**: ROS2 and irl_robotics community forums

## License

MIT License - see LICENSE file for details. 