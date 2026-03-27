#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, PoseStamped
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool
import asyncio
import websockets
import json
import threading
import time
import math
import numpy as np
from typing import Optional, Dict, Any

class PhosphoTeleopNode(Node):
    def __init__(self):
        super().__init__('irl_teleop_node')
        
        # IRL Robotics WebSocket configuration
        self.websocket_url = "ws://localhost:8020/move/teleop/ws"
        self.websocket = None
        self.is_connected = False
        
        # Robot control publishers
        self.pose_pub = self.create_publisher(PoseStamped, '/robot/cmd_pose', 10)
        self.twist_pub = self.create_publisher(Twist, '/robot/cmd_vel', 10)
        self.gripper_pub = self.create_publisher(Bool, '/robot/gripper', 10)
        
        # Robot state subscribers
        self.joint_state_sub = self.create_subscription(
            JointState, '/joint_states', self.joint_state_callback, 10)
        
        # Robot state tracking
        self.current_joint_positions = [0.0] * 6
        self.current_ee_pose = None
        self.is_gripper_closed = False
        
        # IRL Robotics control state
        self.last_phospho_command = None
        self.command_count = 0
        
        # Control parameters
        self.max_linear_velocity = 0.1  # m/s
        self.max_angular_velocity = 0.5  # rad/s
        self.control_frequency = 50  # Hz
        
        # Start WebSocket connection in a separate thread
        self.websocket_thread = threading.Thread(target=self.run_websocket_loop, daemon=True)
        self.websocket_thread.start()
        
        # Control timer
        self.control_timer = self.create_timer(1.0/self.control_frequency, self.control_loop)
        
        self.get_logger().info("🚀 IRL Robotics Teleoperation Node started")
        self.get_logger().info(f"📡 Connecting to irl_robotics at: {self.websocket_url}")
        self.get_logger().info("🎮 Ready to receive IRL Robotics teleoperation commands")
        
    def joint_state_callback(self, msg: JointState):
        """Update current robot joint positions"""
        if len(msg.position) >= 6:
            self.current_joint_positions = list(msg.position)
            # Compute end-effector pose from joint positions
            self.current_ee_pose = self.compute_forward_kinematics(self.current_joint_positions)
    
    def compute_forward_kinematics(self, joint_positions):
        """Compute end-effector pose from joint positions using DH parameters"""
        # SO-ARM101 DH parameters (approximate - adjust based on actual robot)
        dh_params = [
            # [a, alpha, d, theta_offset]
            [0.0, -math.pi/2, 0.0, 0.0],      # Base to shoulder
            [0.0, math.pi/2, 0.0, 0.0],       # Shoulder to upper arm
            [0.2, 0.0, 0.0, 0.0],             # Upper arm to forearm
            [0.0, -math.pi/2, 0.0, 0.0],      # Forearm to wrist
            [0.0, math.pi/2, 0.0, 0.0],       # Wrist to gripper
        ]
        
        # Use only first 5 joints (exclude gripper)
        joints = joint_positions[:5]
        
        # Start with identity matrix
        T = np.eye(4)
        
        # Apply DH transformations for each joint
        for i, (joint_angle, dh_param) in enumerate(zip(joints, dh_params)):
            a, alpha, d, theta_offset = dh_param
            theta = joint_angle + theta_offset
            
            # DH transformation matrix
            ct = math.cos(theta)
            st = math.sin(theta)
            ca = math.cos(alpha)
            sa = math.sin(alpha)
            
            T_i = np.array([
                [ct, -st*ca, st*sa, a*ct],
                [st, ct*ca, -ct*sa, a*st],
                [0, sa, ca, d],
                [0, 0, 0, 1]
            ])
            
            T = T @ T_i
        
        # Extract position and orientation
        position = T[:3, 3]
        
        # Convert rotation matrix to Euler angles (simplified)
        rx = math.atan2(T[2, 1], T[2, 2])
        ry = math.atan2(-T[2, 0], math.sqrt(T[2, 1]**2 + T[2, 2]**2))
        rz = math.atan2(T[1, 0], T[0, 0])
        
        return {
            'position': position,
            'orientation': [rx, ry, rz]
        }
    
    def euler_to_quaternion(self, rx, ry, rz):
        """Convert Euler angles to quaternion"""
        cy = math.cos(rz * 0.5)
        sy = math.sin(rz * 0.5)
        cp = math.cos(ry * 0.5)
        sp = math.sin(ry * 0.5)
        cr = math.cos(rx * 0.5)
        sr = math.sin(rx * 0.5)

        w = cy * cp * cr + sy * sp * sr
        x = cy * cp * sr - sy * sp * cr
        y = sy * cp * sr + cy * sp * cr
        z = sy * cp * cr - cy * sp * sr
        
        return w, x, y, z
    
    async def websocket_handler(self):
        """Handle WebSocket communication with phospho"""
        try:
            async with websockets.connect(self.websocket_url) as websocket:
                self.websocket = websocket
                self.is_connected = True
                self.get_logger().info("✅ Connected to irl_robotics WebSocket")
                
                # Send initial status
                await self.send_status_update()
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        await self.handle_phospho_command(data)
                    except json.JSONDecodeError as e:
                        error_msg = {"error": f"JSON decode error: {str(e)}"}
                        await websocket.send(json.dumps(error_msg))
                        
        except Exception as e:
            self.get_logger().error(f"WebSocket error: {e}")
        finally:
            self.is_connected = False
            self.websocket = None
            self.get_logger().warn("❌ Disconnected from irl_robotics WebSocket")
    
    async def handle_phospho_command(self, data: Dict[str, Any]):
        """Handle incoming IRL Robotics teleoperation command"""
        try:
            # Extract control data
            x = data.get('x', 0.0)
            y = data.get('y', 0.0)
            z = data.get('z', 0.0)
            rx = math.radians(data.get('rx', 0.0))
            ry = math.radians(data.get('ry', 0.0))
            rz = math.radians(data.get('rz', 0.0))
            open_gripper = data.get('open', 1)
            source = data.get('source', 'left')
            
            # Store command for control loop
            self.last_phospho_command = {
                'position': [x, y, z],
                'orientation': [rx, ry, rz],
                'gripper_open': open_gripper == 1,
                'source': source
            }
            
            self.command_count += 1
            self.get_logger().debug(f"Received irl_robotics command #{self.command_count}: {data}")
            
        except Exception as e:
            self.get_logger().error(f"Error handling irl_robotics command: {e}")
    
    async def send_status_update(self):
        """Send status update to phospho"""
        if not self.is_connected or not self.websocket:
            return
            
        try:
            status = {
                "nb_actions_received": self.command_count,
                "is_object_gripped": not self.is_gripper_closed,
                "is_object_gripped_source": "left"  # Default source
            }
            
            await self.websocket.send(json.dumps(status))
            
        except Exception as e:
            self.get_logger().error(f"Error sending status update: {e}")
    
    def run_websocket_loop(self):
        """Run WebSocket event loop in separate thread"""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        while rclpy.ok():
            try:
                loop.run_until_complete(self.websocket_handler())
            except Exception as e:
                self.get_logger().error(f"WebSocket loop error: {e}")
            
            # Wait before reconnecting
            time.sleep(5)
    
    def control_loop(self):
        """Main control loop - executed at control_frequency"""
        if not self.last_phospho_command:
            return
            
        try:
            # Extract command
            cmd = self.last_phospho_command
            target_pos = cmd['position']
            target_rot = cmd['orientation']
            gripper_open = cmd['gripper_open']
            
            # Create pose command
            pose_msg = PoseStamped()
            pose_msg.header.stamp = self.get_clock().now().to_msg()
            pose_msg.header.frame_id = "base_link"
            
            # Set position
            pose_msg.pose.position.x = target_pos[0]
            pose_msg.pose.position.y = target_pos[1]
            pose_msg.pose.position.z = target_pos[2]
            
            # Set orientation (convert Euler to quaternion)
            w, x, y, z = self.euler_to_quaternion(target_rot[0], target_rot[1], target_rot[2])
            pose_msg.pose.orientation.w = w
            pose_msg.pose.orientation.x = x
            pose_msg.pose.orientation.y = y
            pose_msg.pose.orientation.z = z
            
            # Publish pose command
            self.pose_pub.publish(pose_msg)
            
            # Handle gripper
            if gripper_open != self.is_gripper_closed:
                gripper_msg = Bool()
                gripper_msg.data = gripper_open
                self.gripper_pub.publish(gripper_msg)
                self.is_gripper_closed = not gripper_open
            
            # Send status update periodically
            if self.command_count % 10 == 0:  # Every 10 commands
                asyncio.run_coroutine_threadsafe(
                    self.send_status_update(), 
                    asyncio.get_event_loop()
                )
                
        except Exception as e:
            self.get_logger().error(f"Error in control loop: {e}")

def main():
    rclpy.init()
    
    try:
        node = PhosphoTeleopNode()
        rclpy.spin(node)
    except KeyboardInterrupt:
        print("\nShutting down IRL Robotics teleoperation node...")
    finally:
        rclpy.shutdown()

if __name__ == '__main__':
    main() 