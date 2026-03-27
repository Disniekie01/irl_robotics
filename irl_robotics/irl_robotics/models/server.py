from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from irl_robotics._version import __version__
from irl_robotics.types import VideoCodecs

from .camera import AllCamerasStatus
from .robot import RobotConfigStatus


class ServerStatus(BaseModel):
    """Contains the status of the app"""

    status: Literal["ok", "error"]
    name: str
    robots: List[str] = Field(default_factory=list, deprecated=True)
    robot_status: List[RobotConfigStatus] = Field(default_factory=list)
    cameras: AllCamerasStatus = Field(default_factory=AllCamerasStatus)
    version_id: str = Field(
        default=__version__, description="Current version of the teleoperation server"
    )
    is_recording: bool = Field(
        False, description="Whether the server is currently recording an episode."
    )
    ai_running_status: Literal["stopped", "running", "paused", "waiting"] = Field(
        "stopped",
        description="Whether the robot is currently controlled by an AI model.",
    )
    leader_follower_status: bool = Field(
        False,
        description="Whether the leader-follower control is currently active.",
    )
    server_ip: str = Field(
        ..., description="IP address of the irl_robotics server", examples=["192.168.1.X"]
    )
    server_port: int = Field(
        ..., description="Port of the irl_robotics server", examples=[80, 8020, 8021]
    )
    simulation_only: bool = Field(
        False,
        description="Whether the server is in simulation-only mode (no physical robot).",
    )


class RobotStatus(BaseModel):
    """
    Contains the status of the robot and the number of actions received in one second
    This is sent by the robot to the app.
    """

    is_object_gripped: Optional[bool] = None
    is_object_gripped_source: Optional[Literal["left", "right"]] = None
    nb_actions_received: int


class StatusResponse(BaseModel):
    """
    Default response. May contain other fields.
    """

    model_config = ConfigDict(extra="allow")

    status: Literal["ok", "error"] = "ok"
    message: Optional[str] = None


class InfoResponse(BaseModel):
    """
    Response to the /dataset/info endpoint.
    """

    status: Literal["ok", "error"] = "ok"
    robot_type: Optional[str] = None
    robot_dof: Optional[int] = None
    number_of_episodes: Optional[int] = None
    image_keys: Optional[List[str]] = None
    image_frames: Optional[dict] = None


class HFWhoamIResponse(StatusResponse):
    username: Optional[str] = None


class ServerInfoResponse(BaseModel):
    server_id: int
    url: str
    port: int
    tcp_socket: tuple[str, int]
    model_id: str
    timeout: int


class SpawnStatusResponse(StatusResponse):
    """
    Response to spawn a server.
    """

    server_info: ServerInfoResponse


class VizSettingsResponse(BaseModel):
    """
    Settings for the vizualisation page.
    """

    width: int
    height: int
    quality: int


class AdminSettingsRequest(BaseModel):
    """
    Contains the admin settings
    """

    dataset_name: str
    episode_format: str
    freq: int
    video_codec: VideoCodecs
    video_size: List[int]  # size 2
    task_instruction: str
    cameras_to_record: Optional[List[int]] = None
    hf_private_mode: bool = False


class AdminSettingsResponse(BaseModel):
    """
    Contains the settings returned in the admin page
    """

    dataset_name: str
    freq: int
    episode_format: str
    video_codec: VideoCodecs
    video_size: List[int]  # size 2
    task_instruction: str
    cameras_to_record: Optional[List[int]]
    hf_private_mode: bool


class AdminTokenSettings(BaseModel):
    """
    To each provider is assigned a bool, which is True
    if the token is set and valid.
    """

    huggingface: bool = False
    wandb: bool = False
