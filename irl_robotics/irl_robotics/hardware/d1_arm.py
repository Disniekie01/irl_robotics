import json
import threading
import time
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
from loguru import logger

from irl_robotics.hardware.base import BaseManipulator
from irl_robotics.models import RobotConfigStatus
from irl_robotics.utils import get_resources_path

# DDS imports are lazy-loaded since cyclonedds may not be installed
_dds_available = False
try:
    from cyclonedds.domain import DomainParticipant
    from cyclonedds.pub import Publisher, DataWriter
    from cyclonedds.sub import Subscriber, DataReader
    from cyclonedds.topic import Topic
    from cyclonedds.idl import IdlStruct
    from dataclasses import dataclass as idl_dataclass

    @idl_dataclass
    class ArmString(IdlStruct, typename="unitree_arm::msg::dds_::ArmString_"):
        data_: str

    _dds_available = True
except ImportError:
    logger.warning(
        "cyclonedds not installed. Unitree D1 arm support unavailable. "
        "Install with: pip install cyclonedds==0.10.2"
    )


class UnitreeD1Arm(BaseManipulator):
    """
    Unitree D1-550 servo arm driver.
    6 DOF + 1 gripper, controlled via DDS over Ethernet.
    Default IP: 192.168.123.100
    """

    name = "unitree-d1"

    URDF_FILE_PATH = str(
        get_resources_path() / "urdf" / "d1" / "urdf" / "d1.urdf"
    )

    AXIS_ORIENTATION = [0, 0, 1, 1]

    # Joint6 is wrist roll, gripper is the prismatic joint
    # URDF joints: Joint1..Joint6, Joint_L, Joint_R
    # We treat Joint_L as the gripper (Joint_R mirrors it)
    END_EFFECTOR_LINK_INDEX = 5  # Empty_Link6 (last revolute link)
    GRIPPER_JOINT_INDEX = 6  # Index in SERVO_IDS for gripper

    # Servo IDs: 0-5 for joints, 6 for gripper (maps to D1 angle0-angle6)
    SERVO_IDS = [0, 1, 2, 3, 4, 5, 6]

    # D1 uses 10Hz control, angles in degrees
    # We use a virtual resolution where 1 unit = 0.01 degrees
    # This gives us fine-grained control: ±135° = ±13500 units
    RESOLUTION = 36000  # Full 360° range mapped to units

    CALIBRATION_POSITION = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    SLEEP_POSITION = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    # Joint limits in degrees (from Unitree docs)
    JOINT_LIMITS_DEG = [
        (-135.0, 135.0),  # J0
        (-90.0, 90.0),    # J1
        (-90.0, 90.0),    # J2
        (-135.0, 135.0),  # J3
        (-90.0, 90.0),    # J4
        (-135.0, 135.0),  # J5
        (0.0, 65.0),      # Gripper (mm stroke, mapped to angle6 in D1 API)
    ]

    def __init__(
        self,
        ip: str = "192.168.123.100",
        network_interface: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        self.ip = ip
        self.network_interface = network_interface

        # DDS handles
        self._participant: Any = None
        self._publisher: Any = None
        self._subscriber: Any = None
        self._cmd_writer: Any = None
        self._feedback_reader: Any = None

        # State
        self._current_angles_deg: np.ndarray = np.zeros(7)
        self._enable_status: bool = False
        self._power_status: bool = False
        self._error_status: bool = False
        self._feedback_lock = threading.Lock()
        self._feedback_thread: Optional[threading.Thread] = None
        self._shutdown_event = threading.Event()
        self._seq_counter = 100

        super().__init__(**kwargs)

    def _next_seq(self) -> int:
        self._seq_counter += 1
        return self._seq_counter

    def _build_command(
        self, address: int, funcode: int, data: Optional[Dict[str, Any]] = None
    ) -> str:
        cmd: Dict[str, Any] = {
            "seq": self._next_seq(),
            "address": address,
            "funcode": funcode,
        }
        if data is not None:
            cmd["data"] = data
        return json.dumps(cmd)

    def _send_command(
        self, address: int, funcode: int, data: Optional[Dict[str, Any]] = None
    ) -> bool:
        if self._cmd_writer is None:
            logger.warning("D1 arm not connected, cannot send command")
            return False
        try:
            msg = ArmString(data_=self._build_command(address, funcode, data))
            self._cmd_writer.write(msg)
            return True
        except Exception as e:
            logger.error(f"Error sending D1 command: {e}")
            return False

    def _feedback_listener_loop(self) -> None:
        """Background thread to read DDS feedback messages."""
        while not self._shutdown_event.is_set():
            try:
                if self._feedback_reader is None:
                    time.sleep(0.1)
                    continue
                samples = self._feedback_reader.take(N=10)
                for sample in samples:
                    if sample is None:
                        continue
                    try:
                        payload = json.loads(sample.data_)
                        self._process_feedback(payload)
                    except (json.JSONDecodeError, AttributeError):
                        pass
            except Exception:
                pass
            time.sleep(0.05)

    def _process_feedback(self, payload: Dict[str, Any]) -> None:
        address = payload.get("address", 0)
        funcode = payload.get("funcode", 0)
        data = payload.get("data", {})

        if address == 2 and funcode == 1:
            # Joint angle feedback
            with self._feedback_lock:
                for i in range(7):
                    key = f"angle{i}"
                    if key in data:
                        self._current_angles_deg[i] = float(data[key])
        elif address == 2 and funcode == 3:
            # Status feedback
            with self._feedback_lock:
                self._enable_status = bool(data.get("enable_status", 0))
                self._power_status = bool(data.get("power_status", 0))
                self._error_status = bool(data.get("error_status", 0))

    def _degrees_to_units(self, degrees: float) -> int:
        """Convert degrees to motor units. 0 degrees = RESOLUTION/2."""
        return int((degrees / 360.0) * self.RESOLUTION + self.RESOLUTION / 2)

    def _units_to_degrees(self, units: int) -> float:
        """Convert motor units to degrees. RESOLUTION/2 = 0 degrees."""
        return (units - self.RESOLUTION / 2) * 360.0 / self.RESOLUTION

    async def connect(self) -> None:
        if not _dds_available:
            logger.error(
                "Cannot connect to D1 arm: cyclonedds not installed. "
                "Install with: pip install cyclonedds==0.10.2"
            )
            return

        try:
            # Create DDS participant
            # domain_id=0 is Unitree's default
            if self.network_interface:
                # Bind to specific network interface
                import os
                os.environ["CYCLONEDDS_URI"] = (
                    f'<CycloneDDS><Domain><General>'
                    f'<Interfaces><NetworkInterface name="{self.network_interface}"/></Interfaces>'
                    f'</General></Domain></CycloneDDS>'
                )

            self._participant = DomainParticipant(domain_id=0)
            self._publisher = Publisher(self._participant)
            self._subscriber = Subscriber(self._participant)

            # Command topic: publish to rt/arm_Command
            cmd_topic = Topic(self._participant, "rt/arm_Command", ArmString)
            self._cmd_writer = DataWriter(self._publisher, cmd_topic)

            # Feedback topic: subscribe to rt/arm_Feedback
            fb_topic = Topic(self._participant, "rt/arm_Feedback", ArmString)
            self._feedback_reader = DataReader(self._subscriber, fb_topic)

            # Start feedback listener thread
            self._shutdown_event.clear()
            self._feedback_thread = threading.Thread(
                target=self._feedback_listener_loop, daemon=True
            )
            self._feedback_thread.start()

            # Power on the arm
            self._send_command(address=1, funcode=6, data={"power": 1})
            time.sleep(0.5)

            # Wait for first feedback to confirm connection
            connected = False
            for _ in range(30):
                time.sleep(0.2)
                with self._feedback_lock:
                    if self._power_status:
                        connected = True
                        break

            if connected:
                self.is_connected = True
                logger.success(f"Connected to Unitree D1 arm at {self.ip}")
                # Enable torque and go to zero
                self.enable_torque()
            else:
                logger.warning(
                    f"D1 arm at {self.ip}: DDS initialized but no feedback received. "
                    "Check network connection and arm power."
                )
                # Still mark as connected since DDS is set up
                self.is_connected = True

        except Exception as e:
            logger.error(f"Failed to connect to D1 arm: {e}")
            self.is_connected = False

    def disconnect(self) -> None:
        if self.is_connected:
            try:
                # Disable torque before disconnecting
                self.disable_torque()
                time.sleep(0.3)
            except Exception:
                pass

        self._shutdown_event.set()
        if self._feedback_thread and self._feedback_thread.is_alive():
            self._feedback_thread.join(timeout=2)

        self._cmd_writer = None
        self._feedback_reader = None
        self._publisher = None
        self._subscriber = None
        self._participant = None
        self.is_connected = False
        logger.info("Disconnected from Unitree D1 arm")

    def enable_torque(self) -> None:
        """Enable all joint motors (lock mode)."""
        if not self.is_connected:
            return
        # mode=1 enables (locks), up to 80000 for full lock
        self._send_command(address=1, funcode=5, data={"mode": 1})

    def disable_torque(self) -> None:
        """Disable all joint motors (free mode for teaching)."""
        if not self.is_connected:
            return
        self._send_command(address=1, funcode=5, data={"mode": 0})

    def read_motor_position(self, servo_id: int, **kwargs: Any) -> Optional[int]:
        """Read position of a single joint in motor units."""
        if not self.is_connected:
            return None
        with self._feedback_lock:
            deg = self._current_angles_deg[servo_id]
        return self._degrees_to_units(deg)

    def write_motor_position(self, servo_id: int, units: int, **kwargs: Any) -> None:
        """Write position to a single joint."""
        if not self.is_connected:
            return
        angle_deg = self._units_to_degrees(units)
        self._send_command(
            address=1,
            funcode=1,
            data={"id": servo_id, "angle": round(angle_deg, 2), "delay_ms": 0},
        )

    def read_group_motor_position(self) -> np.ndarray:
        """Read positions of all joints in motor units."""
        if not self.is_connected:
            return np.ones(7) * np.nan
        with self._feedback_lock:
            angles_deg = self._current_angles_deg.copy()
        return np.array([self._degrees_to_units(d) for d in angles_deg])

    def write_group_motor_position(
        self, q_target: np.ndarray, enable_gripper: bool = True
    ) -> None:
        """Write positions to all joints. Uses multi-joint angle control."""
        if not self.is_connected:
            return

        data: Dict[str, Any] = {"mode": 0}  # mode=0: small smoothing for 10Hz
        for i in range(7):
            if not enable_gripper and i == 6:
                continue
            angle_deg = self._units_to_degrees(int(q_target[i]))
            data[f"angle{i}"] = round(angle_deg, 2)

        self._send_command(address=1, funcode=2, data=data)

    def read_motor_torque(self, servo_id: int, **kwargs: Any) -> Optional[float]:
        """D1 doesn't expose per-joint torque readings."""
        return None

    def read_motor_voltage(self, servo_id: int, **kwargs: Any) -> Optional[float]:
        """D1 doesn't expose per-joint voltage readings. Return nominal 24V."""
        if not self.is_connected:
            return None
        return 24.0

    def calibrate_motors(self, **kwargs: Any) -> None:
        """Send return-to-zero command to the D1 arm."""
        if not self.is_connected:
            return
        self._send_command(address=1, funcode=7)
        time.sleep(3)

    async def calibrate(
        self,
    ) -> Tuple[Literal["success", "in_progress", "error"], str]:
        """
        D1 arm calibration is simpler than servo robots.
        The arm has absolute encoders, so we just need to:
        1. Return to zero position
        2. Set up the config offsets
        """
        if not self.is_connected:
            self.calibration_current_step = 0
            return ("error", "Robot is not connected.")

        from irl_robotics.models import BaseRobotConfig, BaseRobotPIDGains

        # D1 has absolute encoders - calibration is automatic
        # Return to zero position
        self.calibrate_motors()

        # Create a config with identity mapping (no offsets needed)
        # Since the D1 reports absolute angles, offset = RESOLUTION/2 (center)
        # and sign = 1 for all joints
        offsets = [self.RESOLUTION / 2] * 7
        signs = [1.0] * 7
        calibration_pos = [self.RESOLUTION / 2] * 7

        self.config = BaseRobotConfig(
            name=self.name,
            servos_offsets=offsets,
            servos_offsets_signs=signs,
            servos_calibration_position=calibration_pos,
            pid_gains=[
                BaseRobotPIDGains(p_gain=32, i_gain=0, d_gain=32) for _ in range(7)
            ],
            gripping_threshold=500,
            non_gripping_threshold=200,
        )
        path = self.config.save_local(serial_id=self.SERIAL_ID)
        self.calibration_current_step = 0
        return ("success", f"D1 arm calibrated. Config saved to {path}")

    def init_config(self) -> None:
        """Initialize config for D1 arm with identity mapping."""
        if self.config is not None:
            return

        from irl_robotics.models import BaseRobotConfig, BaseRobotPIDGains

        offsets = [self.RESOLUTION / 2] * 7
        signs = [1.0] * 7

        self.config = BaseRobotConfig(
            name=self.name,
            servos_offsets=offsets,
            servos_offsets_signs=signs,
            servos_calibration_position=offsets,
            pid_gains=[
                BaseRobotPIDGains(p_gain=32, i_gain=0, d_gain=32) for _ in range(7)
            ],
            gripping_threshold=500,
            non_gripping_threshold=200,
        )

    def status(self) -> RobotConfigStatus:
        return RobotConfigStatus(
            name=self.name,
            device_name=f"D1@{self.ip}",
            robot_type="manipulator",
        )

    async def move_to_initial_position(self, open_gripper: bool = True) -> None:
        """Move D1 arm to zero position."""
        self.init_config()
        self.enable_torque()
        # Send return-to-zero command
        self._send_command(address=1, funcode=7)
        import asyncio
        await asyncio.sleep(3)
        (
            self.initial_position,
            self.initial_orientation_rad,
        ) = self.forward_kinematics()

    async def move_to_sleep(self) -> None:
        """Move to sleep position and disable torque."""
        if self.is_connected:
            self._send_command(address=1, funcode=7)
            import asyncio
            await asyncio.sleep(2)
            self.disable_torque()
            await asyncio.sleep(0.1)

    def get_observation(
        self, source: Literal["sim", "robot"] = "robot", do_forward: bool = False
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Get robot observation (state + joint positions)."""
        joints_position = self.read_joints_position(unit="rad", source=source)
        state = joints_position.copy()
        return state, joints_position

    def set_motors_positions(
        self, q_target_rad: np.ndarray, enable_gripper: bool = False
    ) -> None:
        """Override to handle D1-specific control."""
        if self.is_connected:
            # Convert radians to degrees and send directly
            angles_deg = np.rad2deg(q_target_rad)

            data: Dict[str, Any] = {"mode": 0}
            for i in range(len(angles_deg)):
                if not enable_gripper and i == self.GRIPPER_JOINT_INDEX:
                    continue
                data[f"angle{i}"] = round(float(angles_deg[i]), 2)

            self._send_command(address=1, funcode=2, data=data)

        # Update simulation
        joint_indices = self.actuated_joints
        target_positions = q_target_rad.tolist()
        if not enable_gripper:
            joint_indices = [
                j for j in joint_indices if j != self.GRIPPER_JOINT_INDEX
            ]
            target_positions = [
                q_target_rad[i]
                for i in range(len(q_target_rad))
                if i != self.GRIPPER_JOINT_INDEX
            ]
        if len(target_positions) > len(joint_indices):
            target_positions = target_positions[: len(joint_indices)]

        self.sim.set_joints_states(
            robot_id=self.p_robot_id,
            joint_indices=joint_indices,
            target_positions=target_positions,
        )

    def read_joints_position(
        self,
        unit: Literal["rad", "motor_units", "degrees", "other"] = "rad",
        source: Literal["sim", "robot"] = "robot",
        joints_ids: Optional[List[int]] = None,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
    ) -> np.ndarray:
        """Override to read D1 angles directly in degrees."""
        if source == "robot" and self.is_connected and not self.is_moving:
            with self._feedback_lock:
                angles_deg = self._current_angles_deg.copy()

            if unit == "rad":
                return np.deg2rad(angles_deg)
            elif unit == "degrees":
                return angles_deg
            elif unit == "motor_units":
                return np.array(
                    [self._degrees_to_units(d) for d in angles_deg]
                )
            elif unit == "other":
                if min_value is None or max_value is None:
                    raise ValueError("min_value and max_value required for 'other'")
                rad = np.deg2rad(angles_deg)
                return min_value + (max_value - min_value) * (rad + np.pi) / (
                    2 * np.pi
                )
            else:
                raise ValueError(f"Invalid unit: {unit}")
        else:
            # Fall back to simulation
            return super().read_joints_position(
                unit=unit,
                source="sim",
                joints_ids=joints_ids,
                min_value=min_value,
                max_value=max_value,
            )

    def get_info_for_dataset(self) -> Dict[str, Any]:
        """Return robot info for dataset recording."""
        return {
            "robot_type": self.name,
            "ip": self.ip,
            "num_joints": 7,
            "joint_names": [
                "joint0_base",
                "joint1_shoulder",
                "joint2_elbow",
                "joint3_wrist_rot",
                "joint4_wrist_pitch",
                "joint5_wrist_roll",
                "gripper",
            ],
        }
