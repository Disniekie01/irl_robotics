from setuptools import setup
import os
from glob import glob

package_name = 'irl_teleop'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.py')),
        (os.path.join('share', package_name, 'config'), glob('config/*.yaml')),
    ],
    install_requires=['setuptools', 'websockets', 'numpy', 'requests'],
    zip_safe=True,
    maintainer='Disniekie',
    maintainer_email='disniekie@irlrobotics.dev',
    description='IRL Robotics teleoperation interface for SO-ARM101 robot via ROS2',
    license='MIT',
    entry_points={
        'console_scripts': [
            'irl_teleop_node = irl_teleop.irl_teleop_node:main',
            'irl_leader_controller = irl_teleop.irl_leader_controller:main',
            'irl_status_monitor = irl_teleop.irl_status_monitor:main',
            'irl_http_teleop = irl_teleop.irl_http_teleop:main',
        ],
    },
)
