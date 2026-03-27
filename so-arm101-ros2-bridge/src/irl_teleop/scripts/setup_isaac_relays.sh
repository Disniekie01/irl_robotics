#!/bin/bash

# Setup Isaac Sim Topic Relays
# This script sets up the necessary topic relays to connect irl_robotics teleop to Isaac Sim

echo "🚀 Setting up Isaac Sim topic relays..."

# Check if ROS2 is sourced
if [ -z "$ROS_DISTRO" ]; then
    echo "❌ ROS2 not sourced. Please run: source /opt/ros/jazzy/setup.bash (or source /opt/ros/humble/setup.bash)"
    exit 1
fi

# Check if workspace is sourced
if ! ros2 node list > /dev/null 2>&1; then
    echo "❌ ROS2 workspace not sourced. Please run: source install/setup.bash"
    exit 1
fi

echo "📡 Setting up topic relays..."

# 1. Relay joint states to Isaac Sim joint command
echo "   🔄 /joint_states → /isaac_joint_command"
ros2 run topic_tools relay /joint_states /isaac_joint_command &
JOINT_RELAY_PID=$!

# 2. Relay pose commands to Isaac Sim (if needed)
echo "   🔄 /robot/cmd_pose → /isaac_pose_command (if topic exists)"
ros2 run topic_tools relay /robot/cmd_pose /isaac_pose_command &
POSE_RELAY_PID=$!

# 3. Relay velocity commands to Isaac Sim (if needed)
echo "   🔄 /robot/cmd_vel → /isaac_vel_command (if topic exists)"
ros2 run topic_tools relay /robot/cmd_vel /isaac_vel_command &
VEL_RELAY_PID=$!

# 4. Relay gripper commands to Isaac Sim (if needed)
echo "   🔄 /robot/gripper → /isaac_gripper_command (if topic exists)"
ros2 run topic_tools relay /robot/gripper /isaac_gripper_command &
GRIPPER_RELAY_PID=$!

echo "✅ Topic relays started!"
echo "📊 Relay PIDs:"
echo "   Joint relay: $JOINT_RELAY_PID"
echo "   Pose relay: $POSE_RELAY_PID"
echo "   Velocity relay: $VEL_RELAY_PID"
echo "   Gripper relay: $GRIPPER_RELAY_PID"

echo ""
echo "🎮 Isaac Sim should now receive commands from irl_robotics teleop!"
echo "📡 Monitor topics with:"
echo "   ros2 topic echo /isaac_joint_command"
echo "   ros2 topic echo /isaac_pose_command"
echo "   ros2 topic echo /isaac_vel_command"
echo "   ros2 topic echo /isaac_gripper_command"

# Function to cleanup relays on exit
cleanup() {
    echo ""
    echo "🛑 Stopping topic relays..."
    kill $JOINT_RELAY_PID 2>/dev/null
    kill $POSE_RELAY_PID 2>/dev/null
    kill $VEL_RELAY_PID 2>/dev/null
    kill $GRIPPER_RELAY_PID 2>/dev/null
    echo "✅ Relays stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo ""
echo "⏳ Relays running... Press Ctrl+C to stop"
echo ""

# Wait for user to stop
wait 