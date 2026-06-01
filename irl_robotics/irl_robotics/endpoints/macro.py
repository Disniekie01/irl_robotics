import asyncio
import json
import time
from pathlib import Path
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel

from irl_robotics.robot import RobotConnectionManager, get_rcm
from irl_robotics.utils import get_home_app_path

router = APIRouter(prefix="/macro", tags=["macro"])

MACROS_DIR = get_home_app_path() / "macros"
MACROS_DIR.mkdir(parents=True, exist_ok=True)

# Global state for recording and playback
_recording = False
_playing = False
_cancel_playback = False
_recorded_frames: List[dict] = []
_record_task: Optional[asyncio.Task] = None
_play_task: Optional[asyncio.Task] = None
_recording_robot_id: Optional[int] = None
_recording_kind: str = "joint"
_record_start_time: float = 0.0


class MacroInfo(BaseModel):
    name: str
    duration_s: float
    frame_count: int
    joint_count: int
    created_at: float
    type: str = "joint"


class MacroListResponse(BaseModel):
    macros: List[MacroInfo]


class StartRecordRequest(BaseModel):
    name: str
    robot_id: int = 0
    fps: int = 30


class PlayRequest(BaseModel):
    name: str
    robot_id: int = 0
    loop: bool = False
    speed: float = 1.0
    interpolation_factor: int = 4


class StatusResponse(BaseModel):
    status: str
    message: str = ""


def _safe_macro_name(name: str) -> str:
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in name).strip()
    return safe_name or f"macro_{int(time.time())}"


def record_mobile_command(
    robot_id: int,
    x: Optional[float],
    y: Optional[float],
    rz: Optional[float],
) -> None:
    """Record mobile robot drive commands while a mobile macro is active.

    Values are stored in backend units: x/y in meters and rz in radians.
    """
    if (
        not _recording
        or _recording_kind != "mobile"
        or _recording_robot_id != robot_id
    ):
        return

    x_val = float(x or 0.0)
    y_val = float(y or 0.0)
    rz_val = float(rz or 0.0)
    is_stop_command = (
        abs(x_val) < 1e-6 and abs(y_val) < 1e-6 and abs(rz_val) < 1e-6
    )
    if is_stop_command:
        if not _recorded_frames:
            return
        last_frame = _recorded_frames[-1]
        last_was_stop = all(
            abs(float(last_frame.get(axis, 0.0))) < 1e-6 for axis in ("x", "y", "rz")
        )
        if last_was_stop:
            return

    elapsed = time.time() - _record_start_time
    _recorded_frames.append(
        {
            "t": round(elapsed, 4),
            "x": round(x_val, 6),
            "y": round(y_val, 6),
            "rz": round(rz_val, 6),
        }
    )


async def _record_loop(
    rcm: RobotConnectionManager,
    robot_id: int,
    fps: int,
) -> None:
    global _recording, _recorded_frames

    robot = await rcm.get_robot(robot_id)
    interval = 1.0 / fps
    start_time = time.time()
    _recorded_frames = []

    logger.info(f"Macro recording started at {fps} FPS")

    while _recording:
        try:
            positions = robot.read_joints_position(unit="rad", source="robot")
            gripper_val = robot.read_gripper_command()
            elapsed = time.time() - start_time

            _recorded_frames.append(
                {
                    "t": round(elapsed, 4),
                    "q": [round(float(p), 6) for p in positions],
                    "gripper": round(float(gripper_val), 4),
                }
            )
        except Exception as e:
            logger.warning(f"Macro record frame error: {e}")

        await asyncio.sleep(interval)


def _normalize_frames(frames: List[dict], fps: float = 30.0) -> List[dict]:
    """Normalize frames to a consistent format with 't', 'q', and 'gripper' keys.
    Handles both macro-recorded format (t/q/gripper) and auto-saved format (angles).
    """
    if not frames:
        return frames
    first = frames[0]
    if "q" in first and "t" in first:
        return frames
    interval = 1.0 / fps
    return [
        {
            "t": round(i * interval, 4),
            "q": f.get("q", f.get("angles", [])),
            "gripper": f.get("gripper", 1.0),
        }
        for i, f in enumerate(frames)
    ]


async def _play_loop(
    rcm: RobotConnectionManager,
    robot_id: int,
    frames: List[dict],
    loop: bool,
    speed: float,
    interpolation_factor: int = 4,
) -> None:
    global _playing, _cancel_playback

    robot = await rcm.get_robot(robot_id)
    logger.info(
        f"Macro playback started: {len(frames)} frames, speed={speed}x, "
        f"loop={loop}, interpolation={interpolation_factor}"
    )

    try:
        while True:
            for i in range(len(frames) - 1):
                if _cancel_playback:
                    logger.info("Macro playback cancelled")
                    return

                curr = frames[i]
                nxt = frames[i + 1]
                curr_q = np.array(curr["q"])
                nxt_q = np.array(nxt["q"])
                curr_grip = curr.get("gripper", 1.0)
                nxt_grip = nxt.get("gripper", 1.0)

                delta_t = (nxt["t"] - curr["t"]) / speed
                time_per_segment = delta_t / interpolation_factor

                for s in range(interpolation_factor):
                    if _cancel_playback:
                        logger.info("Macro playback cancelled")
                        return

                    start = time.perf_counter()
                    t = s / interpolation_factor

                    interp_q = (1 - t) * curr_q + t * nxt_q
                    interp_grip = (1 - t) * curr_grip + t * nxt_grip

                    robot.set_motors_positions(interp_q, enable_gripper=True)
                    robot.update_gripper(interp_grip)

                    elapsed = time.perf_counter() - start
                    wait = max(time_per_segment - elapsed, 0)
                    if wait > 0:
                        await asyncio.sleep(wait)

            # Play the last frame
            if frames:
                last = frames[-1]
                robot.set_motors_positions(np.array(last["q"]), enable_gripper=True)
                robot.update_gripper(last.get("gripper", 1.0))

            if not loop:
                break

    except Exception as e:
        logger.error(f"Macro playback error: {e}")
    finally:
        _playing = False
        _cancel_playback = False
        logger.info("Macro playback ended")


async def _play_mobile_loop(
    rcm: RobotConnectionManager,
    robot_id: int,
    frames: List[dict],
    loop: bool,
    speed: float,
) -> None:
    global _playing, _cancel_playback

    robot = await rcm.get_robot(robot_id)
    logger.info(
        f"Mobile macro playback started: {len(frames)} frames, speed={speed}x, loop={loop}"
    )

    try:
        while True:
            previous_t = frames[0].get("t", 0.0) if frames else 0.0
            for frame in frames:
                if _cancel_playback:
                    logger.info("Mobile macro playback cancelled")
                    return

                frame_t = float(frame.get("t", previous_t))
                wait = max((frame_t - previous_t) / speed, 0.0)
                if wait > 0:
                    await asyncio.sleep(wait)

                await robot.move_robot_relative(
                    target_position=np.array(
                        [
                            float(frame.get("x", 0.0)),
                            float(frame.get("y", 0.0)),
                            0.0,
                        ]
                    ),
                    target_orientation_rad=np.array(
                        [0.0, 0.0, float(frame.get("rz", 0.0))]
                    ),
                )
                previous_t = frame_t

            if not loop:
                break
    except Exception as e:
        logger.error(f"Mobile macro playback error: {e}")
    finally:
        try:
            await robot.move_robot_relative(
                target_position=np.array([0.0, 0.0, 0.0]),
                target_orientation_rad=np.array([0.0, 0.0, 0.0]),
            )
        except Exception:
            pass
        _playing = False
        _cancel_playback = False
        logger.info("Mobile macro playback ended")


@router.post("/record/start", response_model=StatusResponse)
async def start_recording(
    req: StartRecordRequest,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> StatusResponse:
    global _recording, _record_task, _recorded_frames
    global _recording_robot_id, _recording_kind, _record_start_time

    if _recording:
        raise HTTPException(status_code=400, detail="Already recording a macro.")
    if _playing:
        raise HTTPException(status_code=400, detail="Cannot record while playing.")

    robot = await rcm.get_robot(req.robot_id)
    robot_type = getattr(robot.status(), "robot_type", "manipulator")

    _recording = True
    _recorded_frames = []
    _recording_robot_id = req.robot_id
    _record_start_time = time.time()

    if robot_type == "mobile":
        _recording_kind = "mobile"
        _record_task = None
        logger.info("Mobile macro recording started")
    else:
        _recording_kind = "joint"
        _record_task = asyncio.create_task(_record_loop(rcm, req.robot_id, req.fps))

    return StatusResponse(
        status="ok", message=f"Recording macro '{req.name}' at {req.fps} FPS"
    )


@router.post("/record/stop", response_model=StatusResponse)
async def stop_recording(
    name: Optional[str] = None,
) -> StatusResponse:
    global _recording, _recorded_frames, _record_task
    global _recording_robot_id, _recording_kind

    if not _recording:
        raise HTTPException(status_code=400, detail="Not currently recording.")

    _recording = False

    if _record_task:
        try:
            await asyncio.wait_for(_record_task, timeout=2.0)
        except asyncio.TimeoutError:
            _record_task.cancel()
        _record_task = None

    if len(_recorded_frames) == 0:
        _recording_robot_id = None
        _recording_kind = "joint"
        return StatusResponse(status="error", message="No frames recorded.")

    # Use the name from the start request or override
    macro_name = name or "untitled"
    safe_name = _safe_macro_name(macro_name)

    file_path = MACROS_DIR / f"{safe_name}.json"

    duration = _recorded_frames[-1]["t"] if _recorded_frames else 0
    is_mobile_macro = _recording_kind == "mobile"
    if is_mobile_macro:
        joint_count = 0
    else:
        joint_count = len(_recorded_frames[0]["q"]) if _recorded_frames else 0

    macro_data = {
        "name": safe_name,
        "type": "mobile" if is_mobile_macro else "joint",
        "created_at": time.time(),
        "duration_s": round(duration, 2),
        "frame_count": len(_recorded_frames),
        "joint_count": joint_count,
        "fps": round(len(_recorded_frames) / max(duration, 0.001), 1),
        "frames": _recorded_frames,
    }

    file_path.write_text(json.dumps(macro_data, indent=2))
    _recorded_frames = []
    _recording_robot_id = None
    _recording_kind = "joint"

    logger.info(
        f"Macro saved: {safe_name} ({len(macro_data['frames'])} frames, {duration:.1f}s)"
    )

    return StatusResponse(
        status="ok",
        message=f"Saved '{safe_name}': {macro_data['frame_count']} frames, {duration:.1f}s",
    )


@router.post("/play", response_model=StatusResponse)
async def play_macro(
    req: PlayRequest,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> StatusResponse:
    global _playing, _cancel_playback, _play_task

    if _playing:
        raise HTTPException(status_code=400, detail="Already playing a macro.")
    if _recording:
        raise HTTPException(status_code=400, detail="Cannot play while recording.")

    safe_name = _safe_macro_name(req.name)
    file_path = MACROS_DIR / f"{safe_name}.json"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Macro '{req.name}' not found.")

    macro_data = json.loads(file_path.read_text())
    raw_frames = macro_data.get("frames", [])

    if not raw_frames:
        raise HTTPException(status_code=400, detail="Macro has no frames.")

    macro_type = macro_data.get("type", "joint")
    fps = macro_data.get("fps", 30.0)
    frames = raw_frames if macro_type == "mobile" else _normalize_frames(raw_frames, fps)

    selected_robot_id = req.robot_id
    robot = await rcm.get_robot(selected_robot_id)
    robot_type = getattr(robot.status(), "robot_type", "manipulator")
    if macro_type == "mobile" and robot_type != "mobile":
        for idx, candidate in enumerate(await rcm.robots):
            if getattr(candidate.status(), "robot_type", "manipulator") == "mobile":
                selected_robot_id = idx
                robot = candidate
                robot_type = "mobile"
                break
        else:
            raise HTTPException(
                status_code=400,
                detail="Mobile macros can only play on a mobile robot.",
            )
    if macro_type != "mobile" and robot_type == "mobile":
        for idx, candidate in enumerate(await rcm.robots):
            if getattr(candidate.status(), "robot_type", "manipulator") != "mobile":
                selected_robot_id = idx
                robot = candidate
                robot_type = getattr(candidate.status(), "robot_type", "manipulator")
                break
        else:
            raise HTTPException(
                status_code=400,
                detail="Joint macros can only play on a manipulator.",
            )

    _playing = True
    _cancel_playback = False
    if macro_type == "mobile":
        _play_task = asyncio.create_task(
            _play_mobile_loop(rcm, selected_robot_id, frames, req.loop, req.speed)
        )
    else:
        _play_task = asyncio.create_task(
            _play_loop(
                rcm,
                selected_robot_id,
                frames,
                req.loop,
                req.speed,
                req.interpolation_factor,
            )
        )

    return StatusResponse(
        status="ok",
        message=f"Playing '{req.name}' ({len(frames)} frames, speed={req.speed}x, loop={req.loop})",
    )


@router.post("/stop", response_model=StatusResponse)
async def stop_playback() -> StatusResponse:
    global _cancel_playback

    if not _playing:
        return StatusResponse(status="ok", message="Nothing playing.")

    _cancel_playback = True
    return StatusResponse(status="ok", message="Stopping playback.")


@router.get("/list", response_model=MacroListResponse)
async def list_macros() -> MacroListResponse:
    macros = []

    for f in sorted(MACROS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
            macros.append(
                MacroInfo(
                    name=data.get("name", f.stem),
                    duration_s=data.get("duration_s", 0),
                    frame_count=data.get("frame_count", 0),
                    joint_count=data.get("joint_count", 0),
                    created_at=data.get("created_at", f.stat().st_mtime),
                    type=data.get("type", "joint"),
                )
            )
        except Exception:
            continue

    return MacroListResponse(macros=macros)


@router.delete("/{name}", response_model=StatusResponse)
async def delete_macro(name: str) -> StatusResponse:
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in name).strip()
    file_path = MACROS_DIR / f"{safe_name}.json"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Macro '{name}' not found.")

    file_path.unlink()
    return StatusResponse(status="ok", message=f"Deleted '{name}'.")


@router.get("/status")
async def macro_status() -> dict:
    return {
        "recording": _recording,
        "playing": _playing,
        "recorded_frames": len(_recorded_frames),
        "recording_type": _recording_kind if _recording else None,
    }
