#!/usr/bin/env python3

import asyncio
import websockets
import json
import time
import sys

async def irl_demo():
    """Demo script to simulate IRL Robotics teleoperation commands"""
    
    # WebSocket URL (test server endpoint)
    websocket_url = "ws://localhost:8765/move/teleop/ws"
    
    print("🎮 IRL Robotics Teleoperation Demo")
    print(f"📡 Connecting to: {websocket_url}")
    print("🚀 Sending demo commands to SO-ARM101 robot...")
    
    try:
        async with websockets.connect(websocket_url) as websocket:
            print("✅ Connected to irl_robotics WebSocket")
            
            # Demo commands sequence
            demo_commands = [
                # Move to home position
                {
                    "x": 0.0,
                    "y": 0.2,
                    "z": 0.1,
                    "rx": 0.0,
                    "ry": 0.0,
                    "rz": 0.0,
                    "open": 1,
                    "source": "demo"
                },
                # Move to pick position
                {
                    "x": 0.1,
                    "y": 0.15,
                    "z": 0.05,
                    "rx": 0.0,
                    "ry": 0.0,
                    "rz": 45.0,
                    "open": 1,
                    "source": "demo"
                },
                # Close gripper
                {
                    "x": 0.1,
                    "y": 0.15,
                    "z": 0.05,
                    "rx": 0.0,
                    "ry": 0.0,
                    "rz": 45.0,
                    "open": 0,
                    "source": "demo"
                },
                # Move to place position
                {
                    "x": -0.1,
                    "y": 0.15,
                    "z": 0.05,
                    "rx": 0.0,
                    "ry": 0.0,
                    "rz": -45.0,
                    "open": 0,
                    "source": "demo"
                },
                # Open gripper
                {
                    "x": -0.1,
                    "y": 0.15,
                    "z": 0.05,
                    "rx": 0.0,
                    "ry": 0.0,
                    "rz": -45.0,
                    "open": 1,
                    "source": "demo"
                },
                # Return to home
                {
                    "x": 0.0,
                    "y": 0.2,
                    "z": 0.1,
                    "rx": 0.0,
                    "ry": 0.0,
                    "rz": 0.0,
                    "open": 1,
                    "source": "demo"
                }
            ]
            
            for i, command in enumerate(demo_commands):
                print(f"\n📤 Sending command {i+1}/{len(demo_commands)}:")
                print(f"   Position: ({command['x']:.2f}, {command['y']:.2f}, {command['z']:.2f})")
                print(f"   Rotation: ({command['rx']:.1f}°, {command['ry']:.1f}°, {command['rz']:.1f}°)")
                print(f"   Gripper: {'Open' if command['open'] == 1 else 'Closed'}")
                
                # Send command
                await websocket.send(json.dumps(command))
                
                # Wait for response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    response_data = json.loads(response)
                    print(f"📥 Response: {response_data}")
                except asyncio.TimeoutError:
                    print("⏰ No response received (timeout)")
                except json.JSONDecodeError:
                    print("⚠️ Invalid JSON response")
                
                # Wait between commands
                await asyncio.sleep(3.0)
            
            print("\n✅ Demo completed successfully!")
            
    except ConnectionRefusedError:
        print("❌ Connection refused. Make sure irl_robotics server is running.")
        print("   Start IRL Robotics teleoperation with: ros2 launch irl_teleop irl_teleop.launch.py")
    except Exception as e:
        print(f"❌ Error: {e}")

def main():
    """Main function"""
    print("🎯 SO-ARM101 IRL Robotics Teleoperation Demo")
    print("=" * 50)
    
    # Check if irl_robotics server is running
    print("🔍 Checking irl_robotics connection...")
    
    try:
        asyncio.run(irl_demo())
    except KeyboardInterrupt:
        print("\n⏹️ Demo interrupted by user")
    except Exception as e:
        print(f"❌ Demo failed: {e}")

if __name__ == "__main__":
    main() 