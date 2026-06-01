import asyncio
import logging
import platform
import socket
import sys
from asyncio import CancelledError
from contextlib import asynccontextmanager
from random import random
from typing import Any, AsyncGenerator, Callable

import sentry_sdk
import typer
import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, applications
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from pydantic import BaseModel
from rich import print

from irl_robotics import __version__
from irl_robotics.camera import AllCameras, get_all_cameras, get_all_cameras_no_init
from irl_robotics.configs import config
from irl_robotics.endpoints import (
    auth_router,
    camera_router,
    chat_router,
    control_router,
    networking_router,
    pages_router,
    recording_router,
    ros2_router,
    training_router,
    local_training_router,
    macro_router,
    dashboard_router,
    gpu_router,
    isaacsim_router,
    setup_router,
    skillgraph_router,
    update_router,
    demo_router,
)
from irl_robotics.endpoints.ros2 import (
    kill_orphan_ros2_bridge_processes,
    shutdown_ros2_bridge_processes,
)
from irl_robotics.hardware import get_sim
from irl_robotics.models import ServerStatus
from irl_robotics.posthog import posthog, posthog_pageview
from irl_robotics.recorder import Recorder, get_recorder
from irl_robotics.robot import RobotConnectionManager, get_rcm
from irl_robotics.teleoperation import get_udp_server
from irl_robotics.types import SimulationMode
from irl_robotics.utils import (
    get_home_app_path,
    get_local_ip,
    get_resources_path,
    login_to_hf,
)


def init_telemetry() -> None:
    """
    This is used for automatic crash reporting.
    """
    from irl_robotics.sentry import init_sentry

    init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Initialize telemetry
    init_telemetry()
    udp_server = get_udp_server()
    # Initialize pybullet simulation
    sim = get_sim()
    # Initialize rcm
    rcm = get_rcm()

    try:
        login_to_hf()
    except Exception as e:
        logger.debug(f"Failed to login to Hugging Face: {e}")

    # Kill ROS2 teleop/relays left from a previous server process (stale PIDs not in our table)
    kill_orphan_ros2_bridge_processes()

    try:
        server_ip = get_local_ip()
        logger.success(
            f"Startup complete. Go to the IRL Robotics dashboard here: http://{server_ip}:{config.PORT}"
        )
        yield
    finally:
        try:
            await shutdown_ros2_bridge_processes()
        except Exception as e:
            logger.warning(f"ROS2 bridge shutdown: {e}")

        udp_server.stop()

        from irl_robotics.endpoints.control import (
            signal_ai_control,
            signal_gravity_control,
            signal_leader_follower,
        )

        if signal_ai_control.is_in_loop():
            signal_ai_control.stop()
            logger.info("AI control signal stopped")
        if signal_gravity_control.is_in_loop():
            signal_gravity_control.stop()
            logger.info("Gravity control signal stopped")
        if signal_leader_follower.is_in_loop():
            signal_leader_follower.stop()
            logger.info("Leader follower control signal stopped")

        cameras = get_all_cameras_no_init()
        if cameras:
            cameras.stop()

        # Cleanup the simulation environment
        del rcm
        del sim
        sentry_sdk.flush(timeout=1)
        posthog.shutdown()


app = FastAPI(lifespan=lifespan)

# Check if "/dist" is not empty and exists
_dist_path = get_resources_path() / "dist"
if (
    not _dist_path.exists()
    or not _dist_path.is_dir()
    or not any(_dist_path.iterdir())
):
    _resources_path = get_resources_path()
    error_message = (
        f"The 'dist' directory does not exist at {_resources_path / 'dist'}. "
        "From the repo root run: make build_frontend "
        "(requires node and npm; copies dashboard/dist to irl_robotics/resources/dist)."
    )
    raise FileNotFoundError(error_message)

# We do this to serve the static files in the frontend
# This is a workaround for when the raspberry pi uses its own hotspot
app.mount("/resources", StaticFiles(directory=get_resources_path()), name="static")
# Mount the directory with your dashboard's production build (adjust the path as needed)
# Mount assets at the root (assuming get_resources_path() contains both index.html and assets)
app.mount(
    "/assets",
    StaticFiles(directory=f"{get_resources_path()}/dist/assets"),
    name="assets",
)
_urdf_path = get_resources_path() / "dist" / "urdf"
if _urdf_path.exists() and _urdf_path.is_dir():
    app.mount("/urdf", StaticFiles(directory=str(_urdf_path)), name="urdf")


@app.get("/dashboard/demo", response_class=HTMLResponse)
async def serve_dashboard_demo_alias() -> HTMLResponse:
    index_path = get_resources_path() / "dist" / "index.html"
    with open(index_path.resolve(), "r") as f:
        content = f.read()
    return HTMLResponse(
        headers={"Content-Type": "text/html; charset=utf-8"}, content=content
    )


app.mount(
    "/dashboard",
    StaticFiles(directory=get_resources_path() / "dist", html=True),
    name="dashboard",
)


def swagger_monkey_patch(*args: Any, **kwargs: Any) -> HTMLResponse:
    posthog_pageview("/docs")
    return get_swagger_ui_html(
        *args,
        **kwargs,
        swagger_js_url="/resources/swagger-ui/swagger-ui-bundle.js",
        swagger_css_url="/resources/swagger-ui/swagger-ui.css",
        swagger_favicon_url="/resources/swagger-ui/favicon.png",
    )


applications.get_swagger_ui_html = swagger_monkey_patch


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.warning(f"HTTPException: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.get("/status", response_model=ServerStatus)
async def status(
    rcm: RobotConnectionManager = Depends(get_rcm),
    cameras: AllCameras = Depends(get_all_cameras),
    recorder: Recorder = Depends(get_recorder),
) -> ServerStatus:
    """
    Get the status of the server.
    """
    from irl_robotics.endpoints.control import (
        signal_ai_control,
        signal_leader_follower,
    )

    robots = await rcm.robots

    robot_names = [robot.name for robot in robots]

    server_status = ServerStatus(
        status="ok",
        name=platform.uname().node,  # Name of the machine
        robots=robot_names,
        robot_status=await rcm.status(),
        cameras=cameras.status(),
        is_recording=recorder.is_recording or recorder.is_saving,
        ai_running_status=signal_ai_control.status,
        leader_follower_status=signal_leader_follower.is_in_loop(),
        server_ip=get_local_ip(),
        server_port=config.PORT,
        simulation_only=config.ONLY_SIMULATION,
    )
    return server_status


class SimModeRequest(BaseModel):
    enabled: bool


@app.post("/simulation/toggle")
async def toggle_simulation_mode(
    req: SimModeRequest,
    rcm: RobotConnectionManager = Depends(get_rcm),
) -> dict:
    """Toggle simulation-only mode at runtime. When enabled, the server
    uses a simulated SO-100 instead of scanning for physical robots."""
    was_sim = config.ONLY_SIMULATION
    config.ONLY_SIMULATION = req.enabled

    if req.enabled != was_sim:
        # Reset the robot connection manager so it re-discovers
        rcm._all_robots = []
        rcm.last_scan_time = 0
        await rcm._find_robots()
        mode = "simulation" if req.enabled else "hardware"
        logger.info(f"Switched to {mode} mode. Robots: {[r.name for r in rcm._all_robots]}")

    return {
        "status": "ok",
        "simulation_only": config.ONLY_SIMULATION,
        "robots": [r.name for r in rcm._all_robots],
    }


app.include_router(control_router)
app.include_router(camera_router)
app.include_router(recording_router)
app.include_router(training_router)
app.include_router(local_training_router)
app.include_router(pages_router)
app.include_router(networking_router)
app.include_router(update_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(ros2_router)
app.include_router(macro_router)
app.include_router(dashboard_router)
app.include_router(gpu_router)
app.include_router(isaacsim_router)
app.include_router(setup_router)
app.include_router(skillgraph_router)
app.include_router(demo_router)

# TODO : Only allow secured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Add the posthog middleware
@app.middleware("http")
def posthog_middleware(request: Request, call_next: Callable) -> JSONResponse:
    # ignore the /move/relative, /move/absolute and /status endpoints
    if request.url.path not in [
        "/move/relative",
        "/move/absolute",
        "/status",
        "/joints/read",
        "/joints/write",
        "/torque/read",
        "/update/version",
    ] and not request.url.path.startswith("/asset"):
        # Sample only 20% of the requests
        if random() < 0.2:
            posthog_pageview(request.url.path)
    return call_next(request)


def version_callback(value: bool) -> None:
    if value:
        print(f"IRL Robotics {__version__}")
        raise typer.Exit()


def is_port_in_use(port: int, host: str) -> bool:
    """Check if a port is already in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return False
        except OSError:
            return True


if config.PROFILE:
    logger.info("Profiling enabled")

    from pyinstrument import Profiler
    from pyinstrument.renderers.html import HTMLRenderer
    from pyinstrument.renderers.speedscope import SpeedscopeRenderer

    @app.middleware("http")
    async def profile_request(request: Request, call_next: Callable) -> JSONResponse:
        # we map a profile type to a file extension, as well as a pyinstrument profile renderer
        profile_type_to_ext = {"html": "html", "speedscope": "speedscope.json"}
        profile_type_to_renderer = {
            "html": HTMLRenderer,
            "speedscope": SpeedscopeRenderer,
        }

        profiler = Profiler(interval=0.1, async_mode="enabled")
        profiler.start()
        response = await call_next(request)
        profiler.stop()

        # we dump the profiling into a file
        extension = profile_type_to_ext["html"]
        renderer = profile_type_to_renderer["html"]()
        filepath = str(get_home_app_path() / f"profile.{extension}")
        with open(filepath, "w") as out:
            out.write(profiler.output(renderer=renderer))
        return response


def start_server(
    host: str = "0.0.0.0",
    port: int = 80,
    reload: bool = False,
    simulation: SimulationMode = SimulationMode.headless,
    only_simulation: bool = False,
    simulate_cameras: bool = False,
    realsense: bool = True,
    can: bool = True,
    cameras: bool = True,
    max_opencv_index: int = 10,
    max_can_interfaces: int = 4,
    profile: bool = False,
    crash_telemetry: bool = True,
    usage_telemetry: bool = True,
    telemetry: bool = True,
    silent: bool = False,
) -> None:
    """
    Start the FastAPI server.
    """

    log_dir = get_home_app_path()
    log_file_path = log_dir / "logs.txt"

    if silent:
        # Only log errors in silent mode
        logger.remove()
        logger.add(
            sys.stderr,
            level="ERROR",
            format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
        )

    # Configure loguru to write logs to a file.
    # This one sink will capture all logs, including those from uvicorn.
    logger.add(
        log_file_path,
        level="DEBUG",  # Set to DEBUG to capture all details
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
        rotation="2 MB",
        retention="7 days",
        # `enqueue=True` uses a multiprocessing queue/locks internally.
        # In some sandboxed environments (like this one), semaphore/lock creation can fail.
        # `enqueue=False` keeps logging simple and avoids multiprocessing primitives.
        enqueue=False,
        backtrace=True,
        diagnose=True,
    )

    # Intercept stdlib logging and forward to loguru.
    # If not doing that, then tracebacks are not logged to the file.
    class InterceptHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            # Translate logging level name to loguru level (fallback to levelno)
            try:
                level = logger.level(record.levelname).name
            except Exception:
                level = record.levelno  # type: ignore

            # Find depth so loguru shows the original caller
            frame, depth = logging.currentframe(), 2
            while frame and frame.f_code.co_filename == logging.__file__:
                if frame.f_back is None:
                    break
                frame = frame.f_back
                depth += 1

            logger.opt(depth=depth, exception=record.exc_info).log(
                level, record.getMessage()
            )

    # Replace handlers for the root logger (and be safe: set level to lowest so all messages are forwarded)
    logging.root.handlers = [InterceptHandler()]

    logger.info("Loguru file logging is configured. Server starting...")

    config.SIM_MODE = simulation
    config.ONLY_SIMULATION = only_simulation
    config.SIMULATE_CAMERAS = simulate_cameras
    config.ENABLE_REALSENSE = realsense
    config.ENABLE_CAMERAS = cameras
    config.PORT = port
    config.PROFILE = profile
    config.CRASH_TELEMETRY = crash_telemetry  # Enable crash telemetry by default
    config.USAGE_TELEMETRY = usage_telemetry  # Enable usage telemetry by default
    config.ENABLE_CAN = can
    config.MAX_OPENCV_INDEX = max_opencv_index
    config.MAX_CAN_INTERFACES = max_can_interfaces

    if not telemetry:
        config.CRASH_TELEMETRY = False
        config.USAGE_TELEMETRY = False

    # Start the FastAPI app using uvicorn with port retry logic
    ports = [port]
    if port == 80:
        ports += list(range(8020, 8040))  # 8020-8039 inclusive

    success = False
    for current_port in ports:
        if is_port_in_use(current_port, host):
            logger.warning(f"Port {current_port} is unavailable. Trying next...")
            continue

        try:
            # Update config with current port
            config.PORT = current_port

            server_config = uvicorn.Config(
                "irl_robotics.app:app",
                host=host,
                port=current_port,
                reload=reload,
                timeout_graceful_shutdown=1,
                log_config=None if silent else uvicorn.config.LOGGING_CONFIG,
            )
            server = uvicorn.Server(config=server_config)

            # Run the server within the existing event loop
            asyncio.run(server.serve())
            success = True
            break
        except OSError as e:
            if "address already in use" in str(e).lower():
                logger.warning(f"Port conflict on {current_port}: {e}")
                continue
            logger.error(f"Critical server error: {e}")
            raise typer.Exit(code=1)
        except KeyboardInterrupt:
            logger.debug("Server stopped by user.")
            raise typer.Exit(code=0)
        except CancelledError:
            logger.debug("Server shutdown gracefully.")
            raise typer.Exit(code=0)

    if not success:
        logger.warning(
            "All ports failed. Try a custom port with:\n"
            "irlrobotics run --port 8000\n\n"
            "Check used ports with:\n"
            "sudo lsof -i :80 # Replace 80 with your port"
        )
        raise typer.Exit(code=1)


if __name__ == "__main__":
    typer.run(start_server)
