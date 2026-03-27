#!/usr/bin/env python3

import unittest
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped
from std_msgs.msg import Bool
import json
import asyncio
import websockets
import time

class TestPhosphoTeleop(Node):
    def __init__(self):
        super().__init__('test_irl_teleop')
        
        # Subscribe to robot control topics
        self.pose_sub = self.create_subscription(
            PoseStamped, '/robot/cmd_pose', self.pose_callback, 10)
        self.gripper_sub = self.create_subscription(
            Bool, '/robot/gripper', self.gripper_callback, 10)
        
        # Test state
        self.received_pose = None
        self.received_gripper = None
        self.pose_count = 0
        self.gripper_count = 0
        
        self.get_logger().info("🧪 IRL Robotics Teleop Test Node started")
    
    def pose_callback(self, msg):
        """Callback for pose commands"""
        self.received_pose = msg
        self.pose_count += 1
        self.get_logger().info(f"📥 Received pose command #{self.pose_count}")
    
    def gripper_callback(self, msg):
        """Callback for gripper commands"""
        self.received_gripper = msg
        self.gripper_count += 1
        self.get_logger().info(f"🤏 Received gripper command #{self.gripper_count}: {msg.data}")
    
    async def test_websocket_connection(self):
        """Test WebSocket connection to phospho"""
        try:
            # Try to connect to irl_robotics WebSocket
            async with websockets.connect('ws://localhost/move/teleop/ws') as websocket:
                self.get_logger().info("✅ WebSocket connection successful")
                
                # Send a test command
                test_command = {
                    "x": 0.1,
                    "y": 0.2,
                    "z": 0.3,
                    "rx": 10.0,
                    "ry": 20.0,
                    "rz": 30.0,
                    "open": 1,
                    "source": "test"
                }
                
                await websocket.send(json.dumps(test_command))
                self.get_logger().info("📤 Sent test command to phospho")
                
                # Wait for response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    self.get_logger().info(f"📥 Received response: {response}")
                except asyncio.TimeoutError:
                    self.get_logger().warn("⏰ No response received (timeout)")
                
                return True
                
        except Exception as e:
            self.get_logger().error(f"❌ WebSocket connection failed: {e}")
            return False
    
    def run_tests(self):
        """Run all tests"""
        self.get_logger().info("🚀 Starting irl_robotics teleop tests...")
        
        # Test 1: Check if topics are being published
        time.sleep(2)  # Wait for nodes to start
        
        if self.pose_count > 0:
            self.get_logger().info("✅ Pose commands are being received")
        else:
            self.get_logger().warn("⚠️ No pose commands received")
        
        if self.gripper_count > 0:
            self.get_logger().info("✅ Gripper commands are being received")
        else:
            self.get_logger().warn("⚠️ No gripper commands received")
        
        # Test 2: WebSocket connection
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            websocket_success = loop.run_until_complete(self.test_websocket_connection())
            loop.close()
            
            if websocket_success:
                self.get_logger().info("✅ WebSocket test passed")
            else:
                self.get_logger().error("❌ WebSocket test failed")
        except Exception as e:
            self.get_logger().error(f"❌ WebSocket test error: {e}")
        
        self.get_logger().info("🏁 Tests completed")

def main():
    rclpy.init()
    
    try:
        test_node = TestPhosphoTeleop()
        test_node.run_tests()
        rclpy.spin_once(test_node, timeout_sec=5.0)
    except KeyboardInterrupt:
        print("\nShutting down test node...")
    finally:
        rclpy.shutdown()

if __name__ == '__main__':
    main() 