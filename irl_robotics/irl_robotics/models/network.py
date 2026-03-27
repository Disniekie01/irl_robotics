from typing import Any, List, Optional

from pydantic import BaseModel, Field

from irl_robotics.utils import NetworkDevice

from .server import StatusResponse


class ScanNetworkRequest(BaseModel):
    robot_name: Optional[str] = Field(
        None,
        description="Name of the robot to scan for.",
    )


class ScanNetworkResponse(BaseModel):
    devices: List[NetworkDevice] = Field(
        ...,
        description="List of devices found on the network.",
    )
    subnet: Optional[str] = Field(
        ...,
        description="Subnet of the network.",
        examples=["192.168.1.1/24"],
    )


class LocalDevice(BaseModel):
    name: str
    device: str
    serial_number: Optional[str] = None
    pid: Optional[int] = None
    interface: Optional[str] = None


class ScanDevicesResponse(BaseModel):
    devices: List[LocalDevice] = Field(
        ...,
        description="List of connected USB devices.",
    )


class RobotConnectionRequest(BaseModel):
    robot_name: str = Field(
        ...,
        description="Type of the robot to connect to.",
        examples=["so-100", "wx-250s", "koch-v1.1"],
    )
    connection_details: dict[str, Any] = Field(
        ...,
        description="Connection details for the robot.",
    )


class RobotConnectionResponse(StatusResponse):
    robot_id: int
