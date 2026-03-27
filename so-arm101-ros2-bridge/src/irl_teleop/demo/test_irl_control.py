#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from geometry_msgs.msg import PoseStamped, Twist
from std_msgs.msg import Bool
import time

class PhosphoIsaacSimTester(Node):
    def __init__(self):
        super().__init__('phospho_isaac_sim_tester')
        
        # Subscribe to Isaac Sim topics
        self.joint_sub = self.create_subscription(
            JointState, '/joint_states', self.joint_callback, 10)
        self.twist_sub = self.create_subscription(
            Twist, '/robot/cmd_vel', self.twist_callback, 10)  # Changed from /robot/cmd_pose to /robot/cmd_vel
        self.gripper_sub = self.create_subscription(
            Bool, '/robot/gripper', self.gripper_callback, 10)
        
        # Test parameters
        self.joint_received = False
        self.twist_received = False
        self.gripper_received = False
        self.test_start_time = time.time()
        
        self.get_logger().info("🧪 IRL Robotics Isaac Sim Tester started")
        self.get_logger().info("📡 Monitoring Isaac Sim topics:")
        self.get_logger().info("   - /joint_states")
        self.get_logger().info("   - /robot/cmd_vel")  # Changed from /robot/cmd_pose to /robot/cmd_vel
        self.get_logger().info("   - /robot/gripper")
        
    def joint_callback(self, msg: JointState):
        """Handle joint state messages"""
        self.joint_received = True
        joint_names = ', '.join(msg.name) if msg.name else 'unnamed'
        joint_positions = [f'{p:.3f}' for p in msg.position]
        self.get_logger().info(f"✅ Received joint states: {joint_names} = {joint_positions}")
        self.check_test_status()
    
    def twist_callback(self, msg: Twist):
        """Handle twist messages"""
        self.twist_received = True
        self.get_logger().info(f"✅ Received twist command: linear=({msg.linear.x:.3f}, {msg.linear.y:.3f}, {msg.linear.z:.3f})")
        self.check_test_status()
    
    def gripper_callback(self, msg: Bool):
        """Handle gripper messages"""
        self.gripper_received = True
        self.get_logger().info(f"✅ Received gripper command: {'Open' if msg.data else 'Closed'}")
        self.check_test_status()
    
    def check_test_status(self):
        """Check if all expected messages have been received"""
        elapsed_time = time.time() - self.test_start_time
        
        if self.joint_received and self.twist_received and self.gripper_received:
            self.get_logger().info("🎉 SUCCESS: All Isaac Sim topics are working!")
            self.get_logger().info("✅ IRL Robotics HTTP teleop is properly controlling Isaac Sim")
            rclpy.shutdown()
        elif elapsed_time > 30.0:  # 30 second timeout
            self.get_logger().error("❌ TIMEOUT: Not all expected messages received")
            self.get_logger().error(f"   Joint states received: {self.joint_received}")
            self.get_logger().error(f"   Twist received: {self.twist_received}")
            self.get_logger().error(f"   Gripper received: {self.gripper_received}")
            rclpy.shutdown()

def main():
    rclpy.init()
    
    try:
        tester = PhosphoIsaacSimTester()
        rclpy.spin(tester)
    except KeyboardInterrupt:
        print("\nShutting down irl_robotics Isaac Sim tester...")
    finally:
        rclpy.shutdown()

if __name__ == '__main__':
    main() 