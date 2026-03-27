from typing import Dict, List, Literal, Optional, Union

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .robot import Temperature
from .server import ServerInfoResponse, StatusResponse


class EndEffectorReadRequest(BaseModel):
    sync: bool = Field(
        False,
        description="If True, the simulation will first read the motor positions, synchronize them with the simulated robot, and then return the end effector position."
        + "Useful for measurements, however it will take more time to respond.",
    )
    only_gripper: bool = Field(
        False,
        description="If True, only return the gripper state. If False, return the full end effector position and orientation.",
    )


class EndEffectorPosition(BaseModel):
    """
    End effector position for a movement in absolute frame.
    All zeros means the initial position, that you get by calling /move/init
    """

    x: Optional[float] = Field(description="X position in centimeters")
    y: Optional[float] = Field(description="Y position in centimeters")
    z: Optional[float] = Field(description="Z position in centimeters")
    rx: Optional[float] = Field(description="Absolute Pitch in degrees")
    ry: Optional[float] = Field(description="Absolute Yaw in degrees")
    rz: Optional[float] = Field(description="Absolute Roll in degrees")
    open: float = Field(description="0 for closed, 1 for open")


class MoveAbsoluteRequest(BaseModel):
    """
    Move the robot to an absolute position. All zeros means the initial position,
    that you get by calling /move/init.
    """

    x: Optional[float] = Field(None, description="X position in centimeters")
    y: Optional[float] = Field(None, description="Y position in centimeters")
    z: Optional[float] = Field(None, description="Z position in centimeters")
    rx: Optional[float] = Field(
        None,
        description="Absolute Pitch in degrees. If None, inverse kinematics will be used to calculate the best position.",
    )
    ry: Optional[float] = Field(
        None,
        description="Absolute Yaw in degrees. If None, inverse kinematics will be used to calculate the best position.",
    )
    rz: Optional[float] = Field(
        None,
        description="Absolute Roll in degrees. If None, inverse kinematics will be used to calculate the best position.",
    )
    open: Optional[float] = Field(None, description="0 for closed, 1 for open")

    max_trials: int = Field(
        10,
        ge=1,
        description="The maximum number of trials to reach the target position.",
    )
    position_tolerance: float = Field(
        0.03,
        ge=0,
        description="Increase max_trials and decrease tolerance to get more precision."
        + "Position tolerance is the euclidean distance between the target and the current position.",
    )
    orientation_tolerance: float = Field(
        0.2,
        ge=0,
        description="Increase max_trials and decrease tolerance to get more precision."
        + "Orientation tolerance is the euclidean distance between the target and the current orientation.",
    )


class AppControlData(BaseModel):
    """
    Type of data sent by VR/XR clients (WebXR, Meta Quest, Apple Vision Pro).
    """

    x: float
    y: float
    z: float
    rx: float = Field(description="Absolute Pitch in degrees")
    ry: float = Field(description="Absolute Yaw in degrees")
    rz: float = Field(description="Absolute Roll in degrees")
    open: float = Field(description="0 for closed, 1 for open")
    source: Literal["left", "right"] = Field(
        "right", description="Which hand the data comes from. Can be left or right."
    )
    timestamp: Optional[float] = Field(
        None, description="Unix timestamp with milliseconds"
    )
    direction_x: float = Field(
        0.0,
        description="Direction vector X, normalized between -1 (left) and 1 (right)",
        le=1,
        ge=-1,
    )
    direction_y: float = Field(
        0.0,
        description="Direction vector Y, normalized between -1 (backward) and 1 (forward)",
        le=1,
        ge=-1,
    )

    def is_null(self, eps: float = 1e-6) -> bool:
        return (
            self.x < eps
            and self.y < eps
            and self.z < eps
            and self.rx < eps
            and self.ry < eps
            and self.rz < eps
            and self.open == 0
        )

    def has_null_position(self) -> bool:
        return self.x == 0 and self.y == 0 and self.z == 0

    def has_null_orientation(self) -> bool:
        return self.rx == 0 and self.ry == 0 and self.rz == 0

    def to_robot(
        self, robot_name: str = "so-100", source_platform: str = "unity"
    ) -> tuple[np.ndarray, np.ndarray, float]:
        if source_platform == "webxr":
            position = np.array([self.x, self.z, self.y])
        else:
            position = np.array([self.x, self.z, self.y])

        if robot_name == "wx-250s" or robot_name == "koch-v1.1":
            orientation = np.array([-self.rx, -self.rz, -self.ry])
        elif robot_name == "agilex-piper":
            orientation = np.array([self.ry, self.rx, self.rz])
        else:
            orientation = np.array([-self.rx, -self.rz, -self.ry])

        orientation = np.mod(orientation + 180, 360) - 180

        return position, orientation, self.open


class RelativeEndEffectorPosition(BaseModel):
    """
    Relative end effector position for a movement in relative frame.
    """

    x: Optional[float] = Field(None, description="Delta X position in centimeters")
    y: Optional[float] = Field(None, description="Delta Y position in centimeters")
    z: Optional[float] = Field(None, description="Delta Z position in centimeters")
    rx: Optional[float] = Field(None, description="Relative Pitch in degrees")
    ry: Optional[float] = Field(None, description="Relative Yaw in degrees")
    rz: Optional[float] = Field(None, description="Relative Roll in degrees")
    open: Optional[float] = Field(
        None, description="0 for closed, 1 for open. If None, use the last value."
    )

    def init(self, np_array: np.ndarray) -> None:
        if np_array.shape != (7,):
            raise ValueError("Invalid array shape")

        self.x = np_array[0]
        self.y = np_array[1]
        self.z = np_array[2]
        self.rx = np_array[3]
        self.ry = np_array[4]
        self.rz = np_array[5]
        self.open = np_array[6]


class EmoteRequest(BaseModel):
    emote_name: Literal["wave", "dance", "bow"] = Field(
        ...,
        description="Name of the emote to play.",
        examples=["wave", "dance", "bow"],
    )


class AutoControlRequest(BaseModel):
    type_of_model: Literal["act", "openvla", "pi0"] = Field(
        ..., description="Type of model, either OpenVLA or ACT"
    )
    size_of_images: Optional[tuple[int, int]] = Field(
        None,
        description="Size of the images to send to the model",
    )
    instruction: Optional[str] = Field(
        None, description="Prompt to be followed by the robot when using OpenVLA"
    )
    robot_ids: List[int] = Field(
        [0], description="List of robot ids to control, in order, defaults to [0]"
    )


class CalibrateResponse(BaseModel):
    calibration_status: Literal["error", "success", "in_progress"] = Field(
        ...,
        description="Status of the calibration.",
    )
    message: str
    current_step: int
    total_nb_steps: int


class JointsReadRequest(BaseModel):
    unit: Literal["rad", "motor_units", "degrees"] = Field(
        "rad",
        description="The unit of the angles. Defaults to radian.",
    )
    joints_ids: Optional[List[int]] = Field(
        None,
        description="If set, only read the joints with these ids.",
    )
    source: Literal["sim", "robot"] = Field(
        "robot",
        description="Source of the joint angles.",
    )


class JointsWriteRequest(BaseModel):
    angles: List[float] = Field(
        ...,
        description="A list with the position of each joint.",
    )
    unit: Literal["rad", "motor_units", "degrees"] = Field(
        "rad",
        description="The unit of the angles. Defaults to radian.",
    )
    joints_ids: Optional[List[int]] = Field(
        None,
        description="If set, only set the joints with these ids.",
    )


class JointsReadResponse(BaseModel):
    angles: List[Optional[float]] = Field(
        ...,
        description="A list of length 6, with the position of each joint.",
    )
    unit: Literal["rad", "motor_units", "degrees"] = Field(
        "rad",
        description="The unit of the angles. Defaults to radian.",
    )


class TorqueReadResponse(BaseModel):
    current_torque: List[float] = Field(
        ...,
        description="A list of length 6, with the current torque of each joint.",
    )


class VoltageReadResponse(BaseModel):
    current_voltage: Optional[List[float]] = Field(
        ...,
        description="A list of length 6, with the current voltage of each joint.",
    )


class TemperatureReadResponse(BaseModel):
    current_max_Temperature: Optional[List[Temperature]] = Field(
        ...,
        description="A list of Temperature objects, one for each joint.",
    )


class TemperatureWriteRequest(BaseModel):
    maximum_temperature: List[int] = Field(
        ...,
        description="A list with the maximum temperature of each joint.",
    )


class TorqueControlRequest(BaseModel):
    torque_status: bool = Field(
        ..., description="Whether to enable or disable torque control."
    )


class FeedbackRequest(BaseModel):
    feedback: Literal["positive", "negative"] = Field(
        ...,
        description="Feedback on the AI control.",
    )
    ai_control_id: str = Field(
        ...,
        description="ID of the AI control session.",
    )


class RobotPairRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    leader_id: Optional[int] = Field(
        ..., description="Serial number of the leader robot"
    )
    follower_id: Optional[int] = Field(
        ..., description="Serial number of the follower robot"
    )


class StartLeaderArmControlRequest(BaseModel):
    robot_pairs: List[RobotPairRequest] = Field(
        ...,
        description="List of robot pairs to control.",
    )
    invert_controls: bool = Field(
        False, description="Mirror controls for the follower robots"
    )
    enable_gravity_compensation: bool = Field(
        False, description="Enable gravity compensation for the leader robots"
    )
    gravity_compensation_values: Optional[Dict[str, int]] = Field(
        {"shoulder": 100, "elbow": 50, "wrist": 10},
        description="Gravity compensation pourcentage values for shoulder, elbow, and wrist joints (0-100%)",
    )
    enable_haptic_feedback: bool = Field(
        False,
        description="Enable haptic feedback mode.",
    )
    haptic_feedback_strength: int = Field(
        50,
        ge=0,
        le=100,
        description="Haptic feedback strength as a percentage (0-100%).",
    )


class StartAIControlRequest(BaseModel):
    prompt: Optional[str] = Field(
        None, description="Prompt to be followed by the robot"
    )
    model_id: str = Field(..., description="Hugging Face model id to use")
    speed: float = Field(
        1.0,
        ge=0.1,
        le=2,
        description="Speed of the AI control.",
    )
    robot_serials_to_ignore: Optional[List[str]] = Field(
        None,
        description="List of robot serial ids to ignore.",
    )
    cameras_keys_mapping: Optional[Dict[str, int]] = Field(
        None,
        description="Mapping of the camera keys to the camera ids.",
    )
    model_type: Literal["gr00t", "ACT", "ACT_BBOX", "pi0.5", "smolvla"] = Field(
        ...,
        description="Type of model to use.",
    )
    selected_camera_id: Optional[int] = Field(
        None,
        description="Name of the camera to use when ACT_BBOX model is used.",
    )
    verify_cameras: bool = Field(
        True,
        description="Whether to verify the setup before starting the AI control.",
    )
    checkpoint: Optional[int] = Field(
        None,
        description="Checkpoint to use for the model.",
        examples=[500],
    )
    angle_format: Literal["degrees", "rad", "other"] = Field(
        "rad",
        description="Format of the angles used in the model.",
        examples=["rad"],
    )
    min_angle: Optional[float] = Field(
        None,
        description="Minimum angle value if angle_format is 'other'.",
    )
    max_angle: Optional[float] = Field(
        None,
        description="Maximum angle value if angle_format is 'other'.",
    )

    @model_validator(mode="after")
    def check_angle_format(self) -> "StartAIControlRequest":
        if self.angle_format == "other":
            if self.min_angle is None or self.max_angle is None:
                raise ValueError(
                    "If angle_format is 'other', min_angle and max_angle must be set."
                )
            if self.min_angle >= self.max_angle:
                raise ValueError(
                    "min_angle must be less than max_angle when angle_format is 'other'."
                )
        return self


class AIStatusResponse(BaseModel):
    status: Literal["stopped", "running", "paused", "waiting"] = Field(
        ..., description="Status of the AI control"
    )
    id: Optional[str] = Field(..., description="ID of the AI control session.")


class AIControlStatusResponse(StatusResponse):
    server_info: Optional[ServerInfoResponse] = None
    ai_control_signal_id: str
    ai_control_signal_status: Literal["stopped", "running", "paused", "waiting"]


class StartServerRequest(BaseModel):
    model_id: str = Field(..., description="Hugging Face model id to use")
    robot_serials_to_ignore: Optional[List[str]] = Field(
        None,
        description="List of robot serial ids to ignore.",
    )
    model_type: Literal["gr00t", "ACT", "pi0.5", "smolvla"] = Field(
        ...,
        description="Type of model to use.",
    )
