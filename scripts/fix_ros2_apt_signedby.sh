#!/usr/bin/env bash
# Fix "Conflicting values set for option Signed-By" for ROS2 apt on Ubuntu.
# Run on the SSH machine: bash scripts/fix_ros2_apt_signedby.sh

set -e

echo "=== ROS2 apt Signed-By conflict fix ==="
echo ""

# Find all apt list files that mention ros2 or packages.ros.org
echo "Checking apt source files..."
grep -l "packages.ros.org/ros2" /etc/apt/sources.list.d/*.list 2>/dev/null || true
grep -l "packages.ros.org" /etc/apt/sources.list.d/*.list 2>/dev/null || true

# ros2-apt-source can use a different structure; list relevant files
echo ""
echo "Files in sources.list.d that might reference ROS:"
ls -la /etc/apt/sources.list.d/ | grep -E "ros|ROS" || true

# The conflict: one entry uses Signed-By=keyring file, another has the key inline.
# Remove any file that has "BEGIN PGP" in it (inline key).
for f in /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null; do
  [ -f "$f" ] || continue
  if grep -q "BEGIN PGP" "$f" 2>/dev/null; then
    echo ""
    echo "Found inline key in: $f (this causes the conflict)"
    echo "Backing up and removing..."
    sudo cp -a "$f" "${f}.bak"
    sudo rm -f "$f"
    echo "Removed $f (backup at ${f}.bak)"
  fi
done

# Ensure correct keyring exists
echo ""
echo "Ensuring ROS keyring is present..."
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg

# Ensure exactly one correct ros2 list (for noble = Ubuntu 24.04)
CODENAME=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-noble}")
ROS2_LIST="/etc/apt/sources.list.d/ros2.list"
if [ ! -f "$ROS2_LIST" ] || ! grep -q "signed-by=/usr/share/keyrings/ros-archive-keyring.gpg" "$ROS2_LIST" 2>/dev/null; then
  echo "Creating/fixing $ROS2_LIST for $CODENAME..."
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $CODENAME main" | sudo tee "$ROS2_LIST" > /dev/null
fi

echo ""
echo "Running apt update..."
sudo apt-get update

echo ""
echo "Done. Try: sudo apt install -y ros-jazzy-topic-tools"
