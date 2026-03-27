#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped, Twist
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool
import numpy as np
import math
from typing import List, Optional

class PhosphoLeaderController(Node):
    def __init__(self):
        super().__init__('irl_leader_controller')
        
        # Subscribe to irl_robotics pose commands (leader arm)
        self.pose_sub = self.create_subscription(
            PoseStamped, '/robot/cmd_pose', self.pose_callback, 10)
        self.gripper_sub = self.create_subscription(
            Bool, '/robot/gripper', self.gripper_callback, 10)
        
        # Subscribe to current joint states (follower arm)
        self.joint_state_sub = self.create_subscription(
            JointState, '/joint_states', self.joint_state_callback, 10)
        
        # Publish robot control commands (follower arm)
        self.pose_command_pub = self.create_publisher(
            PoseStamped, '/robot/cmd_pose', 10)
        self.twist_command_pub = self.create_publisher(
            Twist, '/robot/cmd_vel', 10)
        self.gripper_command_pub = self.create_publisher(
            Bool, '/robot/gripper', 10)
        
        # SO-ARM101 joint names (follower arm)
        self.joint_names = [
            'Rotation',      # Base rotation
            'Pitch',         # Shoulder pitch  
            'Elbow',         # Elbow
            'Wrist_Pitch',   # Wrist pitch
            'Wrist_Roll',    # Wrist roll
            'Jaw'            # Gripper
        ]
        
        # Current joint positions
        self.current_joint_positions = [0.0] * len(self.joint_names)
        
        # Target pose from phospho
        self.target_pose = None
        self.target_gripper_open = True
        
        # Control parameters
        self.max_linear_velocity = 0.1  # m/s
        self.max_angular_velocity = 0.5  # rad/s
        self.control_frequency = 50  # Hz
        self.pose_tolerance = 0.01  # meters
        self.orientation_tolerance = 0.1  # radians
        
        # Control timer
        self.control_timer = self.create_timer(1.0/self.control_frequency, self.control_loop)
        
        self.get_logger().info("🚀 IRL Robotics Leader Controller started")
        self.get_logger().info("📡 Listening to irl_robotics pose commands (leader arm)")
        self.get_logger().info("🤖 Converting to robot commands for SO-ARM101 (follower arm)")
        self.get_logger().info("🎮 Publishing to /robot/cmd_pose, /robot/cmd_vel, /robot/gripper")
        
    def pose_callback(self, msg: PoseStamped):
        """Handle pose commands from irl_robotics (leader arm)"""
        self.target_pose = msg
        self.get_logger().debug(f"📥 Received pose command: pos=({msg.pose.position.x:.3f}, {msg.pose.position.y:.3f}, {msg.pose.position.z:.3f})")
    
    def gripper_callback(self, msg: Bool):
        """Handle gripper commands from phospho"""
        self.target_gripper_open = msg.data
        self.get_logger().debug(f"🤏 Received gripper command: {'Open' if msg.data else 'Closed'}")
    
    def joint_state_callback(self, msg: JointState):
        """Update current joint positions (follower arm)"""
        if len(msg.position) >= len(self.joint_names):
            self.current_joint_positions = list(msg.position)
    
    def compute_forward_kinematics(self, joint_positions: List[float]) -> Optional[PoseStamped]:
        """Compute forward kinematics for SO-ARM101 from joint positions"""
        # This is a simplified FK implementation
        # For production, you'd want to use a proper FK solver
        
        try:
            # Extract joint angles
            base_rotation, shoulder_pitch, elbow_angle, wrist_pitch, wrist_roll, gripper_angle = joint_positions
            
            # Simplified forward kinematics (approximate)
            # This is a basic implementation - you may need to tune these parameters
            
            # Base position (assuming robot is at origin)
            x = 0.0
            y = 0.0
            z = 0.0
            
            # Apply joint transformations (simplified)
            # Base rotation affects x and y
            x += 0.2 * math.cos(base_rotation)
            y += 0.2 * math.sin(base_rotation)
            
            # Shoulder pitch affects z and forward reach
            forward_reach = 0.2 * math.cos(shoulder_pitch)
            z += 0.1 + 0.2 * math.sin(shoulder_pitch)
            
            # Elbow affects forward reach
            forward_reach += 0.15 * math.cos(elbow_angle)
            
            # Apply base rotation to forward reach
            x += forward_reach * math.cos(base_rotation)
            y += forward_reach * math.sin(base_rotation)
            
            # Create pose message
            pose = PoseStamped()
            pose.header.stamp = self.get_clock().now().to_msg()
            pose.header.frame_id = 'base_link'
            pose.pose.position.x = x
            pose.pose.position.y = y
            pose.pose.position.z = z
            
            # Convert joint angles to quaternion (simplified)
            # This is a very basic conversion - you'd want proper quaternion math
            pose.pose.orientation.w = 1.0
            pose.pose.orientation.x = 0.0
            pose.pose.orientation.y = 0.0
            pose.pose.orientation.z = 0.0
            
            return pose
            
        except Exception as e:
            self.get_logger().warn(f"❌ FK computation failed: {e}")
            return None
    
    def compute_velocity_command(self, current_pose: PoseStamped, target_pose: PoseStamped) -> Twist:
        """Compute velocity command to move from current to target pose"""
        twist = Twist()
        
        # Position error
        pos_error_x = target_pose.pose.position.x - current_pose.pose.position.x
        pos_error_y = target_pose.pose.position.y - current_pose.pose.position.y
        pos_error_z = target_pose.pose.position.z - current_pose.pose.position.z
        
        # Simple proportional control for linear velocity
        kp_linear = 0.5
        twist.linear.x = np.clip(pos_error_x * kp_linear, -self.max_linear_velocity, self.max_linear_velocity)
        twist.linear.y = np.clip(pos_error_y * kp_linear, -self.max_linear_velocity, self.max_linear_velocity)
        twist.linear.z = np.clip(pos_error_z * kp_linear, -self.max_linear_velocity, self.max_linear_velocity)
        
        # Angular velocity (simplified)
        twist.angular.x = 0.0
        twist.angular.y = 0.0
        twist.angular.z = 0.0
        
        return twist
    
    def control_loop(self):
        """Main control loop - convert pose commands to robot commands"""
        if self.target_pose is None:
            return
        
        try:
            # Compute current end-effector pose from joint positions
            current_pose = self.compute_forward_kinematics(self.current_joint_positions)
            
            if current_pose is None:
                return
            
            # Publish target pose command
            self.pose_command_pub.publish(self.target_pose)
            
            # Compute and publish velocity command
            velocity_command = self.compute_velocity_command(current_pose, self.target_pose)
            self.twist_command_pub.publish(velocity_command)
            
            # Publish gripper command
            gripper_command = Bool()
            gripper_command.data = self.target_gripper_open
            self.gripper_command_pub.publish(gripper_command)
            
            self.get_logger().debug(f"📤 Published robot commands: pos=({self.target_pose.pose.position.x:.3f}, {self.target_pose.pose.position.y:.3f}, {self.target_pose.pose.position.z:.3f}), gripper={'Open' if self.target_gripper_open else 'Closed'}")
            
        except Exception as e:
            self.get_logger().error(f"❌ Control loop error: {e}")

def main():
    rclpy.init()
    
    try:
        controller = PhosphoLeaderController()
        rclpy.spin(controller)
    except KeyboardInterrupt:
        print("\nShutting down irl_robotics leader controller...")
    finally:
        rclpy.shutdown()

if __name__ == '__main__':
    main() 