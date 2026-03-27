#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from geometry_msgs.msg import PoseStamped, Twist
from std_msgs.msg import Bool
import requests
import json
import time
import math

class PhosphoStatusMonitor(Node):
    def __init__(self):
        super().__init__('irl_status_monitor')
        
        # Publishers for Isaac Sim integration (matching joint_state_reader pattern)
        self.joint_pub = self.create_publisher(JointState, '/joint_states', 10)
        self.twist_pub = self.create_publisher(Twist, '/robot/cmd_pose', 10)
        self.gripper_pub = self.create_publisher(Bool, '/robot/gripper', 10)
        
        # Parameters
        self.declare_parameter('phospho_url', 'http://localhost:8020')
        self.declare_parameter('poll_rate', 0.1)  # 10 Hz
        self.declare_parameter('max_linear_velocity', 0.1)
        self.declare_parameter('max_angular_velocity', 0.5)
        
        self.phospho_url = self.get_parameter('phospho_url').value
        self.poll_rate = self.get_parameter('poll_rate').value
        self.max_linear_velocity = self.get_parameter('max_linear_velocity').value
        self.max_angular_velocity = self.get_parameter('max_angular_velocity').value
        
        # Joint names for SO-ARM101 (matching Isaac Lab convention from joint_state_reader)
        self.joint_names = [
            'Rotation',      # Base rotation
            'Pitch',         # Shoulder pitch  
            'Elbow',         # Elbow
            'Wrist_Pitch',   # Wrist pitch
            'Wrist_Roll',    # Wrist roll
            'Jaw'            # Gripper
        ]
        
        # Timer for polling irl_robotics status
        self.timer = self.create_timer(self.poll_rate, self.poll_phospho_status)
        
        self.get_logger().info('🚀 IRL Robotics Status Monitor started')
        self.get_logger().info(f'📡 Monitoring irl_robotics at: {self.phospho_url}')
        self.get_logger().info('🎮 Publishing to Isaac Sim topics: /joint_states, /robot/cmd_pose, /robot/gripper')
        
    def poll_phospho_status(self):
        """Poll irl_robotics status and convert to Isaac Sim commands"""
        try:
            # Get irl_robotics status
            response = requests.get(f'{self.phospho_url}/status', timeout=1.0)
            if response.status_code == 200:
                status = response.json()
                
                # Check if there are robots and get their status
                if 'robot_status' in status and status['robot_status']:
                    robot = status['robot_status'][0]  # First robot
                    
                    # Convert robot status to Isaac Sim commands
                    self.convert_robot_status_to_isaac_commands(robot)
                    
        except Exception as e:
            self.get_logger().warn(f'❌ Error polling phospho: {e}')
    
    def convert_robot_status_to_isaac_commands(self, robot):
        """Convert robot status to Isaac Sim commands"""
        try:
            # Extract position and orientation from robot status
            # This depends on the actual irl_robotics API response format
            # For now, we'll use a simple approach
            
            # Create pose command for Isaac Sim
            pose = PoseStamped()
            pose.header.stamp = self.get_clock().now().to_msg()
            pose.header.frame_id = 'base_link'
            
            # Extract position from robot status (adjust based on actual API)
            if 'position' in robot:
                pos = robot['position']
                pose.pose.position.x = pos.get('x', 0.0)
                pose.pose.position.y = pos.get('y', 0.2)
                pose.pose.position.z = pos.get('z', 0.1)
            else:
                # Default position if not available
                pose.pose.position.x = 0.0
                pose.pose.position.y = 0.2
                pose.pose.position.z = 0.1
            
            # Extract orientation from robot status (adjust based on actual API)
            if 'orientation' in robot:
                orient = robot['orientation']
                pose.pose.orientation.w = orient.get('w', 1.0)
                pose.pose.orientation.x = orient.get('x', 0.0)
                pose.pose.orientation.y = orient.get('y', 0.0)
                pose.pose.orientation.z = orient.get('z', 0.0)
            else:
                # Default orientation
                pose.pose.orientation.w = 1.0
                pose.pose.orientation.x = 0.0
                pose.pose.orientation.y = 0.0
                pose.pose.orientation.z = 0.0
            
            # Convert pose to joint commands for Isaac Sim
            joint_positions = self.compute_inverse_kinematics(pose)
            
            # Publish joint states to Isaac Sim
            joint_state = JointState()
            joint_state.header.stamp = self.get_clock().now().to_msg()
            joint_state.name = self.joint_names
            joint_state.position = joint_positions
            self.joint_pub.publish(joint_state)
            
            # Publish twist command to Isaac Sim (matching joint_state_reader pattern)
            twist = self.convert_pose_to_twist(pose)
            self.twist_pub.publish(twist)
            
            # Handle gripper if available
            if 'gripper' in robot:
                gripper_open = robot['gripper'].get('open', True)
                gripper_msg = Bool()
                gripper_msg.data = gripper_open
                self.gripper_pub.publish(gripper_msg)
            
        except Exception as e:
            self.get_logger().error(f'❌ Error converting robot status: {e}')
    
    def compute_inverse_kinematics(self, pose):
        """Compute inverse kinematics for SO-ARM101 (simplified)"""
        # This is a simplified IK - you may need to adjust for your robot
        
        x, y, z = pose.pose.position.x, pose.pose.position.y, pose.pose.position.z
        
        # Simplified IK calculation
        # Base rotation
        joint1 = math.atan2(y, x) if abs(x) > 0.001 else 0.0
        
        # Shoulder pitch
        joint2 = math.atan2(z - 0.1, math.sqrt(x**2 + y**2))
        
        # Elbow (simplified)
        joint3 = -joint2 * 0.8
        
        # Wrist pitch (simplified)
        joint4 = 0.0
        
        # Wrist roll (simplified)
        joint5 = 0.0
        
        # Gripper
        joint6 = 1.0  # Default open
        
        return [joint1, joint2, joint3, joint4, joint5, joint6]
    
    def convert_pose_to_twist(self, pose):
        """Convert pose to twist command (matching joint_state_reader pattern)"""
        twist = Twist()
        
        # Simple proportional control based on pose
        # This creates a gentle movement toward the target
        target_pos = [
            pose.pose.position.x,
            pose.pose.position.y,
            pose.pose.position.z
        ]
        
        # Current position (would need to get from robot state)
        current_pos = [0.0, 0.0, 0.0]
        
        # Simple proportional control
        kp = 0.1
        twist.linear.x = (target_pos[0] - current_pos[0]) * kp
        twist.linear.y = (target_pos[1] - current_pos[1]) * kp
        twist.linear.z = (target_pos[2] - current_pos[2]) * kp
        
        # Clamp to velocity limits
        twist.linear.x = max(-self.max_linear_velocity, min(self.max_linear_velocity, twist.linear.x))
        twist.linear.y = max(-self.max_linear_velocity, min(self.max_linear_velocity, twist.linear.y))
        twist.linear.z = max(-self.max_linear_velocity, min(self.max_linear_velocity, twist.linear.z))
        
        return twist

def main(args=None):
    rclpy.init(args=args)
    node = PhosphoStatusMonitor()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main() 