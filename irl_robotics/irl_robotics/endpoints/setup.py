"""
Motor setup endpoints for configuring and calibrating SO-100/SO-101 motors.

Provides a standalone serial bus connection (independent of the robot connection manager)
for motor ID assignment, scanning, and EEPROM limit configuration.
"""

import asyncio
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, Field

from irl_robotics.hardware.motors.feetech import FeetechMotorsBus, SCS_SERIES_CONTROL_TABLE

router = APIRouter()

SO101_MOTOR_NAMES = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]

SO101_DEFAULT_IDS = {
    "shoulder_pan": 1,
    "shoulder_lift": 2,
    "elbow_flex": 3,
    "wrist_flex": 4,
    "wrist_roll": 5,
    "gripper": 6,
}

_setup_bus: Optional[FeetechMotorsBus] = None
_setup_bus_lock = asyncio.Lock()


# --- Pydantic models ---

class SetupConnectRequest(BaseModel):
    port: str = Field(..., description="Serial port path (e.g. COM3, /dev/ttyACM0)")


class SetupConnectResponse(BaseModel):
    status: str
    port: str


class ScanMotorsRequest(BaseModel):
    from_id: int = Field(default=0, ge=0, le=252)
    to_id: int = Field(default=10, ge=0, le=252)


class ScanMotorsResponse(BaseModel):
    found_ids: List[int]


class SetMotorIdRequest(BaseModel):
    from_id: int = Field(..., ge=0, le=252)
    to_id: int = Field(..., ge=0, le=252)


class SetMotorIdResponse(BaseModel):
    status: str
    old_id: int
    new_id: int


class MotorEepromLimits(BaseModel):
    motor_id: int
    min_angle_limit: int
    max_angle_limit: int


class ReadEepromLimitsRequest(BaseModel):
    motor_ids: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6])


class ReadEepromLimitsResponse(BaseModel):
    limits: List[MotorEepromLimits]


class WriteEepromLimitsRequest(BaseModel):
    motor_id: int = Field(..., ge=0, le=252)
    min_angle_limit: int = Field(default=0, ge=0, le=4095)
    max_angle_limit: int = Field(default=4095, ge=0, le=4095)


class WriteEepromLimitsResponse(BaseModel):
    status: str
    motor_id: int
    min_angle_limit: int
    max_angle_limit: int


class UnlockAllLimitsRequest(BaseModel):
    motor_ids: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6])


class ReadMotorPositionRequest(BaseModel):
    motor_ids: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6])


class MotorPosition(BaseModel):
    motor_id: int
    position: int


class ReadMotorPositionResponse(BaseModel):
    positions: List[MotorPosition]


class RecordLimitsStartRequest(BaseModel):
    motor_ids: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6])


_recorded_limits: Dict[int, Dict[str, int]] = {}
_recording_active: bool = False


def _get_bus() -> FeetechMotorsBus:
    if _setup_bus is None or not _setup_bus.is_connected:
        raise HTTPException(status_code=400, detail="Setup bus not connected. Call POST /setup/connect first.")
    return _setup_bus


def _make_single_motor_bus(port: str, motor_id: int) -> FeetechMotorsBus:
    """Create a temporary FeetechMotorsBus for a single motor at the given ID."""
    return FeetechMotorsBus(
        port=port,
        motors={"motor": (motor_id, "sts3215")},
    )


# --- Endpoints ---

@router.post("/setup/connect", response_model=SetupConnectResponse)
async def setup_connect(request: SetupConnectRequest) -> SetupConnectResponse:
    """Connect the standalone setup bus to a serial port."""
    global _setup_bus
    async with _setup_bus_lock:
        if _setup_bus is not None and _setup_bus.is_connected:
            try:
                _setup_bus.disconnect()
            except Exception:
                pass
            _setup_bus = None

        try:
            bus = FeetechMotorsBus(
                port=request.port,
                motors={"probe": (1, "sts3215")},
            )
            bus.connect()
            _setup_bus = bus
            logger.info(f"Setup bus connected on {request.port}")
            return SetupConnectResponse(status="connected", port=request.port)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to connect: {e}")


@router.post("/setup/disconnect", response_model=SetupConnectResponse)
async def setup_disconnect() -> SetupConnectResponse:
    """Disconnect the standalone setup bus."""
    global _setup_bus
    async with _setup_bus_lock:
        if _setup_bus is None:
            return SetupConnectResponse(status="disconnected", port="")
        port = _setup_bus.port
        try:
            _setup_bus.disconnect()
        except Exception:
            pass
        _setup_bus = None
        logger.info(f"Setup bus disconnected from {port}")
        return SetupConnectResponse(status="disconnected", port=port)


@router.post("/setup/scan", response_model=ScanMotorsResponse)
async def scan_motors(request: ScanMotorsRequest) -> ScanMotorsResponse:
    """Scan a range of motor IDs to find connected motors."""
    bus = _get_bus()
    if request.from_id > request.to_id:
        raise HTTPException(status_code=400, detail="from_id must be <= to_id")

    found: List[int] = []
    for motor_id in range(request.from_id, request.to_id + 1):
        try:
            result = bus.read_with_motor_ids(
                ["sts3215"], [motor_id], "ID", num_retry=2
            )
            if result is not None and len(result) > 0 and result[0] == motor_id:
                found.append(motor_id)
        except (ConnectionError, Exception):
            continue

    logger.info(f"Motor scan [{request.from_id}-{request.to_id}]: found {found}")
    return ScanMotorsResponse(found_ids=found)


@router.post("/setup/set-motor-id", response_model=SetMotorIdResponse)
async def set_motor_id(request: SetMotorIdRequest) -> SetMotorIdResponse:
    """Change a motor's ID from from_id to to_id."""
    bus = _get_bus()

    # Verify the motor at from_id exists
    try:
        result = bus.read_with_motor_ids(
            ["sts3215"], [request.from_id], "ID", num_retry=3
        )
        if result is None or len(result) == 0 or result[0] != request.from_id:
            raise HTTPException(status_code=404, detail=f"No motor found at ID {request.from_id}")
    except ConnectionError:
        raise HTTPException(status_code=404, detail=f"No motor found at ID {request.from_id}")

    # Unlock EEPROM, write new ID
    try:
        bus.write_with_motor_ids(["sts3215"], [request.from_id], "Lock", [0])
        bus.write_with_motor_ids(["sts3215"], [request.from_id], "ID", [request.to_id])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set motor ID: {e}")

    # Verify the new ID
    try:
        verify = bus.read_with_motor_ids(
            ["sts3215"], [request.to_id], "ID", num_retry=3
        )
        if verify is None or len(verify) == 0 or verify[0] != request.to_id:
            raise HTTPException(status_code=500, detail="ID was written but verification failed")
    except ConnectionError:
        raise HTTPException(status_code=500, detail="ID was written but could not verify new ID")

    logger.info(f"Motor ID changed: {request.from_id} -> {request.to_id}")
    return SetMotorIdResponse(status="ok", old_id=request.from_id, new_id=request.to_id)


@router.post("/setup/read-eeprom-limits", response_model=ReadEepromLimitsResponse)
async def read_eeprom_limits(request: ReadEepromLimitsRequest) -> ReadEepromLimitsResponse:
    """Read EEPROM angle limits for the specified motor IDs."""
    bus = _get_bus()
    limits: List[MotorEepromLimits] = []

    for motor_id in request.motor_ids:
        try:
            min_val = bus.read_with_motor_ids(
                ["sts3215"], [motor_id], "Min_Angle_Limit", num_retry=3
            )
            max_val = bus.read_with_motor_ids(
                ["sts3215"], [motor_id], "Max_Angle_Limit", num_retry=3
            )
            limits.append(MotorEepromLimits(
                motor_id=motor_id,
                min_angle_limit=int(min_val[0]) if min_val is not None else -1,
                max_angle_limit=int(max_val[0]) if max_val is not None else -1,
            ))
        except (ConnectionError, Exception) as e:
            logger.warning(f"Could not read limits for motor {motor_id}: {e}")
            continue

    return ReadEepromLimitsResponse(limits=limits)


@router.post("/setup/write-eeprom-limits", response_model=WriteEepromLimitsResponse)
async def write_eeprom_limits(request: WriteEepromLimitsRequest) -> WriteEepromLimitsResponse:
    """Write EEPROM angle limits for a single motor."""
    bus = _get_bus()

    try:
        # Unlock EEPROM
        bus.write_with_motor_ids(["sts3215"], [request.motor_id], "Lock", [0])
        # Write limits
        bus.write_with_motor_ids(
            ["sts3215"], [request.motor_id], "Min_Angle_Limit", [request.min_angle_limit]
        )
        bus.write_with_motor_ids(
            ["sts3215"], [request.motor_id], "Max_Angle_Limit", [request.max_angle_limit]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write limits: {e}")

    logger.info(f"EEPROM limits set for motor {request.motor_id}: [{request.min_angle_limit}, {request.max_angle_limit}]")
    return WriteEepromLimitsResponse(
        status="ok",
        motor_id=request.motor_id,
        min_angle_limit=request.min_angle_limit,
        max_angle_limit=request.max_angle_limit,
    )


@router.post("/setup/unlock-all-limits")
async def unlock_all_limits(request: UnlockAllLimitsRequest) -> dict:
    """Set all specified motors to full range (0-4095). Equivalent to set_eeprom_limits.py --write."""
    bus = _get_bus()
    results = []

    for motor_id in request.motor_ids:
        try:
            bus.write_with_motor_ids(["sts3215"], [motor_id], "Lock", [0])
            bus.write_with_motor_ids(["sts3215"], [motor_id], "Min_Angle_Limit", [0])
            bus.write_with_motor_ids(["sts3215"], [motor_id], "Max_Angle_Limit", [4095])
            results.append({"motor_id": motor_id, "status": "ok"})
        except Exception as e:
            results.append({"motor_id": motor_id, "status": "error", "error": str(e)})

    return {"results": results}


@router.post("/setup/read-positions", response_model=ReadMotorPositionResponse)
async def read_motor_positions(request: ReadMotorPositionRequest) -> ReadMotorPositionResponse:
    """Read current positions of motors (for interactive limit recording)."""
    bus = _get_bus()
    positions: List[MotorPosition] = []

    for motor_id in request.motor_ids:
        try:
            pos = bus.read_with_motor_ids(
                ["sts3215"], [motor_id], "Present_Position", num_retry=3
            )
            positions.append(MotorPosition(
                motor_id=motor_id,
                position=int(pos[0]) if pos is not None else -1,
            ))
        except (ConnectionError, Exception) as e:
            logger.warning(f"Could not read position for motor {motor_id}: {e}")
            continue

    return ReadMotorPositionResponse(positions=positions)


@router.post("/setup/record-limits/start")
async def record_limits_start(request: RecordLimitsStartRequest) -> dict:
    """Start recording joint limits. Resets tracked min/max for each motor."""
    global _recorded_limits, _recording_active
    _recorded_limits = {
        mid: {"min": 4095, "max": 0} for mid in request.motor_ids
    }
    _recording_active = True
    return {"status": "recording", "motor_ids": request.motor_ids}


@router.post("/setup/record-limits/sample")
async def record_limits_sample() -> dict:
    """Sample current motor positions and update tracked min/max.
    Call this repeatedly while the user moves joints."""
    global _recorded_limits
    if not _recording_active:
        raise HTTPException(status_code=400, detail="Recording not active. Call /setup/record-limits/start first.")

    bus = _get_bus()
    motor_ids = list(_recorded_limits.keys())

    for motor_id in motor_ids:
        try:
            pos = bus.read_with_motor_ids(
                ["sts3215"], [motor_id], "Present_Position", num_retry=2
            )
            if pos is not None and len(pos) > 0:
                val = int(pos[0])
                if val < _recorded_limits[motor_id]["min"]:
                    _recorded_limits[motor_id]["min"] = val
                if val > _recorded_limits[motor_id]["max"]:
                    _recorded_limits[motor_id]["max"] = val
        except Exception:
            continue

    return {"limits": _recorded_limits}


@router.post("/setup/record-limits/stop")
async def record_limits_stop(write: bool = False) -> dict:
    """Stop recording and optionally write the recorded limits to EEPROM."""
    global _recording_active
    if not _recording_active:
        raise HTTPException(status_code=400, detail="Recording not active.")

    _recording_active = False
    bus = _get_bus()
    results = []

    if write:
        for motor_id, lim in _recorded_limits.items():
            try:
                bus.write_with_motor_ids(["sts3215"], [motor_id], "Lock", [0])
                bus.write_with_motor_ids(["sts3215"], [motor_id], "Min_Angle_Limit", [lim["min"]])
                bus.write_with_motor_ids(["sts3215"], [motor_id], "Max_Angle_Limit", [lim["max"]])
                results.append({"motor_id": motor_id, "status": "ok", **lim})
            except Exception as e:
                results.append({"motor_id": motor_id, "status": "error", "error": str(e)})
    else:
        for motor_id, lim in _recorded_limits.items():
            results.append({"motor_id": motor_id, **lim})

    return {"written": write, "results": results}
