# How to Install IRL Robotics (IRL Robotics) — Step by Step

This guide is for people who are not used to the terminal. **Copy and paste each block of commands** in order. If something asks for your password, type it and press Enter (you won’t see the characters).

---

## What you need before starting

- A computer running **Ubuntu** or **Pop!_OS** (Linux).
- The robot arm(s) **not** plugged in until we say so.
- About 15–20 minutes.

---

## Part 1: Open the terminal

1. Press **Ctrl+Alt+T** (or open “Terminal” from your app menu).
2. You should see a window with a line ending in `$`. That’s where you will paste the commands below.

---

## Part 2: Install everything (clone + install)

**Step 1 — Go to your home folder**

```bash
cd ~
```

Press Enter.

---

**Step 2 — Install Git LFS (so USD and other large files download correctly)**

The project uses **Git LFS** (Large File Storage) for big files like **USD** scene files (used with Isaac Sim). You need to install and turn on LFS **before** you clone, so those files are downloaded properly.

Run these two commands:

```bash
sudo apt-get update
sudo apt-get install -y git-lfs
```

Then turn on LFS for your user (you only need to do this once per computer):

```bash
git lfs install
```

You should see: “Git LFS initialized.” or similar.

---

**Step 3 — Clone the project (download the code)**

Paste this and press Enter:

```bash
git clone https://github.com/Disniekie01/irl_robotics.git
```

Wait until it finishes. LFS will pull the large files (e.g. USDs) automatically. You should see something like “done” or a list of files.

**If you already cloned without Git LFS** and later see missing or tiny USD files, run this inside the project folder:

```bash
cd ~/irl_robotics
git lfs pull
```

---

**Step 3b — Get the submodules (docs and bullet3)**

This repo uses **submodules** for the `docs` and `bullet3` folders. After cloning, run:

```bash
cd ~/irl_robotics
git submodule update --init --recursive
```

That downloads the contents of those folders. You only need to do this once after the first clone.

**Optional:** To clone and fetch submodules in one go, use:

```bash
git clone --recurse-submodules https://github.com/Disniekie01/irl_robotics.git
```

Then continue with Step 4.

---

**Step 4 — Run the install script**

This installs Python, Node, and other things the project needs. Paste this and press Enter:

```bash
cd ~/irl_robotics && bash install.sh
```

- If it asks for your **password**, type it and press Enter.
- It can take several minutes. Wait until you see **“Installation complete!”**.

---

**Step 5 — If it said “re-login for serial port access”**

- Close the terminal and open it again (or log out and log back in).
- Then run this so the computer can talk to the robot over USB right away (you may need your password):

```bash
sudo chmod 666 /dev/ttyACM*
```

---

## Part 3: Build the dashboard and run the app

**Step 6 — Build the web dashboard**

From the terminal, run:

```bash
cd ~/irl_robotics
make build_frontend
```

Wait until it finishes without errors.

---

**Step 7 — Prepare data dir + Start the IRL Robotics server (Linux)**

This app writes recordings/config/calibration to a directory called `IRL_ROBOTICS_HOME`.
On Linux, make sure it points to a writable place (otherwise you can get a `PermissionError`).

Run:

```bash
export IRL_ROBOTICS_HOME="$HOME/irl_robotics-data"
mkdir -p "$IRL_ROBOTICS_HOME"
```

We also force `uv` to use **Python 3.10** when starting the server.
If you see an error about `fastparquet` wheels (or it tries to install `fastparquet==2026.x`), it is usually because the wrong Python version was selected by `uv`.

If you hit a `PermissionError` very early with multiprocessing/logging related text, update to the latest code and rerun. (We adjusted logging to avoid multiprocessing primitives in restricted Linux environments.)

Run:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 irlrobotics run --simulation=headless --port 8020 --no-telemetry
```

- Leave this terminal window **open** while you use the app.
- Open a **web browser** and go to: **http://localhost:8020**
- You should see the IRL Robotics dashboard.

To stop the server later: press **Ctrl+C** in that terminal.

---

## Part 3b: If you use ROS2 Jazzy (topic tools and teleop node)

If you have **ROS2 Jazzy** installed and use the **ROS2 Bridge** page (e.g. for Isaac Sim or the teleop node), do these steps once.

**Step 7b — Install topic tools (for relays)**

The dashboard’s “Start relays” needs the `topic_tools` package. In the terminal, run:

```bash
sudo apt update
sudo apt install -y ros-jazzy-topic-tools
```

Without this, relays will fail when you click “Start relays” or “Start all” on the ROS2 Bridge page.

---

**Step 7c — Build the ROS2 bridge (so the teleop node works)**

If **“Start teleop”** on the ROS2 Bridge page does nothing or says the teleop node failed, the bridge workspace may not be built yet. Build it once:

```bash
cd ~/irl_robotics/so-arm101-ros2-bridge
source /opt/ros/jazzy/setup.bash
colcon build
```

Wait until it finishes. Then restart the IRL Robotics server (Step 7) and try “Start teleop” again on the ROS2 Bridge page.

---

**Step 7d — Try the app with a simulated robot (no hardware)**

If you want to test the dashboard **without a real robot** and still see “Robot connected” and use Control:

```bash
cd ~/irl_robotics
make sim
```

Or from the inner folder:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 irlrobotics run --simulation=headless --only-simulation --simulate-cameras --port 8020 --no-telemetry
```

Then open **http://localhost:8020**. The simulated SO-100 will show as connected and you can use Control (keyboard, gamepad, sliders).

---

## Part 4: Change the servo (angle) limits

The robot arms use servos that have **angle limits** stored in memory. Sometimes these limits are too narrow and a joint can “lock” or not move fully. You can set them to the full range (0–4095) so the software can control the limits.

**Important:**

- **Only one arm** should be plugged in via USB for each command below.
- **Stop the IRL Robotics server** (Ctrl+C in the terminal where it’s running) before changing limits.
- Do **not** move the robot while the limit script is running.

---

**Step 8 — Plug in one arm and find its port**

1. Plug in **only one** robot arm to the computer with USB.
2. In the terminal, run:

```bash
ls /dev/ttyACM*
```

You should see something like `/dev/ttyACM0` or `/dev/ttyACM1`.  
Use that name in the next steps (we use `/dev/ttyACM0` in the examples; if you see `/dev/ttyACM1`, use that instead).

---

**Step 9 — Check current limits (read only)**

This only **reads** the limits; it does not change anything:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0
```

Replace `/dev/ttyACM0` with your port if it’s different. You’ll see a table of Min/Max for each servo.

---

**Step 10 — Set all servos on this arm to full range**

This **writes** the limits to full range (0–4095) for all 6 servos on the arm connected to that port:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write
```

Again, use your port (e.g. `/dev/ttyACM1`) if it’s different. Wait until it says it’s done.

---

**Step 11 — If you have a second arm (follower)**

1. Unplug the first arm.
2. Plug in the **second** arm only.
3. Run the same command with the port that appears for this arm (often `/dev/ttyACM0` again when it’s the only one plugged in):

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write
```

---

**Step 12 — Only the gripper rotate (wrist roll) is stuck**

If only the **gripper rotate** (wrist roll, servo 5) feels locked, you can update just that servo:

```bash
cd ~/irl_robotics/irl_robotics
uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write --servo 5
```

Use your actual port instead of `/dev/ttyACM0` if needed.

---

## Quick reference — copy-paste summary

| What you want to do | Commands |
|---------------------|----------|
| **Install Git LFS (before first clone)** | `sudo apt-get install -y git-lfs` then `git lfs install` |
| **Get submodules after clone** | `cd ~/irl_robotics` then `git submodule update --init --recursive` |
| **First-time install** | `cd ~` then `git clone https://github.com/Disniekie01/irl_robotics.git` then `cd ~/irl_robotics && bash install.sh` |
| **Build dashboard** | `cd ~/irl_robotics` then `make build_frontend` |
| **Start the app** | `cd ~/irl_robotics/irl_robotics` then `uv run --python 3.10 irlrobotics run --simulation=headless --port 8020 --no-telemetry` then open **http://localhost:8020** in browser |
| **Control from phone** | On the same Wi‑Fi, open **http://\<computer-ip\>:8020/mobile** in your phone’s browser for touch-friendly control |
| **See servo ports** | `ls /dev/ttyACM*` |
| **Read limits (no change)** | `cd ~/irl_robotics/irl_robotics` then `uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0` |
| **Set full limits (one arm)** | Stop server, plug one arm, then `cd ~/irl_robotics/irl_robotics` then `uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write` |
| **Set full limits (gripper only)** | `cd ~/irl_robotics/irl_robotics` then `uv run --python 3.10 python scripts/set_eeprom_limits.py --port /dev/ttyACM0 --write --servo 5` |
| **ROS2 Jazzy: install topic tools** | `sudo apt install -y ros-jazzy-topic-tools` |
| **ROS2 Jazzy: build bridge (teleop node)** | `cd ~/irl_robotics/so-arm101-ros2-bridge` then `source /opt/ros/jazzy/setup.bash` then `colcon build` |
| **Run with simulated robot** | `cd ~/irl_robotics` then `make sim` then open **http://localhost:8020** in browser |

---

## If the UI (dashboard) does not build correctly

The **UI** is the web page you see at http://localhost:8020 (buttons, sliders, camera view). It is built from the `dashboard` folder using **Node.js** and **npm**. If that build fails, the server may start but the page will be blank or show an error.

**What to try, in order:**

**1. Make sure Node.js and npm are installed**

In the terminal, run:

```bash
node --version
npm --version
```

- If you see “command not found”, Node is missing. Run the install script again so it can install Node (e.g. via nvm):

  ```bash
  cd ~/irl_robotics && bash install.sh
  ```

- If you closed the terminal after install, you may need to load nvm first, then try building again:

  ```bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  cd ~/irl_robotics
  make build_frontend
  ```

**2. Build the dashboard again from the project root**

Always run the build from the **repo root** (the folder that contains both `dashboard` and `irl_robotics`):

```bash
cd ~/irl_robotics
make build_frontend
```

Wait until it finishes. If it stops with red error text, go to step 3.

**3. Clean and rebuild the dashboard**

Sometimes old or broken files cause the build to fail. Clean them and try again:

```bash
cd ~/irl_robotics/dashboard
rm -rf node_modules dist
npm install
npm run build
```

If that works, copy the built files into the place the server expects:

```bash
mkdir -p ~/irl_robotics/irl_robotics/resources/dist
cp -r ~/irl_robotics/dashboard/dist/* ~/irl_robotics/irl_robotics/resources/dist/
```

Then start the server again (see Step 7 in Part 3).

**4. Check the error message**

- **“npm ERR!” or “node-gyp”** — Often means a dependency failed to compile. Try step 3; if it still fails, make sure you ran `bash install.sh` (it installs build tools). You can also try: `cd ~/irl_robotics/dashboard` then `npm install --legacy-peer-deps` then `npm run build`.
- **“EACCES” or “permission denied”** — Do not use `sudo` with `npm install`. Fix folder ownership if needed: `sudo chown -R $USER:$USER ~/irl_robotics`.
- **“The 'dist' directory does not exist”** when starting the server — The UI was never built or the copy failed. Run `cd ~/irl_robotics` then `make build_frontend` again, then start the server.

**5. You can still run the server without the UI**

If you only need the API (e.g. another app talks to the robot), the server can run without the dashboard. The web page at http://localhost:8020 may be blank or show an error, but the backend is still running. To get the full UI working, you must fix the dashboard build (steps 1–4 above).

---

## If something goes wrong

- **“dist directory does not exist”**  
  Run: `cd ~/irl_robotics` then `make build_frontend`, then try starting the server again.

- **Robot / serial port not found**  
  Make sure you’re in the `dialout` group: run `sudo usermod -aG dialout $USER`, then log out and log back in. Then try `sudo chmod 666 /dev/ttyACM*` again.

- **Permission denied on /dev/ttyACM0**  
  Run: `sudo chmod 666 /dev/ttyACM*` (you may need to do this after each reboot).

- **Script says “only one arm”**  
  Unplug all arms, plug in only the one you want to change, and run the command again.

- **USD files missing or very small after clone**  
  The repo uses Git LFS for USD (Isaac Sim) files. Install LFS and pull: `sudo apt-get install -y git-lfs`, then `git lfs install`, then inside the project run `git lfs pull`. Next time, install LFS *before* cloning (see Step 2 in Part 2).

- **docs or bullet3 folder is empty**  
  The repo uses submodules for those folders. Run `cd ~/irl_robotics` then `git submodule update --init --recursive` to download them. Or next time clone with: `git clone --recurse-submodules https://github.com/Disniekie01/irl_robotics.git`.

- **ROS2 Jazzy: "Start relays" or relays fail**  
  Install topic tools: `sudo apt install -y ros-jazzy-topic-tools`. Then try "Start relays" or "Start all" again on the ROS2 Bridge page.

- **ROS2 Jazzy: "Start teleop" does nothing or teleop node fails**  
  Build the bridge workspace once: `cd ~/irl_robotics/so-arm101-ros2-bridge`, then `source /opt/ros/jazzy/setup.bash`, then `colcon build`. Restart the IRL Robotics server and try "Start teleop" again.

- **Dashboard says "Robot disconnected" but I'm only testing (no hardware)**  
  Run with the simulated robot so it shows as connected: `cd ~/irl_robotics` then `make sim`, then open http://localhost:8020. See Part 3b, Step 7d.

If you’re still stuck, check **HOW_TO_RUN.md** and **irl_robotics/docs/SERVO_EEPROM_LIMITS.md** in the project for more detail.
