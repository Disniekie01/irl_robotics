"""
GPU monitoring endpoint via nvidia-smi.
"""

import subprocess
import sys
from typing import List, Optional

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel

router = APIRouter(prefix="/gpu", tags=["gpu"])


class GpuInfo(BaseModel):
    index: int
    name: str
    temperature_c: Optional[float] = None
    utilization_pct: Optional[float] = None
    memory_used_mb: Optional[float] = None
    memory_total_mb: Optional[float] = None
    memory_pct: Optional[float] = None
    power_draw_w: Optional[float] = None
    driver_version: Optional[str] = None
    cuda_version: Optional[str] = None


class GpuStatusResponse(BaseModel):
    available: bool
    gpus: List[GpuInfo] = []


def _parse_float(val: str) -> Optional[float]:
    try:
        return float(val.strip())
    except (ValueError, TypeError):
        return None


def _get_cuda_version() -> Optional[str]:
    try:
        result = subprocess.run(
            ["nvidia-smi"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.split("\n"):
            if "CUDA Version" in line:
                parts = line.split("CUDA Version:")
                if len(parts) > 1:
                    return parts[1].strip().rstrip("|").strip()
    except Exception:
        pass
    return None


@router.get("/status", response_model=GpuStatusResponse)
async def gpu_status() -> GpuStatusResponse:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,temperature.gpu,utilization.gpu,"
                "memory.used,memory.total,power.draw,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return GpuStatusResponse(available=False)

        cuda_ver = _get_cuda_version()
        gpus = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 8:
                continue
            mem_used = _parse_float(parts[4])
            mem_total = _parse_float(parts[5])
            mem_pct = round(mem_used / mem_total * 100, 1) if mem_used is not None and mem_total and mem_total > 0 else None
            gpus.append(GpuInfo(
                index=int(parts[0]),
                name=parts[1],
                temperature_c=_parse_float(parts[2]),
                utilization_pct=_parse_float(parts[3]),
                memory_used_mb=mem_used,
                memory_total_mb=mem_total,
                memory_pct=mem_pct,
                power_draw_w=_parse_float(parts[6]),
                driver_version=parts[7],
                cuda_version=cuda_ver,
            ))
        return GpuStatusResponse(available=True, gpus=gpus)
    except FileNotFoundError:
        return GpuStatusResponse(available=False)
    except Exception as e:
        logger.warning(f"GPU status query failed: {e}")
        return GpuStatusResponse(available=False)
