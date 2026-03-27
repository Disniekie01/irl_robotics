# IRL Robotics VR Client

**This folder only holds TLS certs (and an old copy of `index.html`).**  
The working app — including **`serve.js`**, **`vr-teleop.js`**, and the **mobile “Run teleop test”** UI — lives here:

`IRL-ROBOTICS-MANAGER-haptic/vr-client/` (inside the inner project directory)

Copy `cert.pem` / `key.pem` **into that** `vr-client` if you want HTTPS on `:8443`, then run `node serve.js` there.

---

Standalone WebXR teleoperation client for controlling robots via hand tracking.
Compatible with Apple Vision Pro (visionOS Safari) and Meta Quest Browser.

## How it works

1. Opens a WebXR session with hand tracking
2. Connects to the IRL Robotics server via WebSocket
3. Sends `AppControlData` JSON at ~60Hz with hand position/orientation deltas
4. Pinch gesture (thumb + index finger) controls the gripper

## Quick Start

Serve the files over HTTPS (required for WebXR):

```bash
# Recommended (includes a proxy so the "Phone Test" button works over HTTPS)
cd vr-client
node serve.js

# Using Python
python -m http.server 8443 --bind 0.0.0.0

# Or using Node.js
npx serve .
```

> **Important**: WebXR requires HTTPS in production. For local development,
> `localhost` is allowed without HTTPS. For network access, use a tool like
> `mkcert` to generate local SSL certificates.

Then open `https://<your-ip>:8443` in your headset's browser.

## Configuration

- **Server URL**: WebSocket URL of your IRL Robotics server (default: `ws://localhost:80/move/teleop/ws`)
- **Sensitivity**: Multiplier for hand movement (default: 1.0)
- **Grip threshold**: Pinch distance to trigger gripper close (default: 0.02m)

## Controls

- **Hand tracking**: Move hands to control robot position/orientation
- **Pinch gesture**: Close gripper (thumb + index finger together)
- **R key**: Recalibrate hand origin position
- First frame after entering VR sets the calibration origin

## Coordinate Mapping

- RealityKit/WebXR uses right-handed Y-up coordinates
- The server's `AppControlData.to_robot()` handles the final mapping to robot coordinates
- Z axis is inverted (right-handed to left-handed) to match the existing Unity convention
