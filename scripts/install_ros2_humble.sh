#!/usr/bin/env bash
# Install ROS2 Humble and topic_tools (for Isaac Sim relays).
# Run on Ubuntu 22.04. Usage: bash scripts/install_ros2_humble.sh

set -e

# Locale
sudo apt-get update
sudo apt-get install -y locales
sudo locale-gen en_US en_US.UTF-8
sudo update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
export LANG=en_US.UTF-8

# Add ROS2 apt repo
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y universe
sudo apt-get update && sudo apt-get install -y curl
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) main" | sudo tee /etc/apt/sources.list.d/ros2.list > /dev/null

# Install ROS2 Humble + topic_tools
sudo apt-get update
sudo apt-get install -y ros-humble-desktop ros-humble-topic-tools

# Source in this shell
source /opt/ros/humble/setup.bash
echo ""
echo "ROS2 Humble installed. Add to your shell profile:"
echo "  source /opt/ros/humble/setup.bash"
echo ""
echo "Verify: ros2 --help"
