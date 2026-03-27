#!/usr/bin/env python3

import asyncio
import websockets
import json
import time

async def complete_irl_demo():
    """Complete demo showing IRL Robotics teleoperation workflow"""
    
    websocket_url = "ws://localhost:8020/move/teleop/ws"
    
    print("🎮 Complete IRL Robotics Teleoperation Demo")
    print(f"📡 Connecting to: {websocket_url}")
    print("🚀 This will send a sequence of commands to phospho...")
    
    try:
        async with websockets.connect(websocket_url) as websocket:
            print("✅ Connected to irl_robotics WebSocket")
            
            # Demo command sequence
            commands = [
                {
                    "name": "Home Position",
                    "command": {
                        "x": 0.0,
                        "y": 0.2,
                        "z": 0.1,
                        "rx": 0.0,
                        "ry": 0.0,
                        "rz": 0.0,
                        "open": 1,
                        "source": "demo"
                    }
                },
                {
                    "name": "Pick Position",
                    "command": {
                        "x": 0.1,
                        "y": 0.15,
                        "z": 0.05,
                        "rx": 0.0,
                        "ry": 0.0,
                        "rz": 45.0,
                        "open": 1,
                        "source": "demo"
                    }
                },
                {
                    "name": "Close Gripper",
                    "command": {
                        "x": 0.1,
                        "y": 0.15,
                        "z": 0.05,
                        "rx": 0.0,
                        "ry": 0.0,
                        "rz": 45.0,
                        "open": 0,
                        "source": "demo"
                    }
                },
                {
                    "name": "Place Position",
                    "command": {
                        "x": -0.1,
                        "y": 0.15,
                        "z": 0.05,
                        "rx": 0.0,
                        "ry": 0.0,
                        "rz": -45.0,
                        "open": 0,
                        "source": "demo"
                    }
                },
                {
                    "name": "Open Gripper",
                    "command": {
                        "x": -0.1,
                        "y": 0.15,
                        "z": 0.05,
                        "rx": 0.0,
                        "ry": 0.0,
                        "rz": -45.0,
                        "open": 1,
                        "source": "demo"
                    }
                },
                {
                    "name": "Return Home",
                    "command": {
                        "x": 0.0,
                        "y": 0.2,
                        "z": 0.1,
                        "rx": 0.0,
                        "ry": 0.0,
                        "rz": 0.0,
                        "open": 1,
                        "source": "demo"
                    }
                }
            ]
            
            for i, step in enumerate(commands, 1):
                print(f"\n📤 Step {i}/{len(commands)}: {step['name']}")
                print(f"   Position: ({step['command']['x']:.2f}, {step['command']['y']:.2f}, {step['command']['z']:.2f})")
                print(f"   Rotation: ({step['command']['rx']:.1f}°, {step['command']['ry']:.1f}°, {step['command']['rz']:.1f}°)")
                print(f"   Gripper: {'Open' if step['command']['open'] == 1 else 'Closed'}")
                
                # Send command
                await websocket.send(json.dumps(step['command']))
                
                # Wait for response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                    response_data = json.loads(response)
                    print(f"📥 Response: {response_data}")
                except asyncio.TimeoutError:
                    print("⏰ No response received (timeout)")
                except json.JSONDecodeError:
                    print("⚠️ Invalid JSON response")
                
                # Wait between commands
                await asyncio.sleep(2.0)
            
            print("\n✅ Demo completed successfully!")
            print("🎯 IRL Robotics teleoperation is working!")
            
    except ConnectionRefusedError:
        print("❌ Connection refused. Make sure irl_robotics is running on port 8020.")
        print("   Start irl_robotics with: irl_robotics run")
    except Exception as e:
        print(f"❌ Error: {e}")

def main():
    print("🎯 Complete IRL Robotics Teleoperation Demo")
    print("=" * 50)
    print("This demo will send a sequence of robot commands to phospho.")
    print("Make sure irl_robotics is running and you can see the robot responding.")
    print()
    
    try:
        asyncio.run(complete_irl_demo())
    except KeyboardInterrupt:
        print("\n⏹️ Demo interrupted by user")
    except Exception as e:
        print(f"❌ Demo failed: {e}")

if __name__ == "__main__":
    main() 