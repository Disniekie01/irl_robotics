#!/bin/bash
set -e

# IRL Robotics - Installation Script
# Installs the complete IRL Robotics stack on a fresh Ubuntu machine
# Usage: curl -sSL https://raw.githubusercontent.com/Disniekie01/irl_robotics/main/install.sh | bash
#   OR: git clone https://github.com/Disniekie01/irl_robotics.git && cd irl_robotics && bash install.sh

echo "============================================"
echo "  IRL Robotics - Installation Script"
echo "============================================"
echo ""

# Ensure uv and npm are on PATH (for current run and after install)
export PATH="$HOME/.local/bin:$PATH"

# Determine install directory (repo root = directory containing dashboard/ and irl_robotics/)
INSTALL_DIR="${IRL_INSTALL_DIR:-$HOME/irl_robotics}"
if [ -f "$(pwd)/irl_robotics/pyproject.toml" ]; then
    INSTALL_DIR="$(pwd)"
    echo "Using existing repo at: $INSTALL_DIR"
elif [ -f "$(pwd)/irl_robotics/irl_robotics/pyproject.toml" ]; then
    INSTALL_DIR="$(pwd)/irl_robotics"
    echo "Using existing repo at: $INSTALL_DIR"
else
    echo "Install directory: $INSTALL_DIR"
fi

# ============================================
# 1. System dependencies (optional - skip if sudo not available)
# ============================================
echo ""
echo "[1/6] Installing system dependencies..."
if sudo -n true 2>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq \
        git curl wget build-essential \
        python3-dev python3-pip \
        libgl1-mesa-glx libglib2.0-0 \
        libudev-dev \
        v4l-utils \
        2>/dev/null || true
    if ! groups "$USER" | grep -q dialout; then
        sudo usermod -aG dialout "$USER" 2>/dev/null && echo "  Added $USER to dialout group (re-login for serial access)" || true
    fi
    echo "  System dependencies installed"
else
    echo "  Skipping system deps (run with sudo or: sudo apt-get install -y git curl build-essential python3-dev libgl1-mesa-glx libudev-dev v4l-utils)"
fi

# ============================================
# 2. Install uv (Python package manager)
# ============================================
echo ""
echo "[2/6] Installing uv..."
if ! command -v uv &> /dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    (grep -q '\.local/bin' ~/.bashrc 2>/dev/null) || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    echo "  uv installed"
fi
if command -v uv &> /dev/null; then
    echo "  uv ready: $(uv --version)"
else
    echo "  ERROR: uv not found. Install manually: curl -LsSf https://astral.sh/uv/install.sh | sh" && exit 1
fi

# ============================================
# 3. Install Node.js (for dashboard)
# ============================================
echo ""
echo "[3/6] Installing Node.js..."
# Load nvm if present so node/npm are available later
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if ! command -v node &> /dev/null; then
    if [ ! -d "$NVM_DIR" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    fi
    nvm install 20
    nvm use 20
    echo "  Node.js $(node --version) installed"
else
    echo "  Node.js already installed ($(node --version))"
fi

# ============================================
# 4. Clone/update the repository
# ============================================
echo ""
echo "[4/6] Setting up repository..."
if [ ! -f "$INSTALL_DIR/irl_robotics/pyproject.toml" ]; then
    git clone https://github.com/Disniekie01/irl_robotics.git "$INSTALL_DIR"
    echo "  Cloned to $INSTALL_DIR"
else
    echo "  Repository already exists at $INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ============================================
# 5. Install Python dependencies & build dashboard
# ============================================
echo ""
echo "[5/6] Installing Python dependencies..."
# Use cache inside repo to avoid permission issues with ~/.local/share/uv
export UV_CACHE_DIR="${UV_CACHE_DIR:-$INSTALL_DIR/.uv-cache}"
export UV_DATA_DIR="${UV_DATA_DIR:-$INSTALL_DIR/.uv-data}"
mkdir -p "$UV_CACHE_DIR" "$UV_DATA_DIR"
cd "$INSTALL_DIR/irl_robotics"
uv sync --python 3.10
echo "  Python dependencies installed"

echo ""
echo "Building dashboard..."
if ! command -v npm &> /dev/null; then
    echo "  WARNING: npm not found. Install Node.js (e.g. nvm install 20) and re-run, or skip dashboard with SKIP_DASHBOARD=1"
    if [ "${SKIP_DASHBOARD:-0}" = "1" ]; then
        echo "  Skipping dashboard (SKIP_DASHBOARD=1)"
    else
        exit 1
    fi
else
    cd "$INSTALL_DIR/dashboard"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    npm install --silent
    npm run build
    mkdir -p "$INSTALL_DIR/irl_robotics/resources/dist/"
    cp -r ./dist/* "$INSTALL_DIR/irl_robotics/resources/dist/"
    echo "  Dashboard built"
fi

# ============================================
# 6. Install ROS2 bridge (optional - only if ROS2 is available)
# ============================================
echo ""
echo "[6/6] ROS2 bridge setup..."
ROS_DISTRO_USED=""
if [ -f "/opt/ros/jazzy/setup.bash" ]; then
    ROS_DISTRO_USED="jazzy"
elif [ -f "/opt/ros/humble/setup.bash" ]; then
    ROS_DISTRO_USED="humble"
fi
if [ -n "$ROS_DISTRO_USED" ]; then
    echo "  ROS2 $ROS_DISTRO_USED detected, building bridge..."
    source "/opt/ros/$ROS_DISTRO_USED/setup.bash"
    cd "$INSTALL_DIR/so-arm101-ros2-bridge"
    colcon build 2>/dev/null
    echo "  ROS2 bridge built"
    echo "  Install topic_tools for relays: sudo apt install -y ros-$ROS_DISTRO_USED-topic-tools"
    echo "  Source it with: source $INSTALL_DIR/so-arm101-ros2-bridge/install/setup.bash"
else
    echo "  ROS2 not found - skipping bridge build (optional)"
    echo "  Install ROS2 Jazzy or Humble and ros-<distro>-topic-tools if you need Isaac Sim integration"
fi

# ============================================
# Done!
# ============================================
echo ""
echo "============================================"
echo "  Installation complete!"
echo "============================================"
echo ""
echo "To start IRL Robotics:"
echo "  cd $INSTALL_DIR/irl_robotics"
echo "  uv run --python 3.10 irlrobotics run"
echo ""
echo "Or use make:"
echo "  cd $INSTALL_DIR"
echo "  make prod"
echo ""
echo "Dashboard will be at: http://localhost:8020"
echo ""
echo "NOTE: If this is first run, you may need to:"
echo "  1. Re-login for serial port access (dialout group)"
echo "  2. Run 'sudo chmod 666 /dev/ttyACM*' for immediate access"
echo "  3. Calibrate your robots through the dashboard"
echo ""
