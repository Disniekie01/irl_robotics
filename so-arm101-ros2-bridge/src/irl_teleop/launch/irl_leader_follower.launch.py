#!/usr/bin/env python3

from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():
    # Get the package share directory
    pkg_share = get_package_share_directory('irl_teleop')
    
    # Launch arguments
    websocket_url_arg = DeclareLaunchArgument(
        'websocket_url',
        default_value='ws://localhost:8020/move/teleop/ws',
        description='IRL Robotics WebSocket URL'
    )
    
    # IRL Robotics teleop node (leader arm interface)
    irl_teleop_node = Node(
        package='irl_teleop',
        executable='irl_teleop_node',
        name='irl_teleop_node',
        output='screen',
        parameters=[{
            'websocket_url': LaunchConfiguration('websocket_url'),
            'max_linear_velocity': 0.1,
            'max_angular_velocity': 0.5,
            'control_frequency': 50,
        }]
    )
    
    # IRL Robotics leader controller (converts pose to joint commands)
    irl_leader_controller = Node(
        package='irl_teleop',
        executable='irl_leader_controller',
        name='irl_leader_controller',
        output='screen',
        parameters=[{
            'max_joint_velocity': 0.5,
            'control_frequency': 50,
            'pose_tolerance': 0.01,
            'orientation_tolerance': 0.1,
        }]
    )
    
    calibration_config_arg = DeclareLaunchArgument(
        'calibration_config_path',
        default_value='',
        description='Path to SO-100 calibration JSON for joint_state_reader (correct servo 4/5 for Isaac Sim)'
    )
    # Joint state reader (follower arm - optional for hardware)
    joint_state_reader_node = Node(
        package='jointstatereader',
        executable='joint_state_reader.py',
        name='joint_state_reader',
        output='screen',
        parameters=[{
            'serial_port': '/dev/ttyACM0',
            'baud_rate': 1000000,
            'calibration_config_path': LaunchConfiguration('calibration_config_path', default=''),
        }]
    )
    
    return LaunchDescription([
        websocket_url_arg,
        calibration_config_arg,
        irl_teleop_node,
        irl_leader_controller,
        joint_state_reader_node,
    ]) 