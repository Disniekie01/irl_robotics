"""Demo orchestration: local leader arm + dog-mounted remote follower."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from serial.tools import list_ports

from irl_robotics.endpoints.control import signal_leader_follower, start_leader_follower_loop
from irl_robotics.hardware.base import BaseManipulator
from irl_robotics.hardware.go2 import UnitreeGo2
from irl_robotics.hardware.remote_robot import RemoteRobot
from irl_robotics.hardware.so100 import SO100Hardware
from irl_robotics.leader_follower import RobotPair
from irl_robotics.models import LocalDevice, StatusResponse
from irl_robotics.robot import RobotConnectionManager, get_rcm
from irl_robotics.utils import get_home_app_path, get_local_subnet, scan_network_devices

router = APIRouter(prefix="/demo", tags=["demo"])

ElementState = Literal["ok", "warn", "error", "pending", "unknown"]

DEFAULT_DOG_IP = "10.105.9.173"
DEFAULT_SSH_USER = "unitree"
DEFAULT_DOG_PORT = 8020


class DemoElementStatus(BaseModel):
    id: str
    label: str
    state: ElementState = "unknown"
    message: str = ""
    detail: Optional[str] = None


class DemoCredentialsRequest(BaseModel):
    ssh_host: str = Field(default=DEFAULT_DOG_IP, description="Dog onboard PC IP")
    ssh_user: str = Field(default=DEFAULT_SSH_USER)
    ssh_password: str = Field(..., min_length=1)
    dog_api_port: int = Field(default=DEFAULT_DOG_PORT, ge=1, le=65535)
    preferred_leader_serial: Optional[str] = Field(
        default=None, description="USB serial of local leader arm (optional)"
    )


class DemoCredentialsResponse(BaseModel):
    status: str = "ok"
    message: str
    has_password: bool = True


class DemoDiscoverResponse(BaseModel):
    local_usb_devices: list[LocalDevice]
    local_robots: list[dict[str, Any]]
    suggested_leader_robot_id: Optional[int] = None
    suggested_leader_serial: Optional[str] = None
    dog_ip: str
    dog_api_reachable: bool
    dog_api_status: Optional[dict[str, Any]] = None
    network_devices_count: int = 0
    elements: list[DemoElementStatus]


class DemoStartRequest(BaseModel):
    leader_robot_id: Optional[int] = None
    invert_controls: bool = False


class DemoOrchestrateResponse(BaseModel):
    status: str
    message: str
    leader_robot_id: Optional[int] = None
    follower_robot_id: Optional[int] = None
    elements: list[DemoElementStatus]


class DemoStatusResponse(BaseModel):
    elements: list[DemoElementStatus]
    config: dict[str, Any]
    leader_follower_active: bool
    remote_follower_robot_id: Optional[int] = None
    leader_robot_id: Optional[int] = None


class DemoGo2JointsResponse(BaseModel):
    connected: bool = False
    robot_id: Optional[int] = None
    ip: Optional[str] = None
    joints: dict[str, float] = Field(default_factory=dict)
    message: str = ""


class _DemoState:
    remote_follower_robot_id: Optional[int] = None
    leader_robot_id: Optional[int] = None


def _config_path() -> Path:
    return get_home_app_path() / "demo_config.json"


def _load_config() -> dict[str, Any]:
    path = _config_path()
    if not path.is_file():
        return {
            "ssh_host": DEFAULT_DOG_IP,
            "ssh_user": DEFAULT_SSH_USER,
            "dog_api_port": DEFAULT_DOG_PORT,
            "preferred_leader_serial": None,
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception as e:
        logger.warning(f"Failed to read demo config: {e}")
    return {
        "ssh_host": DEFAULT_DOG_IP,
        "ssh_user": DEFAULT_SSH_USER,
        "dog_api_port": DEFAULT_DOG_PORT,
        "preferred_leader_serial": None,
    }


def _save_config(data: dict[str, Any]) -> None:
    path = _config_path()
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _public_config(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "ssh_host": cfg.get("ssh_host", DEFAULT_DOG_IP),
        "ssh_user": cfg.get("ssh_user", DEFAULT_SSH_USER),
        "dog_api_port": cfg.get("dog_api_port", DEFAULT_DOG_PORT),
        "preferred_leader_serial": cfg.get("preferred_leader_serial"),
        "has_password": bool(cfg.get("ssh_password")),
    }


async def _probe_dog_api(host: str, port: int) -> tuple[bool, Optional[dict[str, Any]], str]:
    url = f"http://{host}:{port}/status"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                return True, response.json(), "Follower API reachable"
            return False, None, f"HTTP {response.status_code}"
    except Exception as e:
        return False, None, str(e)


def _run_ssh(
    cfg: dict[str, Any], remote_command: str, timeout: float = 30.0
) -> tuple[bool, str]:
    password = cfg.get("ssh_password")
    if not password:
        return False, "SSH password not configured. Save credentials on the Demo page."

    host = cfg.get("ssh_host", DEFAULT_DOG_IP)
    user = cfg.get("ssh_user", DEFAULT_SSH_USER)
    sshpass = shutil.which("sshpass")
    if sshpass is None:
        return (
            False,
            "sshpass is not installed on this machine. Install it (e.g. sudo apt install sshpass).",
        )

    env = os.environ.copy()
    env["SSHPASS"] = str(password)
    cmd = [
        sshpass,
        "-e",
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        f"ConnectTimeout={int(min(timeout, 30))}",
        f"{user}@{host}",
        remote_command,
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
        output = (result.stdout or "") + (result.stderr or "")
        if result.returncode == 0:
            return True, output.strip() or "OK"
        return False, output.strip() or f"ssh exited {result.returncode}"
    except subprocess.TimeoutExpired:
        return False, "SSH command timed out"
    except Exception as e:
        return False, str(e)


async def _list_local_usb() -> list[LocalDevice]:
    return [
        LocalDevice(
            name=port.name,
            device=port.device,
            serial_number=port.serial_number,
            pid=port.pid,
            interface=port.interface,
        )
        for port in list_ports.comports()
        if port.pid in (21971, 29987)
    ]


def _is_local_so100(robot: Any) -> bool:
    return isinstance(robot, SO100Hardware) and ":" not in str(
        getattr(robot, "device_name", "")
    )


async def _pick_leader_id(
    rcm: RobotConnectionManager, cfg: dict[str, Any]
) -> tuple[Optional[int], Optional[str], str]:
    robots = await rcm.robots
    preferred = cfg.get("preferred_leader_serial")
    if preferred:
        for idx, robot in enumerate(robots):
            if _is_local_so100(robot) and getattr(robot, "SERIAL_ID", None) == preferred:
                return idx, preferred, f"Using preferred leader {preferred}"

    for idx, robot in enumerate(robots):
        if _is_local_so100(robot):
            serial = getattr(robot, "SERIAL_ID", robot.device_name)
            return idx, serial, f"Auto-selected local leader {serial}"

    return None, None, "No local SO-100 leader arm connected to this server"


async def _find_remote_follower_id(
    rcm: RobotConnectionManager, host: str, port: int
) -> Optional[int]:
    robots = await rcm.robots
    target = f"{host}:{port}"
    for idx, robot in enumerate(robots):
        if isinstance(robot, RemoteRobot) and robot.device_name == target:
            return idx
    if _DemoState.remote_follower_robot_id is not None:
        try:
            robot = await rcm.get_robot(_DemoState.remote_follower_robot_id)
            if isinstance(robot, RemoteRobot):
                return _DemoState.remote_follower_robot_id
        except Exception:
            _DemoState.remote_follower_robot_id = None
    return None


async def _build_elements(
    rcm: RobotConnectionManager, cfg: dict[str, Any]
) -> list[DemoElementStatus]:
    elements: list[DemoElementStatus] = []
    host = str(cfg.get("ssh_host", DEFAULT_DOG_IP))
    port = int(cfg.get("dog_api_port", DEFAULT_DOG_PORT))

    elements.append(
        DemoElementStatus(
            id="local_backend",
            label="Local IRL server",
            state="ok",
            message="Backend is running",
        )
    )

    usb = await _list_local_usb()
    if usb:
        elements.append(
            DemoElementStatus(
                id="local_usb_scan",
                label="Local USB arms",
                state="ok",
                message=f"Found {len(usb)} SO-100 bus(es)",
                detail=", ".join(
                    f"{d.device} ({d.serial_number or 'no serial'})" for d in usb
                ),
            )
        )
    else:
        elements.append(
            DemoElementStatus(
                id="local_usb_scan",
                label="Local USB arms",
                state="warn",
                message="No SO-100 USB adapter detected",
            )
        )

    leader_id, _, leader_msg = await _pick_leader_id(rcm, cfg)
    if leader_id is not None:
        elements.append(
            DemoElementStatus(
                id="local_leader_arm",
                label="Local leader arm",
                state="ok",
                message=leader_msg,
                detail=f"robot_id={leader_id}",
            )
        )
    else:
        elements.append(
            DemoElementStatus(
                id="local_leader_arm",
                label="Local leader arm",
                state="error",
                message=leader_msg,
            )
        )

    dog_ok, _, dog_msg = await _probe_dog_api(host, port)
    elements.append(
        DemoElementStatus(
            id="dog_network",
            label="Dog follower API (network)",
            state="ok" if dog_ok else "warn",
            message=dog_msg if dog_ok else f"Not reachable at {host}:{port}",
            detail=dog_msg if not dog_ok else None,
        )
    )

    if cfg.get("ssh_password"):
        ok, ssh_msg = await asyncio.to_thread(_run_ssh, cfg, "echo connected", 10.0)
        elements.append(
            DemoElementStatus(
                id="dog_ssh",
                label="Dog SSH",
                state="ok" if ok else "error",
                message="SSH OK" if ok else ssh_msg[:200],
            )
        )
    else:
        elements.append(
            DemoElementStatus(
                id="dog_ssh",
                label="Dog SSH",
                state="pending",
                message="Save SSH credentials to enable remote commands",
            )
        )

    elements.append(
        DemoElementStatus(
            id="dog_follower_api",
            label="Dog follower server",
            state="ok" if dog_ok else "error",
            message="API responding" if dog_ok else "Start follower server on dog",
        )
    )

    remote_id = await _find_remote_follower_id(rcm, host, port)
    if remote_id is not None:
        elements.append(
            DemoElementStatus(
                id="remote_follower_registered",
                label="Remote follower in dashboard",
                state="ok",
                message=f"Connected as robot_id={remote_id}",
            )
        )
    else:
        elements.append(
            DemoElementStatus(
                id="remote_follower_registered",
                label="Remote follower in dashboard",
                state="pending",
                message="Not registered yet",
            )
        )

    lf_active = signal_leader_follower.is_in_loop()
    elements.append(
        DemoElementStatus(
            id="leader_follower_active",
            label="Leader–follower demo",
            state="ok" if lf_active else "unknown",
            message="Running" if lf_active else "Stopped",
        )
    )

    go2_id, go2 = await _find_connected_go2(rcm)
    if go2 is not None:
        joints = go2.get_leg_joint_positions_rad()
        elements.append(
            DemoElementStatus(
                id="go2_webrtc",
                label="Unitree Go2 (WebRTC)",
                state="ok" if joints else "warn",
                message="Lowstate streaming" if joints else "Connected, no motor_state yet",
                detail=f"robot_id={go2_id} ip={go2.ip}",
            )
        )
    else:
        elements.append(
            DemoElementStatus(
                id="go2_webrtc",
                label="Unitree Go2 (WebRTC)",
                state="unknown",
                message="Not connected (optional — for 3D dog view)",
            )
        )

    return elements


async def _find_connected_go2(
    rcm: RobotConnectionManager,
) -> tuple[Optional[int], Optional[UnitreeGo2]]:
    robots = await rcm.robots
    for idx, robot in enumerate(robots):
        if isinstance(robot, UnitreeGo2) and robot.is_connected:
            return idx, robot
    return None, None


@router.get("/go2-joints", response_model=DemoGo2JointsResponse)
async def demo_go2_joints(
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> DemoGo2JointsResponse:
    robot_id, go2 = await _find_connected_go2(rcm)
    if go2 is None:
        return DemoGo2JointsResponse(
            connected=False,
            message="No connected Unitree Go2. Add one from Robots and connect via WebRTC.",
        )
    joints = go2.get_leg_joint_positions_rad()
    if joints:
        return DemoGo2JointsResponse(
            connected=True,
            robot_id=robot_id,
            ip=go2.ip,
            joints=joints,
            message="Live lowstate",
        )
    return DemoGo2JointsResponse(
        connected=True,
        robot_id=robot_id,
        ip=go2.ip,
        joints={},
        message="Connected; waiting for lowstate motor data",
    )


@router.get("/status", response_model=DemoStatusResponse)
async def demo_status(rcm: RobotConnectionManager = Depends(get_rcm)) -> DemoStatusResponse:
    cfg = _load_config()
    elements = await _build_elements(rcm, cfg)
    host = str(cfg.get("ssh_host", DEFAULT_DOG_IP))
    port = int(cfg.get("dog_api_port", DEFAULT_DOG_PORT))
    leader_id, _, _ = await _pick_leader_id(rcm, cfg)
    remote_id = await _find_remote_follower_id(rcm, host, port)
    return DemoStatusResponse(
        elements=elements,
        config=_public_config(cfg),
        leader_follower_active=signal_leader_follower.is_in_loop(),
        remote_follower_robot_id=remote_id,
        leader_robot_id=leader_id,
    )


@router.post("/credentials", response_model=DemoCredentialsResponse)
async def save_credentials(request: DemoCredentialsRequest) -> DemoCredentialsResponse:
    data = _load_config()
    data.update(
        {
            "ssh_host": request.ssh_host,
            "ssh_user": request.ssh_user,
            "ssh_password": request.ssh_password,
            "dog_api_port": request.dog_api_port,
            "preferred_leader_serial": request.preferred_leader_serial,
        }
    )
    _save_config(data)
    return DemoCredentialsResponse(
        message="Demo credentials saved locally (demo_config.json, mode 600)",
        has_password=True,
    )


@router.post("/discover", response_model=DemoDiscoverResponse)
async def demo_discover(rcm: RobotConnectionManager = Depends(get_rcm)) -> DemoDiscoverResponse:
    cfg = _load_config()
    host = str(cfg.get("ssh_host", DEFAULT_DOG_IP))
    port = int(cfg.get("dog_api_port", DEFAULT_DOG_PORT))

    usb = await _list_local_usb()
    robots = await rcm.robots
    local_robots = []
    for idx, robot in enumerate(robots):
        local_robots.append(
            {
                "robot_id": idx,
                "name": robot.name,
                "device_name": getattr(robot, "device_name", None),
                "serial_id": getattr(robot, "SERIAL_ID", None),
                "is_local_so100": _is_local_so100(robot),
                "is_remote": isinstance(robot, RemoteRobot),
            }
        )

    leader_id, leader_serial, _ = await _pick_leader_id(rcm, cfg)
    dog_ok, dog_status, _ = await _probe_dog_api(host, port)

    net_count = 0
    subnet = get_local_subnet()
    if subnet:
        try:
            devices = await scan_network_devices(subnet)
            net_count = len(devices)
        except Exception:
            pass

    elements = await _build_elements(rcm, cfg)
    return DemoDiscoverResponse(
        local_usb_devices=usb,
        local_robots=local_robots,
        suggested_leader_robot_id=leader_id,
        suggested_leader_serial=leader_serial,
        dog_ip=host,
        dog_api_reachable=dog_ok,
        dog_api_status=dog_status,
        network_devices_count=net_count,
        elements=elements,
    )


@router.post("/start-dog-server", response_model=StatusResponse)
async def start_dog_server() -> StatusResponse:
    cfg = _load_config()
    host = str(cfg.get("ssh_host", DEFAULT_DOG_IP))
    port = int(cfg.get("dog_api_port", DEFAULT_DOG_PORT))

    ok, _, _ = await _probe_dog_api(host, port)
    if ok:
        return StatusResponse(message=f"Follower API already running at {host}:{port}")

    start_cmd = (
        f"bash -lc '"
        f"if curl -fsS http://127.0.0.1:{port}/status >/dev/null 2>&1; then exit 0; fi; "
        f'if [ -x "$HOME/start_irl_follower_server.sh" ]; then '
        f'nohup "$HOME/start_irl_follower_server.sh" >/tmp/irl_follower.log 2>&1 & sleep 4; '
        f"elif [ -f /opt/irl/src/scripts/minimal_so100_follower_server.py ]; then "
        f'nohup "$HOME/irl_robotics/irl_robotics/.venv/bin/python" '
        f"/opt/irl/src/scripts/minimal_so100_follower_server.py "
        f"--host 0.0.0.0 --port {port} >/tmp/irl_follower.log 2>&1 & sleep 4; "
        f"fi; "
        f"curl -fsS http://127.0.0.1:{port}/status'"
    )

    ssh_ok, ssh_out = await asyncio.to_thread(_run_ssh, cfg, start_cmd, 45.0)
    if not ssh_ok:
        raise HTTPException(status_code=500, detail=f"Failed to start dog server: {ssh_out}")

    ok, _, msg = await _probe_dog_api(host, port)
    if not ok:
        raise HTTPException(
            status_code=500,
            detail=f"SSH succeeded but API still unreachable: {msg}",
        )
    return StatusResponse(message=f"Dog follower server running at {host}:{port}")


@router.post("/connect-remote-follower", response_model=StatusResponse)
async def connect_remote_follower(
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> StatusResponse:
    cfg = _load_config()
    host = str(cfg.get("ssh_host", DEFAULT_DOG_IP))
    port = int(cfg.get("dog_api_port", DEFAULT_DOG_PORT))

    existing = await _find_remote_follower_id(rcm, host, port)
    if existing is not None:
        _DemoState.remote_follower_robot_id = existing
        return StatusResponse(
            message=f"Remote follower already connected as robot_id={existing}"
        )

    ok, _, msg = await _probe_dog_api(host, port)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail=f"Dog follower API not reachable at {host}:{port}: {msg}",
        )

    try:
        robot_id, _ = await rcm.add_connection(
            robot_name="irl_robotics",
            connection_details={
                "ip": host,
                "port": port,
                "robot_id": 0,
                "mode": "ws",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to add remote follower: {e}")

    _DemoState.remote_follower_robot_id = robot_id
    return StatusResponse(
        message=f"Remote follower connected at {host}:{port} as robot_id={robot_id}"
    )


@router.post("/start", response_model=DemoOrchestrateResponse)
async def start_demo(
    request: DemoStartRequest,
    background_tasks: BackgroundTasks,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> DemoOrchestrateResponse:
    if signal_leader_follower.is_in_loop():
        raise HTTPException(
            status_code=400,
            detail="Leader-follower already running. Stop it first from Demo or Control.",
        )

    cfg = _load_config()
    host = str(cfg.get("ssh_host", DEFAULT_DOG_IP))
    port = int(cfg.get("dog_api_port", DEFAULT_DOG_PORT))

    dog_ok, _, dog_msg = await _probe_dog_api(host, port)
    if not dog_ok:
        await start_dog_server()
        dog_ok, _, dog_msg = await _probe_dog_api(host, port)
        if not dog_ok:
            raise HTTPException(status_code=400, detail=f"Dog API unavailable: {dog_msg}")

    follower_id = await _find_remote_follower_id(rcm, host, port)
    if follower_id is None:
        await connect_remote_follower(rcm)
        follower_id = await _find_remote_follower_id(rcm, host, port)
    if follower_id is None:
        raise HTTPException(status_code=400, detail="Could not register remote follower")

    leader_id = request.leader_robot_id
    if leader_id is None:
        leader_id, _, leader_msg = await _pick_leader_id(rcm, cfg)
        if leader_id is None:
            raise HTTPException(status_code=400, detail=leader_msg)

    leader = await rcm.get_robot(leader_id)
    follower = await rcm.get_robot(follower_id)
    valid_types = (BaseManipulator, RemoteRobot)
    if not isinstance(leader, valid_types) or not isinstance(follower, valid_types):
        raise HTTPException(
            status_code=400,
            detail="Leader and follower must be manipulator or remote IRL robots",
        )

    robot_pairs = [RobotPair(leader=leader, follower=follower)]
    signal_leader_follower.start()
    background_tasks.add_task(
        start_leader_follower_loop,
        robot_pairs=robot_pairs,
        control_signal=signal_leader_follower,
        invert_controls=request.invert_controls,
        enable_gravity_compensation=False,
        compensation_values=None,
        enable_haptic_feedback=False,
        haptic_feedback_strength=50,
    )

    _DemoState.leader_robot_id = leader_id
    _DemoState.remote_follower_robot_id = follower_id
    elements = await _build_elements(rcm, cfg)

    return DemoOrchestrateResponse(
        status="ok",
        message="Demo started: local leader controlling dog follower",
        leader_robot_id=leader_id,
        follower_robot_id=follower_id,
        elements=elements,
    )


@router.post("/stop", response_model=StatusResponse)
async def stop_demo() -> StatusResponse:
    if signal_leader_follower.is_in_loop():
        signal_leader_follower.stop()
        return StatusResponse(message="Leader-follower demo stopped")
    return StatusResponse(status="error", message="Leader-follower was not running")
