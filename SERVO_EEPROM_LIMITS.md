# SO-100 / STS3215 EEPROM angle limits

The Feetech STS3215 servos store **Min_Angle_Limit** and **Max_Angle_Limit** in EEPROM. If these are too narrow (e.g. Max_Angle_Limit = 2338 on wrist pitch), the joint will stop mid-range and teleop or calibration will be wrong. Setting them to full range (0–4095) lets software and calibration control the limits.

## Check current limits (read only)

From the **irl_robotics** source directory (the folder that contains the inner `irl_robotics/` package and `scripts/`):

```bash
cd irl_robotics
uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM0
```

Use `/dev/ttyACM1` for the other arm if you have leader and follower. You’ll see a table of Min/Max for servos 1–6.

## Set limits to full range (0–4095)

**Stop the IRL Robotics server and any process using the arm** (no other process should be talking to the servos). Then:

```bash
cd irl_robotics
uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write
```

Do the same for the follower arm if needed:

```bash
uv run python scripts/set_eeprom_limits.py --port /dev/ttyACM1 --write
```

The script:

1. Unlocks EEPROM (Lock=0).
2. Reads and prints current Min/Max for all 6 servos.
3. If `--write`: writes Min_Angle_Limit=0 and Max_Angle_Limit=4095 for every servo, then verifies.

Limits are **per physical arm** (per serial port). Each arm needs to be updated separately.

## STS3215 memory map (relevant)

| Name             | Address | Size | Notes        |
|------------------|--------|------|--------------|
| Min_Angle_Limit  | 9      | 2    | 0–4095       |
| Max_Angle_Limit  | 11     | 2    | 0–4095       |
| Lock             | 55     | 1    | 0 = unlock   |

Full table: [STS3215 Memory Table](https://docs.google.com/spreadsheets/d/1GVs7W1VS1PqdhA1nW-abeyAHhTUxKUdR/edit).

## If you need custom limits

Edit `irl_robotics/scripts/set_eeprom_limits.py`: change `FULL_MIN` and `FULL_MAX`, or add arguments for per-servo limits. The irl_robotics Feetech bus API is in `irl_robotics.hardware.motors.feetech` (`read` / `write` with names `"Min_Angle_Limit"`, `"Max_Angle_Limit"`).
