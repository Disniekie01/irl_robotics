"""
Skill Graph endpoints.
Save, load, delete, and execute visual skill graphs composed of
macro playback, primitives, delays, conditions, loops, parallel execution, and more.
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel

from irl_robotics.robot import RobotConnectionManager, get_rcm
from irl_robotics.utils import get_home_app_path

router = APIRouter(prefix="/skillgraph", tags=["skillgraph"])

GRAPHS_DIR = get_home_app_path() / "skill_graphs"
GRAPHS_DIR.mkdir(parents=True, exist_ok=True)

_executing = False
_cancel_execution = False
_pause_execution = False
_current_node: Optional[str] = None
_completed_nodes: Set[str] = set()
_error_nodes: Dict[str, str] = {}
_execution_log: List[Dict[str, Any]] = []
_wait_event: Optional[asyncio.Event] = None
_scheduler_task: Optional[asyncio.Task] = None
_scheduler_running = False


class SkillGraphData(BaseModel):
    name: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]


class SkillGraphInfo(BaseModel):
    name: str
    node_count: int
    edge_count: int
    created_at: float
    updated_at: float


class SkillGraphListResponse(BaseModel):
    graphs: List[SkillGraphInfo]


class ExecuteRequest(BaseModel):
    name: str
    robot_id: int = 0


class StatusResponse(BaseModel):
    status: str
    message: str = ""


class ExecutionStatus(BaseModel):
    executing: bool
    paused: bool = False
    current_node: Optional[str] = None
    completed_nodes: List[str] = []
    error_nodes: Dict[str, str] = {}


class ExecutionLogResponse(BaseModel):
    log: List[Dict[str, Any]]


class ScheduleRequest(BaseModel):
    name: str
    robot_id: int = 0
    interval_seconds: float = 60.0


# ── CRUD ──────────────────────────────────────────────────────────────


@router.get("/list", response_model=SkillGraphListResponse)
async def list_graphs() -> SkillGraphListResponse:
    graphs = []
    for f in GRAPHS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            graphs.append(SkillGraphInfo(
                name=data.get("name", f.stem),
                node_count=len(data.get("nodes", [])),
                edge_count=len(data.get("edges", [])),
                created_at=data.get("created_at", 0),
                updated_at=data.get("updated_at", 0),
            ))
        except Exception:
            continue
    graphs.sort(key=lambda g: g.updated_at, reverse=True)
    return SkillGraphListResponse(graphs=graphs)


@router.get("/load/{name}")
async def load_graph(name: str) -> Dict[str, Any]:
    path = GRAPHS_DIR / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Graph '{name}' not found")
    return json.loads(path.read_text())


@router.post("/save", response_model=StatusResponse)
async def save_graph(graph: SkillGraphData) -> StatusResponse:
    if not graph.name.strip():
        raise HTTPException(status_code=400, detail="Graph name cannot be empty")
    path = GRAPHS_DIR / f"{graph.name}.json"
    now = time.time()
    existing = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text())
        except Exception:
            pass
    data = {
        "name": graph.name,
        "nodes": [dict(n) for n in graph.nodes],
        "edges": [dict(e) for e in graph.edges],
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }
    path.write_text(json.dumps(data, indent=2))
    logger.info(f"Skill graph saved: {graph.name} ({len(graph.nodes)} nodes, {len(graph.edges)} edges)")
    return StatusResponse(status="ok", message=f"Graph '{graph.name}' saved")


@router.delete("/delete/{name}", response_model=StatusResponse)
async def delete_graph(name: str) -> StatusResponse:
    path = GRAPHS_DIR / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Graph '{name}' not found")
    path.unlink()
    logger.info(f"Skill graph deleted: {name}")
    return StatusResponse(status="ok", message=f"Graph '{name}' deleted")


# ── Execution control ─────────────────────────────────────────────────


@router.get("/execution-status", response_model=ExecutionStatus)
async def execution_status() -> ExecutionStatus:
    return ExecutionStatus(
        executing=_executing,
        paused=_pause_execution,
        current_node=_current_node,
        completed_nodes=list(_completed_nodes),
        error_nodes=dict(_error_nodes),
    )


@router.get("/execution-log", response_model=ExecutionLogResponse)
async def get_execution_log() -> ExecutionLogResponse:
    return ExecutionLogResponse(log=list(_execution_log))


@router.post("/execute", response_model=StatusResponse)
async def execute_graph(
    req: ExecuteRequest,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> StatusResponse:
    global _executing, _cancel_execution, _pause_execution
    global _current_node, _completed_nodes, _error_nodes, _execution_log, _wait_event

    if _executing:
        raise HTTPException(status_code=400, detail="A graph is already executing")

    path = GRAPHS_DIR / f"{req.name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Graph '{req.name}' not found")

    data = json.loads(path.read_text())
    nodes = {n["id"]: n for n in data.get("nodes", [])}
    edges = data.get("edges", [])

    _executing = True
    _cancel_execution = False
    _pause_execution = False
    _current_node = None
    _completed_nodes = set()
    _error_nodes = {}
    _execution_log = []
    _wait_event = asyncio.Event()

    async def run_graph() -> None:
        global _executing, _current_node
        try:
            await _execute_subgraph(
                node_ids=_find_start_nodes(nodes, edges),
                nodes=nodes,
                edges=edges,
                rcm=rcm,
                robot_id=req.robot_id,
            )
            status = "cancelled" if _cancel_execution else "complete"
            logger.info(f"Graph execution {status}")
        except Exception as e:
            logger.error(f"Graph execution error: {e}")
        finally:
            _executing = False
            _current_node = None

    asyncio.create_task(run_graph())
    return StatusResponse(status="ok", message=f"Executing graph '{req.name}'")


@router.post("/stop", response_model=StatusResponse)
async def stop_execution() -> StatusResponse:
    global _cancel_execution, _wait_event
    if not _executing:
        return StatusResponse(status="ok", message="No graph executing")
    _cancel_execution = True
    if _wait_event:
        _wait_event.set()
    return StatusResponse(status="ok", message="Stopping graph execution")


@router.post("/pause", response_model=StatusResponse)
async def pause_execution() -> StatusResponse:
    global _pause_execution
    if not _executing:
        return StatusResponse(status="ok", message="No graph executing")
    _pause_execution = True
    return StatusResponse(status="ok", message="Execution paused")


@router.post("/resume", response_model=StatusResponse)
async def resume_execution() -> StatusResponse:
    global _pause_execution
    _pause_execution = False
    return StatusResponse(status="ok", message="Execution resumed")


@router.post("/continue", response_model=StatusResponse)
async def continue_wait() -> StatusResponse:
    if _wait_event:
        _wait_event.set()
        return StatusResponse(status="ok", message="Continuing execution")
    return StatusResponse(status="ok", message="No wait in progress")


# ── Webhook / external trigger ────────────────────────────────────────


@router.post("/trigger/{name}", response_model=StatusResponse)
async def trigger_graph(
    name: str,
    robot_id: int = 0,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> StatusResponse:
    """External trigger – same as execute but accessible via a simple URL."""
    return await execute_graph(ExecuteRequest(name=name, robot_id=robot_id), rcm)


# ── Scheduler ─────────────────────────────────────────────────────────


@router.post("/schedule/start", response_model=StatusResponse)
async def start_schedule(
    req: ScheduleRequest,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> StatusResponse:
    global _scheduler_task, _scheduler_running
    if _scheduler_running:
        raise HTTPException(status_code=400, detail="Scheduler already running")

    path = GRAPHS_DIR / f"{req.name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Graph '{req.name}' not found")

    _scheduler_running = True

    async def scheduler_loop() -> None:
        global _scheduler_running
        while _scheduler_running:
            if not _executing:
                try:
                    await execute_graph(ExecuteRequest(name=req.name, robot_id=req.robot_id), rcm)
                except Exception as e:
                    logger.error(f"Scheduled execution failed: {e}")
            await asyncio.sleep(req.interval_seconds)

    _scheduler_task = asyncio.create_task(scheduler_loop())
    return StatusResponse(status="ok", message=f"Scheduled '{req.name}' every {req.interval_seconds}s")


@router.post("/schedule/stop", response_model=StatusResponse)
async def stop_schedule() -> StatusResponse:
    global _scheduler_running, _scheduler_task
    if not _scheduler_running:
        return StatusResponse(status="ok", message="No schedule running")
    _scheduler_running = False
    if _scheduler_task:
        _scheduler_task.cancel()
        _scheduler_task = None
    return StatusResponse(status="ok", message="Schedule stopped")


# ── Execution engine ──────────────────────────────────────────────────


def _find_start_nodes(nodes: Dict[str, Any], edges: List[Dict[str, Any]]) -> List[str]:
    targets = {e.get("target", "") for e in edges}
    start = [nid for nid in nodes if nid not in targets]
    return start or list(nodes.keys())[:1]


def _get_outgoing(
    node_id: str,
    edges: List[Dict[str, Any]],
    handle: Optional[str] = None,
) -> List[str]:
    out: List[str] = []
    for e in edges:
        if e.get("source") != node_id:
            continue
        if handle is not None and e.get("sourceHandle") != handle:
            continue
        tgt = e.get("target")
        if tgt:
            out.append(tgt)
    return out


def _log(node_id: str, node_type: str, status: str, message: str = "") -> None:
    _execution_log.append({
        "timestamp": time.time(),
        "node_id": node_id,
        "node_type": node_type,
        "status": status,
        "message": message,
    })


async def _check_pause() -> None:
    while _pause_execution and not _cancel_execution:
        await asyncio.sleep(0.1)


async def _execute_subgraph(
    node_ids: List[str],
    nodes: Dict[str, Any],
    edges: List[Dict[str, Any]],
    rcm: RobotConnectionManager,
    robot_id: int,
    visited: Optional[Set[str]] = None,
) -> None:
    global _current_node, _cancel_execution

    if visited is None:
        visited = set()

    queue = list(node_ids)

    while queue and not _cancel_execution:
        await _check_pause()

        node_id = queue.pop(0)
        if node_id in visited:
            continue
        visited.add(node_id)

        node = nodes.get(node_id)
        if not node:
            continue

        nd = node.get("data", {})
        ntype = nd.get("nodeType", node.get("type", ""))
        _current_node = node_id
        _log(node_id, ntype, "started")

        try:
            # ── branching nodes (handle their own successor queuing) ──
            if ntype == "conditional":
                result = await _eval_condition(rcm, robot_id, nd)
                branch = "true" if result else "false"
                _completed_nodes.add(node_id)
                _log(node_id, ntype, "completed", f"branch={branch}")
                for nid in _get_outgoing(node_id, edges, handle=branch):
                    if nid not in visited:
                        queue.append(nid)
                continue

            if ntype == "loop":
                count = int(nd.get("count", 1))
                body = _get_outgoing(node_id, edges, handle="loop")
                done = _get_outgoing(node_id, edges, handle="done")
                for i in range(count):
                    if _cancel_execution:
                        break
                    _log(node_id, ntype, "started", f"iteration {i + 1}/{count}")
                    await _execute_subgraph(body, nodes, edges, rcm, robot_id, visited=set())
                _completed_nodes.add(node_id)
                _log(node_id, ntype, "completed", f"{count} iterations")
                for nid in done:
                    if nid not in visited:
                        queue.append(nid)
                continue

            if ntype == "parallel":
                children = _get_outgoing(node_id, edges)
                tasks = [
                    _execute_subgraph([cid], nodes, edges, rcm, robot_id, visited=set())
                    for cid in children if cid not in visited
                ]
                if tasks:
                    await asyncio.gather(*tasks)
                _completed_nodes.add(node_id)
                _log(node_id, ntype, "completed")
                continue

            # ── simple nodes ──────────────────────────────────────────
            if ntype == "macro":
                await _exec_macro(rcm, nd, robot_id)
            elif ntype == "delay":
                await asyncio.sleep(nd.get("seconds", 1.0))
            elif ntype == "home":
                await _go_home(rcm, robot_id)
            elif ntype == "gripper":
                await _gripper(rcm, robot_id, nd.get("action", "close"))
            elif ntype == "moveTo":
                angles = nd.get("angles", [])
                if angles:
                    await _move_to(rcm, robot_id, angles)
            elif ntype == "join":
                pass
            elif ntype == "aiInference":
                await _exec_ai_inference(nd)
            elif ntype == "waitInput":
                await _exec_wait_input(nd)
            elif ntype == "recordSnapshot":
                await _exec_record_snapshot(rcm, nd, robot_id)
            elif ntype == "leaderFollower":
                await _exec_leader_follower(nd)
            elif ntype == "group":
                pass
            else:
                _log(node_id, ntype, "skipped", f"unknown type: {ntype}")

            _completed_nodes.add(node_id)
            _log(node_id, ntype, "completed")

        except Exception as e:
            _error_nodes[node_id] = str(e)
            _log(node_id, ntype, "error", str(e))
            logger.error(f"Node {node_id} ({ntype}) error: {e}")
            policy = nd.get("onError", "continue")
            if policy == "abort":
                _cancel_execution = True
                break
            if policy == "retry":
                visited.discard(node_id)
                queue.insert(0, node_id)
                continue

        for nid in _get_outgoing(node_id, edges):
            if nid not in visited:
                queue.append(nid)


# ── Primitives ────────────────────────────────────────────────────────


async def _exec_macro(rcm: RobotConnectionManager, nd: Dict, robot_id: int) -> None:
    name = nd.get("macroName", "")
    speed = nd.get("speed", 1.0)
    loops = int(nd.get("loops", 1))
    if not name:
        return
    for _ in range(max(1, loops)):
        if _cancel_execution:
            break
        await _play_macro(rcm, name, robot_id, speed)


async def _play_macro(rcm: RobotConnectionManager, name: str, robot_id: int, speed: float) -> None:
    macro_path = get_home_app_path() / "macros" / f"{name}.json"
    if not macro_path.exists():
        logger.warning(f"Macro not found: {name}")
        return
    data = json.loads(macro_path.read_text())
    raw_frames = data.get("frames", [])
    fps = data.get("fps", 30)
    if not raw_frames:
        return

    from irl_robotics.endpoints.macro import _normalize_frames

    frames = _normalize_frames(raw_frames, fps)

    import numpy as np

    robot = await rcm.get_robot(robot_id)
    interp = 4
    for i in range(len(frames) - 1):
        if _cancel_execution:
            break
        await _check_pause()
        curr, nxt = frames[i], frames[i + 1]
        curr_q, nxt_q = np.array(curr["q"]), np.array(nxt["q"])
        delta_t = (nxt["t"] - curr["t"]) / speed
        seg_time = delta_t / interp
        for s in range(interp):
            if _cancel_execution:
                break
            start = time.perf_counter()
            t = s / interp
            robot.set_motors_positions((1 - t) * curr_q + t * nxt_q, enable_gripper=True)
            wait = max(seg_time - (time.perf_counter() - start), 0)
            if wait > 0:
                await asyncio.sleep(wait)
    if frames and not _cancel_execution:
        robot.set_motors_positions(np.array(frames[-1]["q"]), enable_gripper=True)


async def _go_home(rcm: RobotConnectionManager, robot_id: int) -> None:
    import numpy as np

    robot = await rcm.get_robot(robot_id)
    robot.set_motors_positions(np.zeros(6), enable_gripper=True)
    await asyncio.sleep(0.5)


async def _gripper(rcm: RobotConnectionManager, robot_id: int, action: str) -> None:
    robot = await rcm.get_robot(robot_id)
    robot.update_gripper(-0.5 if action == "close" else 0.5)
    await asyncio.sleep(0.3)


async def _move_to(rcm: RobotConnectionManager, robot_id: int, angles: List[float]) -> None:
    import numpy as np

    robot = await rcm.get_robot(robot_id)
    robot.set_motors_positions(np.array(angles), enable_gripper=True)
    await asyncio.sleep(0.5)


async def _eval_condition(rcm: RobotConnectionManager, robot_id: int, nd: Dict) -> bool:
    ctype = nd.get("conditionType", "gripperTorque")
    try:
        robot = await rcm.get_robot(robot_id)
        if ctype == "gripperTorque":
            torque = robot.read_gripper_torque()
            return float(torque) >= float(nd.get("threshold", 50))
        if ctype == "isGripping":
            robot.update_object_gripping_status()
            return robot.is_object_gripped
    except Exception as e:
        logger.error(f"Condition eval error: {e}")
    return False


async def _exec_ai_inference(nd: Dict) -> None:
    steps = int(nd.get("steps", 10))
    logger.info(f"AI Inference: {steps} steps (placeholder)")
    await asyncio.sleep(steps * 0.1)


async def _exec_wait_input(nd: Dict) -> None:
    global _wait_event
    msg = nd.get("message", "Waiting for user input...")
    logger.info(f"Wait for input: {msg}")
    _wait_event = asyncio.Event()
    while not _wait_event.is_set() and not _cancel_execution:
        await asyncio.sleep(0.1)


async def _exec_record_snapshot(rcm: RobotConnectionManager, nd: Dict, robot_id: int) -> None:
    pose_name = nd.get("poseName", f"snapshot_{int(time.time())}")
    robot = await rcm.get_robot(robot_id)
    joints = robot.read_joints_position(unit="rad")
    snap_dir = get_home_app_path() / "snapshots"
    snap_dir.mkdir(parents=True, exist_ok=True)
    (snap_dir / f"{pose_name}.json").write_text(json.dumps({
        "name": pose_name,
        "angles": joints.tolist(),
        "timestamp": time.time(),
    }, indent=2))
    logger.info(f"Recorded snapshot: {pose_name}")


async def _exec_leader_follower(nd: Dict) -> None:
    action = nd.get("action", "start")
    logger.info(f"Leader-follower: {action} (use /move/leader/start|stop directly)")
    await asyncio.sleep(0.3)
