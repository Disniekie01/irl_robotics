#!/usr/bin/env python3
"""
Minimal SO-100 follower server for network leader-follower.

No PyBullet, no auth, no cameras, no Supabase. Only:
  - GET /status
  - WS  /ws/joints?robot_id=0
  - POST /joints/read
  - POST /joints/write
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import sys
import types
from pathlib import Path
from typing import Any, Literal

import msgpack
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from serial.tools import list_ports

# Package root: .../irl_robotics (parent of irl_robotics/ package dir)
_PKG_ROOT = Path(__file__).resolve().parents[1] / "irl_robotics"
if str(_PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(_PKG_ROOT))

_HARDWARE_ROOT = _PKG_ROOT / "irl_robotics" / "hardware"
_MOTORS_ROOT = _HARDWARE_ROOT / "motors"


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Avoid importing irl_robotics.hardware.__init__, which imports PyBullet.
hardware_pkg = types.ModuleType("irl_robotics.hardware")
hardware_pkg.__path__ = [str(_HARDWARE_ROOT)]  # type: ignore[attr-defined]
sys.modules.setdefault("irl_robotics.hardware", hardware_pkg)

motors_pkg = types.ModuleType("irl_robotics.hardware.motors")
motors_pkg.__path__ = [str(_MOTORS_ROOT)]  # type: ignore[attr-defined]
sys.modules.setdefault("irl_robotics.hardware.motors", motors_pkg)

_load_module(
    "irl_robotics.hardware.motors.motor_utils",
    _MOTORS_ROOT / "motor_utils.py",
)
FeetechMotorsBus = _load_module(
    "irl_robotics.hardware.motors.feetech",
    _MOTORS_ROOT / "feetech.py",
).FeetechMotorsBus

RESOLUTION = 4096
MOTORS = {
    "shoulder_pan": [1, "sts3215"],
    "shoulder_lift": [2, "sts3215"],
    "elbow_flex": [3, "sts3215"],
    "wrist_flex": [4, "sts3215"],
    "wrist_roll": [5, "sts3215"],
    "gripper": [6, "sts3215"],
}
SO100_PIDS = {21971, 29987}


class ServoConfig:
    def __init__(
        self,
        offsets: list[float],
        signs: list[float],
        calibration_position: list[float] | None = None,
    ) -> None:
        self.servos_offsets = offsets
        self.servos_offsets_signs = signs
        self.servos_calibration_position = calibration_position or offsets


def _load_servo_config() -> ServoConfig:
    cfg_path = os.environ.get(
        "SO100_CONFIG",
        str(_PKG_ROOT / "resources" / "default" / "so-100-12V.json"),
    )
    if Path(cfg_path).is_file():
        data = json.loads(Path(cfg_path).read_text())
        return ServoConfig(
            offsets=[float(x) for x in data["servos_offsets"]],
            signs=[float(x) for x in data["servos_offsets_signs"]],
            calibration_position=[
                float(x) for x in data.get("servos_calibration_position", [])
            ],
        )
    return ServoConfig(
        offsets=[2048.0] * 6,
        signs=[-1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    )


class MinimalSO100:
    def __init__(self, device: str) -> None:
        self.device_name = device
        self.config = _load_servo_config()
        self.bus: FeetechMotorsBus | None = None
        self.connected = False

    @classmethod
    def from_ports(cls) -> "MinimalSO100":
        for port in list_ports.comports():
            if port.pid in SO100_PIDS:
                return cls(port.device)
        raise RuntimeError("No SO-100 USB adapter found (CH340 / Feetech board)")

    def connect(self) -> None:
        self.bus = FeetechMotorsBus(port=self.device_name, motors=MOTORS)
        self.bus.connect()
        self.bus.write("Torque_Enable", 1)
        self.connected = True

    def disconnect(self) -> None:
        if self.bus is not None:
            try:
                self.bus.disconnect()
            except Exception:
                pass
        self.connected = False

    def _units_to_rad(self, units: np.ndarray) -> np.ndarray:
        n = len(units)
        return (
            (units - np.asarray(self.config.servos_offsets[:n]))
            * np.asarray(self.config.servos_offsets_signs[:n])
            * ((2 * np.pi) / (RESOLUTION - 1))
        )

    def _rad_to_units(self, radians: np.ndarray) -> np.ndarray:
        n = len(radians)
        x = (
            radians
            * np.asarray(self.config.servos_offsets_signs[:n])
            * ((RESOLUTION - 1) / (2 * np.pi))
        ) + np.asarray(self.config.servos_offsets[:n])
        return x.astype(int)

    def read_rad(self) -> list[float]:
        assert self.bus is not None
        names = list(MOTORS.keys())
        raw = self.bus.read("Present_Position", motor_names=names)
        return self._units_to_rad(np.asarray(raw, dtype=float)).tolist()

    def write_rad(self, angles: list[float]) -> list[float]:
        assert self.bus is not None
        arr = np.asarray(angles, dtype=float)
        units = self._rad_to_units(arr)
        names = list(MOTORS.keys())
        self.bus.write(
            "Goal_Position",
            values=units.tolist(),
            motor_names=names[: len(units)],
        )
        return self.read_rad()

    def write_gripper(self, open_command: float) -> None:
        assert self.bus is not None
        open_value = float(np.clip(open_command, 0.0, 1.0))
        open_position = float(self.config.servos_calibration_position[-1])
        close_position = float(self.config.servos_offsets[-1])
        units = int(close_position + (open_position - close_position) * open_value)
        self.bus.write("Goal_Position", values=[units], motor_names=["gripper"])

    def apply_relative_jog(self, request: "MoveAbsoluteRequest") -> list[float]:
        # Minimal fallback for keyboard/gamepad Cartesian teleop. This is not IK;
        # it maps dashboard deltas onto joints so the follower can still be jogged.
        current = np.asarray(self.read_rad(), dtype=float)
        if len(current) < 6:
            current = np.pad(current, (0, 6 - len(current)))

        cm_to_rad = 0.010
        deg_to_rad = np.pi / 180.0 * 0.25

        current[0] += float(request.y or 0.0) * cm_to_rad
        current[1] += float(request.x or 0.0) * cm_to_rad
        current[2] += float(request.z or 0.0) * cm_to_rad
        current[3] += float(request.rx or 0.0) * deg_to_rad
        current[4] += float(request.ry or 0.0) * deg_to_rad
        current[5] += float(request.rz or 0.0) * deg_to_rad

        # Keep commands bounded. This is deliberately conservative for manual jogs.
        current = np.clip(current, -np.pi, np.pi)
        result = self.write_rad(current.tolist())
        if request.open is not None:
            self.write_gripper(request.open)
        return result

    def read_bus_values(self, register: str) -> list[float]:
        assert self.bus is not None
        values = self.bus.read(register, motor_names=list(MOTORS.keys()))
        return np.asarray(values, dtype=float).tolist()


class JointsReadRequest(BaseModel):
    unit: Literal["rad", "motor_units", "degrees"] = "rad"
    source: Literal["robot", "sim"] = "robot"


class JointsWriteRequest(BaseModel):
    angles: list[float]
    unit: Literal["rad", "motor_units", "degrees"] = "rad"


class MoveAbsoluteRequest(BaseModel):
    x: float | None = None
    y: float | None = None
    z: float | None = None
    rx: float | None = None
    ry: float | None = None
    rz: float | None = None
    open: float | None = None


app = FastAPI(title="Minimal SO-100 Follower")
robot: MinimalSO100 | None = None
robot_lock = asyncio.Lock()


async def _get_robot() -> MinimalSO100:
    global robot
    if robot is not None and robot.connected:
        return robot
    bot = MinimalSO100.from_ports()
    await asyncio.to_thread(bot.connect)
    robot = bot
    return bot


@app.on_event("startup")
async def startup() -> None:
    await _get_robot()


@app.on_event("shutdown")
async def shutdown() -> None:
    if robot is not None:
        await asyncio.to_thread(robot.disconnect)


@app.get("/status")
async def status() -> dict[str, Any]:
    try:
        bot = await _get_robot()
        return {
            "status": "ok",
            "connected": bot.connected,
            "robots": [{"id": 0, "name": "so-100", "device_name": bot.device_name}],
        }
    except Exception as exc:
        return {"status": "error", "connected": False, "detail": str(exc)}


@app.post("/joints/read")
async def joints_read(
    request: JointsReadRequest,
    robot_id: int = Query(0),
) -> dict[str, list[float]]:
    if request.unit != "rad":
        raise HTTPException(status_code=400, detail="Only unit=rad supported")
    bot = await _get_robot()
    async with robot_lock:
        return {"angles": await asyncio.to_thread(bot.read_rad)}


@app.post("/joints/write")
async def joints_write(
    request: JointsWriteRequest,
    robot_id: int = Query(0),
) -> dict[str, list[float]]:
    if request.unit != "rad":
        raise HTTPException(status_code=400, detail="Only unit=rad supported")
    bot = await _get_robot()
    async with robot_lock:
        angles = await asyncio.to_thread(bot.write_rad, request.angles)
        return {"angles": angles}


@app.post("/end-effector/read")
async def end_effector_read(robot_id: int = Query(0)) -> dict[str, float]:
    return {"x": 0.0, "y": 0.0, "z": 0.0, "rx": 0.0, "ry": 0.0, "rz": 0.0, "open": 0.0}


@app.post("/move/init")
async def move_init(robot_id: int = Query(0)) -> dict[str, str]:
    # Compatibility endpoint for the host dashboard. The follower should not
    # move on connect; it will follow incoming joint commands.
    await _get_robot()
    return {"status": "success", "message": "minimal follower ready"}


@app.post("/move/absolute")
async def move_absolute(
    request: MoveAbsoluteRequest,
    robot_id: int = Query(0),
) -> dict[str, str]:
    # Compatibility endpoint for dashboard code paths that initialize/read a
    # remote manipulator through Cartesian APIs. Network leader-follower uses
    # /ws/joints for actual motion, so this endpoint intentionally does not
    # attempt inverse kinematics in the minimal follower.
    bot = await _get_robot()
    if request.open is not None:
        async with robot_lock:
            await asyncio.to_thread(bot.write_gripper, request.open)
    return {"status": "success", "message": "minimal follower ignores Cartesian move"}


@app.post("/move/relative")
async def move_relative(
    request: MoveAbsoluteRequest,
    robot_id: int = Query(0),
) -> dict[str, str]:
    bot = await _get_robot()
    async with robot_lock:
        await asyncio.to_thread(bot.apply_relative_jog, request)
    return {"status": "success", "message": "minimal follower joint jog applied"}


@app.post("/torque/toggle")
async def torque_toggle(robot_id: int = Query(0)) -> dict[str, str]:
    bot = await _get_robot()
    if bot.bus is not None:
        await asyncio.to_thread(bot.bus.write, "Torque_Enable", 1)
    return {"status": "success", "message": "torque enabled"}


@app.post("/torque/read")
async def torque_read(robot_id: int = Query(0)) -> dict[str, list[float]]:
    bot = await _get_robot()
    async with robot_lock:
        try:
            values = await asyncio.to_thread(bot.read_bus_values, "Present_Current")
        except Exception:
            values = [0.0] * len(MOTORS)
    return {"current_torque": values}


@app.post("/voltage/read")
async def voltage_read(robot_id: int = Query(0)) -> dict[str, list[float]]:
    bot = await _get_robot()
    async with robot_lock:
        try:
            values = await asyncio.to_thread(bot.read_bus_values, "Present_Voltage")
        except Exception:
            values = [0.0] * len(MOTORS)
    return {"current_voltage": values}


@app.post("/temperature/read")
async def temperature_read(robot_id: int = Query(0)) -> dict[str, list[dict[str, float]]]:
    bot = await _get_robot()
    async with robot_lock:
        try:
            values = await asyncio.to_thread(bot.read_bus_values, "Present_Temperature")
        except Exception:
            values = [0.0] * len(MOTORS)
    return {
        "current_max_Temperature": [
            {"current": float(value), "max": 0.0} for value in values
        ]
    }


@app.websocket("/ws/joints")
async def ws_joints(websocket: WebSocket, robot_id: int = Query(0)) -> None:
    await websocket.accept()
    bot = await _get_robot()
    try:
        while True:
            msg = msgpack.unpackb(await websocket.receive_bytes(), raw=False)
            cmd = msg.get("cmd")
            async with robot_lock:
                if cmd == "read":
                    angles = await asyncio.to_thread(bot.read_rad)
                elif cmd == "write":
                    angles = await asyncio.to_thread(
                        bot.write_rad,
                        [float(x) for x in msg.get("angles", [])],
                    )
                else:
                    await websocket.send_bytes(
                        msgpack.packb({"error": f"unknown cmd: {cmd}"}, use_bin_type=True)
                    )
                    continue
            await websocket.send_bytes(msgpack.packb({"angles": angles}, use_bin_type=True))
    except WebSocketDisconnect:
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8020)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
