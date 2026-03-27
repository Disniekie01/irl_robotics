#!/usr/bin/env python3
"""
Read and optionally set STS3215 (SO-100) EEPROM angle limits.

By default servos may have restrictive Min_Angle_Limit / Max_Angle_Limit (e.g. 0–2338),
which can cause joints to stop mid-range. This script sets them to full range (0–4095)
so software/calibration controls the limits.

Usage (run from irl_robotics directory):
  uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM0           # read only
  uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write   # read then write full range
  uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM1 --write    # follower arm
  uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write --servo 5   # only gripper-rotate (Wrist_Roll)

Requires only one arm connected on the given port (servos 1–6).
Servo 5 = wrist_roll = gripper rotate; if it locks at a limit, set EEPROM to full range (0–4095).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow importing irl_robotics when run as script (irl_robotics/irl_robotics/scripts/ -> irl_robotics/irl_robotics is package root)
if __name__ == "__main__" and "__file__" in dir():
    _pkg_root = Path(__file__).resolve().parent.parent
    if str(_pkg_root) not in sys.path:
        sys.path.insert(0, str(_pkg_root))

from irl_robotics.hardware.motors.feetech import (
    FeetechMotorsBus,
    SCS_SERIES_CONTROL_TABLE,
)

SO100_MOTORS = {
    "shoulder_pan": (1, "sts3215"),
    "shoulder_lift": (2, "sts3215"),
    "elbow_flex": (3, "sts3215"),
    "wrist_flex": (4, "sts3215"),
    "wrist_roll": (5, "sts3215"),
    "gripper": (6, "sts3215"),
}

MIN_ADDR, MIN_BYTES = SCS_SERIES_CONTROL_TABLE["Min_Angle_Limit"]
MAX_ADDR, MAX_BYTES = SCS_SERIES_CONTROL_TABLE["Max_Angle_Limit"]
FULL_MIN, FULL_MAX = 0, 4095


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read and optionally set SO-100/STS3215 EEPROM angle limits to full range (0–4095)."
    )
    parser.add_argument(
        "--port",
        type=str,
        required=True,
        help="Serial port (e.g. /dev/ttyACM0 or /dev/ttyACM1)",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write Min=0 and Max=4095 (unlocks EEPROM, then writes).",
    )
    parser.add_argument(
        "--servo",
        type=int,
        default=None,
        metavar="N",
        help="If set with --write, only update this servo (1–6). e.g. 5 = gripper rotate (Wrist_Roll).",
    )
    args = parser.parse_args()

    bus = FeetechMotorsBus(port=args.port, motors=SO100_MOTORS)
    try:
        bus.connect()
    except Exception as e:
        print(f"Failed to connect to {args.port}: {e}")
        print("Ensure only one SO-100 arm is connected on this port and no other process is using it.")
        sys.exit(1)

    try:
        # Unlock EEPROM so we can write to Min/Max angle limits
        bus.write("Lock", 0)
        print("Unlocked EEPROM (Lock=0).")

        min_limits = bus.read("Min_Angle_Limit")
        max_limits = bus.read("Max_Angle_Limit")

        print("\nCurrent EEPROM angle limits (servo 1–6):")
        print("  Servo     Min_Angle_Limit  Max_Angle_Limit")
        for i, name in enumerate(SO100_MOTORS):
            mark = "  <-- gripper rotate" if (i + 1) == 5 else ""
            print(f"  {i+1} {name:14} {min_limits[i]:>10}        {max_limits[i]:>10}{mark}")
        if min_limits[4] != FULL_MIN or max_limits[4] != FULL_MAX:
            print("  (Servo 5 wrist_roll not full range; use --write [--servo 5] to fix locking at limit.)")

        if not args.write:
            print("\nNo write requested. Use --write to set all to Min=0, Max=4095.")
            return

        # Which servos to update
        if args.servo is not None:
            if not (1 <= args.servo <= 6):
                print(f"Error: --servo must be 1–6, got {args.servo}")
                return
            indices = [args.servo - 1]
            print(f"\nUpdating only servo {args.servo} ({list(SO100_MOTORS.keys())[args.servo - 1]}).")
        else:
            indices = list(range(6))

        # Build vectors: only change selected servos
        min_vals = [FULL_MIN if i in indices else min_limits[i] for i in range(6)]
        max_vals = [FULL_MAX if i in indices else max_limits[i] for i in range(6)]
        bus.write("Min_Angle_Limit", min_vals)
        bus.write("Max_Angle_Limit", max_vals)
        print(f"Written Min_Angle_Limit={FULL_MIN}, Max_Angle_Limit={FULL_MAX} for selected servo(s).")

        # Verify
        min_after = bus.read("Min_Angle_Limit")
        max_after = bus.read("Max_Angle_Limit")
        ok = all(min_after[i] == (FULL_MIN if i in indices else min_limits[i]) for i in range(6)) and all(
            max_after[i] == (FULL_MAX if i in indices else max_limits[i]) for i in range(6)
        )
        if ok:
            print("Verified: limits updated successfully.")
        else:
            print("Warning: read-back differs from expected:", min_after, max_after)
    finally:
        if bus.is_connected:
            bus.disconnect()
        print("Disconnected.")


if __name__ == "__main__":
    main()
