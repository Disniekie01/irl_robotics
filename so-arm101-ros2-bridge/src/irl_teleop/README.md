# IRL Robotics Teleoperation for SO-ARM101

This package provides a ROS2 interface for controlling the SO-ARM101 robot arm using [Phospho's teleoperation HTTP API](https://docs.phospho.ai/control/move-teleoperation-ws).

## Features

- **Real-time HTTP Communication**: Connects to phospho's teleoperation HTTP endpoint
- **ROS2 Integration**: Publishes pose commands, velocity commands, and gripper controls to ROS2 topics
- **Hardware Interface**: Integrates with existing SO-ARM101 hardware drivers
- **Safety Features**: Includes velocity limits and error handling
- **Status Feedback**: Reports robot state back to phospho
- **Robot Control**: Properly controls the robot through standard ROS2 control topics

## Prerequisites

- ROS2 Humble or later
- SO-ARM101 robot hardware
- Python 3.8+
- irl_robotics robot control system

## Installation

1. **Install Python dependencies**:
   ```bash
   pip3 install requests numpy
   ```

2. **Build the workspace**:
   ```bash
   cd ~/so-arm101-ros2-bridge
   colcon build --packages-select irl_teleop jointstatereader
   source install/setup.bash
   ```

## Usage

### Quick Start

1. **Connect your SO-ARM101 robot** to USB ports:
   - Hardware interface: `/dev/ttyACM0`
   - TF2 broadcaster: `/dev/ttyACM1`

2. **Start IRL Robotics teleoperation**:
   ```bash
   ros2 launch irl_teleop irl_teleop.launch.py
   ```

3. **Connect to irl_robotics HTTP API** at `http://192.168.1.97:8020`

### Manual Node Execution

If you prefer to run nodes individually:

1. **Start hardware interface**:
   ```bash
   ros2 run jointstatereader joint_state_reader.py
   ```

2. **Start TF2 broadcaster**:
   ```bash
   ros2 run jointstatereader soarm_tf2.py
   ```

3. **Start irl_robotics HTTP teleop node**:
   ```bash
   ros2 run irl_teleop irl_http_teleop.py
   ```

### Testing Robot Control

To verify that the irl_robotics HTTP teleop is properly controlling the robot:

```bash
# Run the control tester
python3 src/irl_teleop/demo/test_phospho_control.py
```

This will monitor the robot control topics and confirm that commands are being published correctly.

## Configuration

### HTTP API URL

By default, the system connects to `http://192.168.1.97:8020`. You can change this:

```bash
ros2 launch irl_teleop irl_teleop.launch.py phospho_url:=http://your-phospho-server:8020
```

### Control Parameters

Edit `config/irl_teleop.yaml` to adjust:

- **Velocity limits**: `max_linear_velocity`, `max_angular_velocity`
- **Control frequency**: `control_frequency`
- **Safety timeouts**: `emergency_stop_timeout`
- **Gripper settings**: `gripper_open_position`, `gripper_closed_position`

## ROS2 Topics

### Subscribed Topics

- `/joint_states` (sensor_msgs/JointState): Current robot joint positions

### Published Topics

- `/robot/cmd_pose` (geometry_msgs/PoseStamped): Target end-effector pose
- `/robot/cmd_vel` (geometry_msgs/Twist): Velocity commands
- `/robot/gripper` (std_msgs/Bool): Gripper open/close commands

## IRL Robotics Protocol

The system implements the IRL Robotics teleoperation protocol:

### Incoming Commands

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

```json
{
  "nb_actions_received": 5,
  "is_object_gripped": false,
  "is_object_gripped_source": "left"
}
```

## Robot Control Architecture

The irl_robotics HTTP teleop node now properly controls the robot through the following flow:

1. **IRL Robotics HTTP API** → Receives teleoperation commands
2. **Pose Conversion** → Converts to ROS2 pose messages
3. **Robot Control Topics** → Publishes to `/robot/cmd_pose`, `/robot/cmd_vel`, `/robot/gripper`
4. **Hardware Interface** → Joint state reader controls the physical robot

This ensures that irl_robotics commands directly control the robot arm through the standard ROS2 control interface.

## Troubleshooting

### Connection Issues

1. **Check HTTP API URL**: Ensure irl_robotics server is running and accessible
2. **Verify robot connection**: Check USB ports and serial permissions
3. **Check logs**: Monitor node output for error messages

### Robot Control Issues

1. **Joint limits**: Ensure commands are within robot's workspace
2. **Velocity limits**: Reduce `max_linear_velocity` if movements are too fast
3. **Safety timeouts**: Increase `emergency_stop_timeout` if needed

### Common Commands

```bash
# Check node status
ros2 node list
ros2 topic list
ros2 topic echo /joint_states

# Monitor irl_robotics teleop
ros2 topic echo /robot/cmd_pose
ros2 topic echo /robot/cmd_vel
ros2 topic echo /robot/gripper

# Check TF transforms
ros2 run tf2_tools view_frames

# Test robot control
python3 src/irl_teleop/demo/test_phospho_control.py
```

## Development

### Adding New Features

1. **Extend IRL Robotics Protocol**: Modify `irl_http_teleop.py`
2. **Add safety features**: Implement in control loop
3. **Custom controllers**: Create new ROS2 nodes

### Testing

```bash
# Run tests
colcon test --packages-select irl_teleop

# View test results
colcon test-result --verbose
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and questions:
- Check the [irl_robotics documentation](https://docs.phospho.ai/)
- Review ROS2 logs and error messages
- Ensure hardware connections are correct 