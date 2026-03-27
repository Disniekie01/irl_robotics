"""
Dashboard stats endpoint.
Aggregates system-wide metrics for the dashboard widget grid.
"""

import os
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel

from irl_robotics.utils import get_home_app_path

router = APIRouter(prefix="/dash", tags=["dashboard"])


class DatasetStats(BaseModel):
    total_local: int = 0
    total_pushed: int = 0
    total_episodes: int = 0
    disk_usage_mb: float = 0.0


class MacroStats(BaseModel):
    total: int = 0


class SkillGraphStats(BaseModel):
    total: int = 0


class ActivityItem(BaseModel):
    timestamp: float
    event: str
    detail: str


class DashboardStats(BaseModel):
    uptime_s: float = 0.0
    dataset_stats: DatasetStats = DatasetStats()
    macro_stats: MacroStats = MacroStats()
    skill_graph_stats: SkillGraphStats = SkillGraphStats()
    recent_activity: List[ActivityItem] = []


_start_time = time.time()
_activity_log: List[ActivityItem] = []
MAX_ACTIVITY = 50


def log_activity(event: str, detail: str = "") -> None:
    _activity_log.insert(0, ActivityItem(
        timestamp=time.time(), event=event, detail=detail
    ))
    if len(_activity_log) > MAX_ACTIVITY:
        _activity_log.pop()


def _dir_size_mb(path: Path) -> float:
    total = 0
    try:
        for f in path.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    except Exception:
        pass
    return round(total / (1024 * 1024), 1)


def _count_episodes(datasets_path: Path) -> int:
    count = 0
    try:
        for d in datasets_path.iterdir():
            if d.is_dir():
                meta = d / "meta"
                if meta.is_dir():
                    count += sum(1 for _ in meta.glob("episode_*.json"))
                else:
                    # Fallback: count episode_* dirs
                    count += sum(1 for x in d.iterdir() if x.is_dir() and x.name.startswith("episode"))
    except Exception:
        pass
    return count


@router.get("/stats", response_model=DashboardStats)
async def get_stats() -> DashboardStats:
    home = get_home_app_path()

    # Datasets
    datasets_dir = home / "datasets"
    local_count = 0
    if datasets_dir.exists():
        local_count = sum(1 for d in datasets_dir.iterdir() if d.is_dir())
    total_episodes = _count_episodes(datasets_dir) if datasets_dir.exists() else 0
    disk_mb = _dir_size_mb(datasets_dir) if datasets_dir.exists() else 0.0

    # Macros
    macros_dir = home / "macros"
    macro_count = 0
    if macros_dir.exists():
        macro_count = sum(1 for f in macros_dir.glob("*.json"))

    # Skill graphs
    graphs_dir = home / "skill_graphs"
    graph_count = 0
    if graphs_dir.exists():
        graph_count = sum(1 for f in graphs_dir.glob("*.json"))

    return DashboardStats(
        uptime_s=round(time.time() - _start_time, 1),
        dataset_stats=DatasetStats(
            total_local=local_count,
            total_episodes=total_episodes,
            disk_usage_mb=disk_mb,
        ),
        macro_stats=MacroStats(total=macro_count),
        skill_graph_stats=SkillGraphStats(total=graph_count),
        recent_activity=_activity_log[:20],
    )
