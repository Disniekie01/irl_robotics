#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool
import requests

class IRLHttpTeleop(Node):
    def __init__(self):
        super().__init__('irl_http_teleop')
        
        # Publishers for Isaac Sim integration (matching joint_state_reader pattern)
        self.joint_pub = self.create_publisher(JointState, '/joint_states', 10)
        self.gripper_pub = self.create_publisher(Bool, '/robot/gripper', 10)
        
        # Parameters
        self.declare_parameter('irl_url', 'http://192.168.1.97:8020')
        self.declare_parameter('poll_rate', 0.02)  # 50 Hz for responsive mirroring
        self.declare_parameter('robot_id', 0)
        self.declare_parameter('flip_rotation_for_isaac', False)
        self.declare_parameter('flip_wrist_pitch_for_isaac', False)
        self.declare_parameter('flip_wrist_roll_for_isaac', True)  # default True: SO-100 URDF has origin rpy="0 -3.14 0" so Isaac axis is inverted vs real robot

        # Per-joint offset parameters (radians) - tune each joint to match Isaac Sim
        self.declare_parameter('isaac_rotation_offset_rad', 0.0)
        self.declare_parameter('isaac_pitch_offset_rad', 0.0)
        self.declare_parameter('isaac_elbow_offset_rad', 0.0)
        self.declare_parameter('isaac_wrist_pitch_offset_rad', 0.0)
        self.declare_parameter('isaac_wrist_roll_offset_rad', -2.3562)  # -3pi/4 rad (~-135deg)
        self.declare_parameter('isaac_jaw_offset_rad', 0.0)
        
        self.irl_url = self.get_parameter('irl_url').value
        self.poll_rate = self.get_parameter('poll_rate').value
        self.robot_id = self.get_parameter('robot_id').value
        self.flip_wrist_pitch = self.get_parameter('flip_wrist_pitch_for_isaac').value
        self.flip_wrist_roll = self.get_parameter('flip_wrist_roll_for_isaac').value

        # Read all joint offsets
        self.joint_offsets = [
            self.get_parameter('isaac_rotation_offset_rad').value,
            self.get_parameter('isaac_pitch_offset_rad').value,
            self.get_parameter('isaac_elbow_offset_rad').value,
            self.get_parameter('isaac_wrist_pitch_offset_rad').value,
            self.get_parameter('isaac_wrist_roll_offset_rad').value,
            self.get_parameter('isaac_jaw_offset_rad').value,
        ]
        
        # Reusable HTTP session for connection pooling (avoids TCP handshake each request)
        self.session = requests.Session()
        
        # Robot state tracking
        self.is_gripper_closed = False
        self.poll_count = 0
        self.error_count = 0
        
        # Joint names for SO-100 / SO-ARM101 (same as Humble; Isaac expects these)
        self.joint_names = [
            'Rotation', 'Pitch', 'Elbow', 'Wrist_Pitch', 'Wrist_Roll', 'Jaw'
        ]
        
        # URDF joint limits (min, max) in radians - clamp to these
        self.joint_limits = [
            (-1.6, 1.6),       # Rotation
            (-1.5708, 1.5708), # Pitch
            (-1.6, 1.4),       # Elbow
            (-1.67, 1.67),     # Wrist_Pitch
            (-3.14, 3.14),     # Wrist_Roll
            (-0.21, 1.5),      # Jaw
        ]
        
        # Timer for polling - single fast timer, reads joints directly
        self.timer = self.create_timer(self.poll_rate, self.poll_joints)
        
        self.get_logger().info(f'IRL Robotics HTTP Teleop started at {1.0/self.poll_rate:.0f} Hz')
        self.get_logger().info(f'API: {self.irl_url} | robot_id: {self.robot_id}')
        if self.get_parameter('flip_rotation_for_isaac').value:
            self.get_logger().info('Isaac Sim: Rotation sign flip enabled (negate base joint for USD vs real robot)')
        if self.flip_wrist_roll:
            self.get_logger().info('Isaac Sim: Wrist_Roll (gripper rotate) sign flipped to match real robot')
        for i, name in enumerate(self.joint_names):
            if self.joint_offsets[i] != 0.0:
                self.get_logger().info(f'Isaac Sim: {name} offset = {self.joint_offsets[i]:.4f} rad')
        
    def poll_joints(self):
        """Fast poll: read joints directly and publish to Isaac Sim"""
        try:
            # Re-read all joint offsets so dashboard slider updates take effect in realtime
            self.joint_offsets = [
                self.get_parameter('isaac_rotation_offset_rad').value,
                self.get_parameter('isaac_pitch_offset_rad').value,
                self.get_parameter('isaac_elbow_offset_rad').value,
                self.get_parameter('isaac_wrist_pitch_offset_rad').value,
                self.get_parameter('isaac_wrist_roll_offset_rad').value,
                self.get_parameter('isaac_jaw_offset_rad').value,
            ]
            # Single HTTP request - go straight to /joints/read
            response = self.session.post(
                f"{self.irl_url}/joints/read",
                json={"robot_id": self.robot_id},
                timeout=0.1  # 100ms timeout - fail fast
            )
            
            if response.status_code != 200:
                self.error_count += 1
                if self.error_count % 50 == 1:
                    self.get_logger().warn(f'joints/read returned {response.status_code}')
                return
            
            joint_data = response.json()
            real_joint_angles = joint_data.get('angles', [])
            
            if not real_joint_angles or len(real_joint_angles) < 6:
                return
            
            # Clamp joint angles to URDF limits for Isaac Sim
            clamped = []
            for i, angle in enumerate(real_joint_angles[:6]):
                if angle is None:
                    clamped.append(0.0)
                    continue
                lo, hi = self.joint_limits[i]
                clamped.append(max(lo, min(hi, angle)))
            
            # Optional: flip Rotation (index 0) if Isaac USD joint axis is opposite to /joints/read convention
            if self.get_parameter('flip_rotation_for_isaac').value and len(clamped) > 0:
                clamped[0] = -clamped[0]
            # Optional: flip Wrist_Pitch (index 3) and/or Wrist_Roll (index 4) for Isaac Sim if axes are inverted
            if self.flip_wrist_pitch and len(clamped) > 3:
                clamped[3] = -clamped[3]
            if self.flip_wrist_roll and len(clamped) > 4:
                clamped[4] = -clamped[4]
            # Apply per-joint offsets and re-clamp to URDF limits
            for i in range(min(len(clamped), len(self.joint_offsets))):
                if self.joint_offsets[i] != 0.0:
                    clamped[i] = clamped[i] + self.joint_offsets[i]
                    lo, hi = self.joint_limits[i]
                    clamped[i] = max(lo, min(hi, clamped[i]))
            
            # Publish joint states (same as Humble: SO-100 names)
            joint_state = JointState()
            joint_state.header.stamp = self.get_clock().now().to_msg()
            joint_state.name = self.joint_names
            joint_state.position = clamped
            self.joint_pub.publish(joint_state)
            
            self.poll_count += 1
            self.error_count = 0
            
            # Log only every 5 seconds (at 50Hz that's every 250 cycles)
            if self.poll_count % 250 == 0:
                self.get_logger().info(
                    f'[{self.poll_count}] joints: [{", ".join(f"{a:.2f}" for a in clamped)}]'
                )
                
        except requests.exceptions.Timeout:
            self.error_count += 1
            if self.error_count % 50 == 1:
                self.get_logger().warn(f'HTTP timeout ({self.error_count} errors)')
        except requests.exceptions.ConnectionError:
            self.error_count += 1
            if self.error_count % 50 == 1:
                self.get_logger().warn(f'Connection error - is server running? ({self.error_count} errors)')
        except Exception as e:
            self.error_count += 1
            if self.error_count % 50 == 1:
                self.get_logger().warn(f'Error: {e}')
    
    def destroy_node(self):
        """Clean up HTTP session on shutdown"""
        self.session.close()
        super().destroy_node()

def main(args=None):
    rclpy.init(args=args)
    node = IRLHttpTeleop()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main() 