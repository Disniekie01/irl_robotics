#!/usr/bin/env python3

import asyncio
import websockets
import json
import time

class PhosphoTestServer:
    def __init__(self):
        self.clients = set()
        self.command_count = 0
        
    async def handle_client(self, websocket):
        """Handle WebSocket client connection"""
        self.clients.add(websocket)
        client_id = id(websocket)
        print(f"🔗 Client {client_id} connected")
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    self.command_count += 1
                    
                    print(f"📥 Received command #{self.command_count} from client {client_id}:")
                    print(f"   Position: ({data.get('x', 0):.2f}, {data.get('y', 0):.2f}, {data.get('z', 0):.2f})")
                    print(f"   Rotation: ({data.get('rx', 0):.1f}°, {data.get('ry', 0):.1f}°, {data.get('rz', 0):.1f}°)")
                    print(f"   Gripper: {'Open' if data.get('open', 1) == 1 else 'Closed'}")
                    print(f"   Source: {data.get('source', 'unknown')}")
                    
                    # Send status response
                    response = {
                        "nb_actions_received": self.command_count,
                        "is_object_gripped": data.get('open', 1) == 0,
                        "is_object_gripped_source": data.get('source', 'left')
                    }
                    
                    await websocket.send(json.dumps(response))
                    print(f"📤 Sent response: {response}")
                    
                except json.JSONDecodeError as e:
                    error_msg = {"error": f"JSON decode error: {str(e)}"}
                    await websocket.send(json.dumps(error_msg))
                    print(f"❌ JSON decode error: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            print(f"🔌 Client {client_id} disconnected")
        finally:
            self.clients.remove(websocket)

async def main():
    """Start the irl_robotics test server"""
    server = PhosphoTestServer()
    
    print("🚀 Starting IRL Robotics Test Server")
    print("📡 WebSocket endpoint: ws://localhost:8765/move/teleop/ws")
    print("🎮 Ready to receive teleoperation commands...")
    print("=" * 50)
    
    async with websockets.serve(server.handle_client, "localhost", 8765):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⏹️ Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}") 