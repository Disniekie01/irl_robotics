"""
NVIDIA Isaac Sim launcher and configuration endpoints.
Allows users to configure Isaac Sim install path and USD scene folder,
then launch Isaac Sim or open the scene folder from the dashboard.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from irl_robotics.utils import get_home_app_path

router = APIRouter(prefix="/isaacsim", tags=["isaacsim"])

_CONFIG_FILE = "isaacsim_config.json"


def _config_path() -> Path:
    return get_home_app_path() / _CONFIG_FILE


def _load_config() -> dict:
    path = _config_path()
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return {}
    return {}


def _save_config(data: dict) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


# --- Models ---

class IsaacSimConfig(BaseModel):
    isaac_sim_path: Optional[str] = None
    usd_scene_path: Optional[str] = None


class IsaacSimStatus(BaseModel):
    configured: bool
    isaac_sim_path: Optional[str] = None
    usd_scene_path: Optional[str] = None
    isaac_sim_exists: bool = False
    usd_scene_exists: bool = False
    running: bool = False


class StatusResponse(BaseModel):
    status: str = "ok"
    message: str = ""


# Track the launched process
_isaac_process: Optional[subprocess.Popen] = None


# --- Endpoints ---

@router.get(
    "/config",
    response_model=IsaacSimStatus,
    summary="Get Isaac Sim configuration",
)
async def get_config() -> IsaacSimStatus:
    global _isaac_process
    cfg = _load_config()
    isaac_path = cfg.get("isaac_sim_path", "")
    usd_path = cfg.get("usd_scene_path", "")

    running = False
    if _isaac_process is not None:
        if _isaac_process.poll() is None:
            running = True
        else:
            _isaac_process = None

    return IsaacSimStatus(
        configured=bool(isaac_path),
        isaac_sim_path=isaac_path or None,
        usd_scene_path=usd_path or None,
        isaac_sim_exists=bool(isaac_path and os.path.isdir(isaac_path)),
        usd_scene_exists=bool(usd_path and os.path.isdir(usd_path)),
        running=running,
    )


@router.post(
    "/config",
    response_model=StatusResponse,
    summary="Save Isaac Sim configuration",
)
async def save_config(config: IsaacSimConfig) -> StatusResponse:
    cfg = _load_config()

    if config.isaac_sim_path is not None:
        path = config.isaac_sim_path.strip()
        if path and not os.path.isdir(path):
            raise HTTPException(
                status_code=400,
                detail=f"Isaac Sim directory not found: {path}",
            )
        cfg["isaac_sim_path"] = path

    if config.usd_scene_path is not None:
        path = config.usd_scene_path.strip()
        if path and not os.path.isdir(path):
            raise HTTPException(
                status_code=400,
                detail=f"USD scene directory not found: {path}",
            )
        cfg["usd_scene_path"] = path

    _save_config(cfg)
    logger.info(f"Isaac Sim config saved: {cfg}")
    return StatusResponse(message="Configuration saved")


@router.post(
    "/launch",
    response_model=StatusResponse,
    summary="Launch NVIDIA Isaac Sim",
)
async def launch_isaac_sim() -> StatusResponse:
    global _isaac_process

    if _isaac_process is not None and _isaac_process.poll() is None:
        return StatusResponse(message="Isaac Sim is already running")

    cfg = _load_config()
    isaac_path = cfg.get("isaac_sim_path", "")

    if not isaac_path or not os.path.isdir(isaac_path):
        raise HTTPException(
            status_code=400,
            detail="Isaac Sim path not configured or directory does not exist",
        )

    if sys.platform == "win32":
        exe_candidates = ["isaac-sim.selector.bat", "isaac-sim.selector.exe", "isaac-sim.bat", "isaac-sim.exe", "omni.isaac.sim.bat"]
    else:
        exe_candidates = ["isaac-sim.selector.sh", "isaac-sim.sh", "isaac-sim"]

    exe_path = None
    for candidate in exe_candidates:
        p = os.path.join(isaac_path, candidate)
        if os.path.isfile(p):
            exe_path = p
            break

    if exe_path is None:
        raise HTTPException(
            status_code=400,
            detail=f"Could not find Isaac Sim executable in {isaac_path}. "
                   f"Looked for: {', '.join(exe_candidates)}",
        )

    try:
        _isaac_process = subprocess.Popen(
            [exe_path],
            cwd=isaac_path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.DETACHED_PROCESS if sys.platform == "win32" else 0,
        )
        logger.info(f"Launched Isaac Sim from {exe_path} (PID: {_isaac_process.pid})")
        return StatusResponse(message=f"Isaac Sim launched (PID: {_isaac_process.pid})")
    except Exception as e:
        logger.error(f"Failed to launch Isaac Sim: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to launch: {e}")


@router.post(
    "/open-scene-folder",
    response_model=StatusResponse,
    summary="Open USD scene folder in file explorer",
)
async def open_scene_folder() -> StatusResponse:
    cfg = _load_config()
    usd_path = cfg.get("usd_scene_path", "")

    if not usd_path or not os.path.isdir(usd_path):
        raise HTTPException(
            status_code=400,
            detail="USD scene path not configured or directory does not exist",
        )

    try:
        if sys.platform == "win32":
            os.startfile(usd_path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", usd_path])
        else:
            subprocess.Popen(["xdg-open", usd_path])
        logger.info(f"Opened scene folder: {usd_path}")
        return StatusResponse(message=f"Opened {usd_path}")
    except Exception as e:
        logger.error(f"Failed to open folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {e}")


@router.post(
    "/stop",
    response_model=StatusResponse,
    summary="Stop running Isaac Sim process",
)
async def stop_isaac_sim() -> StatusResponse:
    global _isaac_process

    if _isaac_process is None or _isaac_process.poll() is not None:
        _isaac_process = None
        return StatusResponse(message="Isaac Sim is not running")

    try:
        _isaac_process.terminate()
        _isaac_process.wait(timeout=10)
        logger.info("Isaac Sim process terminated")
    except subprocess.TimeoutExpired:
        _isaac_process.kill()
        logger.warning("Isaac Sim process killed (did not terminate gracefully)")
    except Exception as e:
        logger.error(f"Failed to stop Isaac Sim: {e}")

    _isaac_process = None
    return StatusResponse(message="Isaac Sim stopped")


# --- USD Scene Browser ---

class UsdFileInfo(BaseModel):
    name: str
    path: str
    size_mb: float
    modified: float


class UsdBrowseResponse(BaseModel):
    files: List[UsdFileInfo]
    directory: str


@router.get(
    "/scenes",
    response_model=UsdBrowseResponse,
    summary="Browse USD scene files",
)
async def browse_scenes() -> UsdBrowseResponse:
    cfg = _load_config()
    usd_path = cfg.get("usd_scene_path", "")

    if not usd_path or not os.path.isdir(usd_path):
        return UsdBrowseResponse(files=[], directory=usd_path or "")

    files = []
    usd_extensions = {".usd", ".usda", ".usdc", ".usdz"}
    try:
        for entry in Path(usd_path).rglob("*"):
            if entry.is_file() and entry.suffix.lower() in usd_extensions:
                stat = entry.stat()
                files.append(UsdFileInfo(
                    name=str(entry.relative_to(usd_path)),
                    path=str(entry),
                    size_mb=round(stat.st_size / (1024 * 1024), 2),
                    modified=stat.st_mtime,
                ))
        files.sort(key=lambda f: f.modified, reverse=True)
    except Exception as e:
        logger.warning(f"Failed to browse USD scenes: {e}")

    return UsdBrowseResponse(files=files, directory=usd_path)


class LaunchWithSceneRequest(BaseModel):
    scene_path: str


@router.post(
    "/launch-scene",
    response_model=StatusResponse,
    summary="Launch Isaac Sim with a specific USD scene",
)
async def launch_with_scene(req: LaunchWithSceneRequest) -> StatusResponse:
    global _isaac_process

    if _isaac_process is not None and _isaac_process.poll() is None:
        return StatusResponse(message="Isaac Sim is already running")

    if not os.path.isfile(req.scene_path):
        raise HTTPException(status_code=400, detail=f"Scene file not found: {req.scene_path}")

    cfg = _load_config()
    isaac_path = cfg.get("isaac_sim_path", "")

    if not isaac_path or not os.path.isdir(isaac_path):
        raise HTTPException(status_code=400, detail="Isaac Sim path not configured")

    if sys.platform == "win32":
        exe_candidates = ["isaac-sim.selector.bat", "isaac-sim.selector.exe", "isaac-sim.bat", "isaac-sim.exe"]
    else:
        exe_candidates = ["isaac-sim.selector.sh", "isaac-sim.sh", "isaac-sim"]

    exe_path = None
    for candidate in exe_candidates:
        p = os.path.join(isaac_path, candidate)
        if os.path.isfile(p):
            exe_path = p
            break

    if exe_path is None:
        raise HTTPException(status_code=400, detail="Isaac Sim executable not found")

    try:
        _isaac_process = subprocess.Popen(
            [exe_path, req.scene_path],
            cwd=isaac_path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.DETACHED_PROCESS if sys.platform == "win32" else 0,
        )
        logger.info(f"Launched Isaac Sim with scene {req.scene_path} (PID: {_isaac_process.pid})")
        return StatusResponse(message=f"Isaac Sim launched with {Path(req.scene_path).name}")
    except Exception as e:
        logger.error(f"Failed to launch Isaac Sim: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to launch: {e}")
