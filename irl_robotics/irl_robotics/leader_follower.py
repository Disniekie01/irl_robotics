import asyncio
import threading
import time
from dataclasses import dataclass
from typing import Any, Coroutine, Dict, List, Optional, Union

import numpy as np
from loguru import logger

from irl_robotics.control_signal import ControlSignal
from irl_robotics.hardware import (
    BaseManipulator,
    RemoteRobot,
    SO100Hardware,
    get_sim,
)
from irl_robotics.hardware.piper import PiperHardware
from irl_robotics.hardware.sim import PyBulletSimulation
from irl_robotics.utils import background_task_log_exceptions


@dataclass
class RobotPair:
    leader: Union[BaseManipulator, RemoteRobot]
    follower: Union[BaseManipulator, RemoteRobot]


class LeaderFollowerThread(threading.Thread):
    """
    A dedicated thread to run the leader-follower control loop.
    This offloads the intensive loop from the main asyncio event loop,
    allowing for better performance and parallelism.
    """

    def __init__(
        self,
        robot_pairs: List[RobotPair],
        control_signal: ControlSignal,
        invert_controls: bool,
        enable_gravity_compensation: bool,
        compensation_values: Optional[Dict[str, int]],
        sim: PyBulletSimulation,
        enable_haptic_feedback: bool = False,
        haptic_feedback_strength: int = 50,
    ) -> None:
        super().__init__()
        self.robot_pairs = robot_pairs
        self.control_signal = control_signal
        self.invert_controls = invert_controls
        self.enable_gravity_compensation = enable_gravity_compensation
        self.compensation_values = compensation_values
        self.sim = sim
        self.enable_haptic_feedback = enable_haptic_feedback
        self.haptic_feedback_strength = haptic_feedback_strength
        self.loop_period = (
            1 / 60
            if self.enable_gravity_compensation or self.enable_haptic_feedback
            else 1 / 150
        )
        self.original_pid_gains: Dict[str, list] = {}
        self.warning_dropping_joints_displayed = False
        self._follower_torque_baseline: Dict[str, np.ndarray] = {}
        self._haptic_ema: Dict[str, np.ndarray] = {}

    def _run_async(self, coro: Coroutine) -> Any:
        """Helper function to run async code from within the thread."""
        return asyncio.run(coro)

    def _setup_robots(self) -> None:
        """Initializes robots, moves them to the initial position, and sets up PID gains."""
        logger.info("Setting up robots for leader-follower control.")

        # Check if the initial position is set, otherwise move them
        wait_for_initial_position = False
        for pair in self.robot_pairs:
            for robot in [pair.leader, pair.follower]:
                if (
                    robot.initial_position is None
                    or robot.initial_orientation_rad is None
                ):
                    logger.warning(
                        f"Initial position or orientation not set for {robot.name} {robot.device_name}. "
                        "Moving to initial position before starting."
                    )
                    robot.enable_torque()
                    self._run_async(robot.move_to_initial_position())
                    wait_for_initial_position = True

        if wait_for_initial_position:
            time.sleep(1)

        # Store original PID gains and apply new ones
        for pair in self.robot_pairs:
            leader = pair.leader
            follower = pair.follower

            follower.enable_torque()
            needs_leader_torque = (
                self.enable_gravity_compensation or self.enable_haptic_feedback
            )

            if not needs_leader_torque:
                leader.disable_torque()
            else:
                if not isinstance(leader, SO100Hardware) or not isinstance(
                    follower, SO100Hardware
                ):
                    raise TypeError(
                        "Gravity compensation / haptic feedback is only supported for SO100Hardware."
                    )

                leader_current_voltage = leader.current_voltage()
                if (
                    leader_current_voltage is None
                    or np.isnan(np.mean(leader_current_voltage))
                    or np.mean(leader_current_voltage) < 1
                ):
                    logger.warning(
                        f"Leader {leader.device_name} current voltage is {leader_current_voltage}V. "
                        + "Expected: 6V or 12V. "
                    )
                    self.control_signal.stop()
                    return

                voltage = "6V" if np.mean(leader_current_voltage) < 9.0 else "12V"
                p_gains = [3, 6, 6, 3, 3, 3]
                d_gains = [9, 9, 9, 9, 9, 9]
                self.alpha = np.array([0, 0.2, 0.2, 0.1, 0.2, 0.2])

                if voltage == "12V":
                    p_gains = [int(p / 2) for p in p_gains]
                    d_gains = [int(d / 2) for d in d_gains]

                leader.enable_torque()

                # Store original gains for the leader
                self.original_pid_gains[leader.name] = [
                    leader._get_pid_gains_motor(i + 1) for i in range(6)
                ]

                # If any of the original gains are None, raise an error
                if any(gain is None for gain in self.original_pid_gains[leader.name]):
                    logger.warning(
                        f"Leader {leader.device_name} has PID gains: {self.original_pid_gains[leader.name]}. "
                        "Some gains are None, which is unexpected. Stopping control."
                    )
                    self.control_signal.stop()
                    return

                # Apply custom PID gains
                for i in range(6):
                    leader._set_pid_gains_motors(
                        servo_id=i + 1,
                        p_gain=p_gains[i],
                        i_gain=0,
                        d_gain=d_gains[i],
                    )
                    time.sleep(0.05)

                if self.enable_haptic_feedback:
                    assert isinstance(follower, SO100Hardware)
                    baseline = follower.current_torque()
                    self._follower_torque_baseline[follower.name] = baseline
                    num_joints = len(leader.actuated_joints)
                    self._haptic_ema[leader.name] = np.zeros(num_joints)

    def _cleanup_robots(self) -> None:
        """Resets PID gains to their original values and disables torque."""
        logger.info("Cleaning up and resetting robots.")
        for pair in self.robot_pairs:
            leader = pair.leader
            follower = pair.follower

            leader.enable_torque()
            if (
                isinstance(leader, SO100Hardware)
                and leader.name in self.original_pid_gains
                and (self.enable_gravity_compensation or self.enable_haptic_feedback)
            ):
                # Reset PID gains to original values
                original_gains = self.original_pid_gains[leader.name]
                for i in range(len(original_gains)):
                    p_gain, _, d_gain = original_gains[i]
                    leader._set_pid_gains_motors(
                        servo_id=i + 1, p_gain=p_gain, i_gain=0, d_gain=d_gain
                    )
                    time.sleep(0.05)

            if (
                isinstance(follower, SO100Hardware)
                and follower.name in self.original_pid_gains
            ):
                original_gains = self.original_pid_gains[follower.name]
                for i in range(len(original_gains)):
                    p_gain, _, d_gain = original_gains[i]
                    follower._set_pid_gains_motors(
                        servo_id=i + 1, p_gain=p_gain, i_gain=0, d_gain=d_gain
                    )
                    time.sleep(0.05)

            leader.disable_torque()
            follower.disable_torque()

    def run(self) -> None:
        """The main control loop of the thread."""
        self._setup_robots()
        logger.info(
            f"Starting leader-follower control with {len(self.robot_pairs)} pairs of robots:"
            + ", ".join(
                f"{pair.leader.name} -> {pair.follower.name}"
                for pair in self.robot_pairs
            )
            + f"\ninvert_controls={self.invert_controls}\nenable_gravity_compensation={self.enable_gravity_compensation}"
            + f"\nenable_haptic_feedback={self.enable_haptic_feedback}"
            + (
                f"\nhaptic_feedback_strength={self.haptic_feedback_strength}%"
                if self.enable_haptic_feedback
                else ""
            )
            + (
                f"\ncompensation_values={self.compensation_values}"
                if self.compensation_values
                else ""
            )
        )

        try:
            while self.control_signal.is_in_loop():
                start_time = time.perf_counter()

                for pair in self.robot_pairs:
                    leader, follower = pair.leader, pair.follower
                    pos_rad = leader.read_joints_position(unit="rad", source="robot")

                    if any(np.isnan(pos_rad)):
                        logger.warning(
                            "Leader joint positions contain NaN values. Skipping."
                        )
                        continue

                    if self.enable_haptic_feedback:
                        assert isinstance(
                            leader, SO100Hardware
                        ), "Haptic feedback is only supported for SO100Hardware."
                        assert isinstance(
                            follower, SO100Hardware
                        ), "Haptic feedback is only supported for SO100Hardware."
                        self._haptic_feedback_step(
                            leader=leader, follower=follower, pos_rad=pos_rad
                        )
                    elif self.enable_gravity_compensation:
                        assert isinstance(
                            leader, SO100Hardware
                        ), "Gravity compensation is only supported for SO100Hardware."
                        assert isinstance(
                            follower, SO100Hardware
                        ), "Gravity compensation is only supported for SO100Hardware."
                        self._gravity_compensation_step(
                            leader=leader, follower=follower, pos_rad=pos_rad
                        )
                    else:
                        self._simple_mirroring_step(
                            leader=leader, follower=follower, pos_rad=pos_rad
                        )

                elapsed = time.perf_counter() - start_time
                sleep_time = max(0, self.loop_period - elapsed)
                time.sleep(sleep_time)
        except Exception as e:
            logger.error(f"Error in leader-follower control loop: {e}")
            self.control_signal.stop()
        finally:
            self._cleanup_robots()
            logger.info("Leader-follower control stopped.")

    def _simple_mirroring_step(
        self,
        leader: Union[BaseManipulator, RemoteRobot],
        follower: Union[BaseManipulator, RemoteRobot],
        pos_rad: np.ndarray,
    ) -> None:
        """Follower mirrors the leader's position."""
        if self.invert_controls:
            pos_rad[0] = -pos_rad[0]

        follower.control_gripper(
            open_command=leader._rad_to_open_command(
                pos_rad[leader.GRIPPER_JOINT_INDEX]
            )
        )

        if len(pos_rad) > len(follower.SERVO_IDS):
            if not self.warning_dropping_joints_displayed:
                logger.warning(
                    f"Leader has more joints than follower ({len(pos_rad)} > {len(follower.SERVO_IDS)}). "
                    "Dropping extra joints."
                )
                self.warning_dropping_joints_displayed = True
            pos_rad = pos_rad[: len(follower.SERVO_IDS)]

        follower.set_motors_positions(q_target_rad=pos_rad, enable_gripper=False)

    def _gravity_compensation_step(
        self,
        leader: SO100Hardware,
        follower: SO100Hardware,
        pos_rad: np.ndarray,
    ) -> None:
        """
        Performs a single control step with gravity compensation.

        - Calculates gravity torque for the leader.
        - Applies custom compensation values if provided.
        - Commands the leader with the compensated joint positions.
        - Makes the follower mirror the leader's resulting position.
        """
        assert isinstance(
            leader, SO100Hardware
        ), "Gravity compensation is only supported for SO100Hardware."
        assert isinstance(
            follower, SO100Hardware
        ), "Gravity compensation is only supported for SO100Hardware."

        # Control loop parameters
        num_joints = len(leader.actuated_joints)
        joint_indices = list(range(num_joints))

        # Update PyBullet simulation to calculate gravity torque
        for i, idx in enumerate(joint_indices):
            self.sim.set_joint_state(leader.p_robot_id, idx, pos_rad[i])

        tau_g = self.sim.inverse_dynamics(
            leader.p_robot_id,
            positions=list(pos_rad),
            velocities=[0.0] * num_joints,
            accelerations=[0.0] * num_joints,
        )
        tau_g = list(tau_g)

        # Apply custom compensation values if they exist
        if self.compensation_values is not None:
            for key, value in self.compensation_values.items():
                if key == "shoulder":
                    tau_g[1] *= value / 100
                elif key == "elbow":
                    tau_g[2] *= value / 100
                elif key == "wrist":
                    tau_g[3] *= value / 100
                else:
                    logger.debug(f"Unknown compensation key: {key}")

        # Apply gravity compensation torque to the leader's position
        theta_des_rad = pos_rad + self.alpha[:num_joints] * np.array(tau_g)
        leader.write_joint_positions(theta_des_rad, unit="rad")

        # Invert the base rotation if specified
        if self.invert_controls:
            theta_des_rad[0] = -theta_des_rad[0]

        # Mirror the leader's gripper position to the follower
        follower.control_gripper(
            open_command=leader._rad_to_open_command(
                theta_des_rad[leader.GRIPPER_JOINT_INDEX]
            )
        )

        # Ensure follower receives commands for the correct number of joints
        if len(theta_des_rad) > len(follower.SERVO_IDS):
            if not self.warning_dropping_joints_displayed:
                logger.warning(
                    f"Leader has more joints than follower ({len(theta_des_rad)} > {len(follower.SERVO_IDS)}). "
                    "Dropping extra joints for follower command."
                )
                self.warning_dropping_joints_displayed = (
                    True  # Ensure the warning is displayed only once
                )
            # Truncate the position array to match the follower's joint count
            theta_des_rad = theta_des_rad[: len(follower.SERVO_IDS)]

        # Command the follower to mirror the leader's final position
        follower.set_motors_positions(q_target_rad=theta_des_rad, enable_gripper=False)

    def _haptic_feedback_step(
        self,
        leader: SO100Hardware,
        follower: SO100Hardware,
        pos_rad: np.ndarray,
    ) -> None:
        """
        Leader-follower with haptic feedback.

        The follower mirrors the leader's position (like simple mirroring),
        but the leader also receives force feedback: when the follower
        encounters resistance (detected via motor current), a proportional
        position offset is applied to the leader so the operator feels
        the resistance through the arm.

        Uses gravity compensation on the leader for a compliant feel,
        then layers on the haptic feedback offset.
        """
        num_joints = len(leader.actuated_joints)
        joint_indices = list(range(num_joints))

        # --- Gravity compensation on leader (keeps it feeling weightless) ---
        for i, idx in enumerate(joint_indices):
            self.sim.set_joint_state(leader.p_robot_id, idx, pos_rad[i])

        tau_g = self.sim.inverse_dynamics(
            leader.p_robot_id,
            positions=list(pos_rad),
            velocities=[0.0] * num_joints,
            accelerations=[0.0] * num_joints,
        )
        tau_g = np.array(tau_g)

        if self.compensation_values is not None:
            for key, value in self.compensation_values.items():
                if key == "shoulder":
                    tau_g[1] *= value / 100
                elif key == "elbow":
                    tau_g[2] *= value / 100
                elif key == "wrist":
                    tau_g[3] *= value / 100

        theta_des_rad = pos_rad + self.alpha[:num_joints] * tau_g

        # --- Haptic feedback: read follower torque and push back on leader ---
        follower_torque = follower.current_torque()
        baseline = self._follower_torque_baseline.get(
            follower.name, np.zeros(num_joints)
        )
        torque_delta = follower_torque[:num_joints] - baseline[:num_joints]

        ema_smoothing = 0.3
        prev_ema = self._haptic_ema.get(leader.name, np.zeros(num_joints))
        smoothed = ema_smoothing * torque_delta + (1.0 - ema_smoothing) * prev_ema
        self._haptic_ema[leader.name] = smoothed

        strength = self.haptic_feedback_strength / 100.0
        haptic_gain = np.array([0.0, 0.002, 0.002, 0.001, 0.001, 0.001])[:num_joints]
        haptic_offset = -strength * haptic_gain * smoothed

        theta_des_rad = theta_des_rad + haptic_offset
        leader.write_joint_positions(theta_des_rad, unit="rad")

        # --- Mirror to follower ---
        follower_target = pos_rad.copy()
        if self.invert_controls:
            follower_target[0] = -follower_target[0]

        follower.control_gripper(
            open_command=leader._rad_to_open_command(
                follower_target[leader.GRIPPER_JOINT_INDEX]
            )
        )

        if len(follower_target) > len(follower.SERVO_IDS):
            if not self.warning_dropping_joints_displayed:
                logger.warning(
                    f"Leader has more joints than follower ({len(follower_target)} > {len(follower.SERVO_IDS)}). "
                    "Dropping extra joints for follower command."
                )
                self.warning_dropping_joints_displayed = True
            follower_target = follower_target[: len(follower.SERVO_IDS)]

        follower.set_motors_positions(
            q_target_rad=follower_target, enable_gripper=False
        )


@background_task_log_exceptions
async def start_leader_follower_loop(
    robot_pairs: list[RobotPair],
    control_signal: ControlSignal,
    invert_controls: bool,
    enable_gravity_compensation: bool,
    compensation_values: Optional[Dict[str, int]],
    enable_haptic_feedback: bool = False,
    haptic_feedback_strength: int = 50,
) -> None:
    """
    FastAPI background task that starts and manages the leader-follower
    control loop in a dedicated thread.
    """
    sim = get_sim()

    # Create and start the dedicated thread
    control_thread = LeaderFollowerThread(
        robot_pairs=robot_pairs,
        control_signal=control_signal,
        invert_controls=invert_controls,
        enable_gravity_compensation=enable_gravity_compensation,
        compensation_values=compensation_values,
        sim=sim,
        enable_haptic_feedback=enable_haptic_feedback,
        haptic_feedback_strength=haptic_feedback_strength,
    )
    control_thread.start()

    # The background task can return immediately, the thread will continue to run.
    # If you need to wait for the thread to finish (e.g., in a script),
    # you could add `control_thread.join()`. For FastAPI, we let it run.
    logger.info("Leader-follower control thread has been started.")
