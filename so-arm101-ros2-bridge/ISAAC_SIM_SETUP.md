# Isaac Sim setup (same as Humble)

Use the **same** setup you used with Humble. Jazzy only changes which ROS2 distro is sourced; the topics and joint names are unchanged.

- **Topic:** Subscribe to **`joint_command`** (or `isaac_joint_command`) in the ROS2 Subscribe Joint State node.
- **Joint names:** Rotation, Pitch, Elbow, Wrist_Pitch, Wrist_Roll, Jaw (SO-100 / SO-ARM101).
- **Wiring:** Subscribe Joint State → Articulation Controller → your robot prim.

If it worked on Humble with that configuration, use the same in Isaac when running with Jazzy.

**Rotation:** With HTTP teleop, `flip_rotation_for_isaac` (default **true**) **negates only the Rotation** entry in the published `sensor_msgs/JointState` on `/joint_states` before relays send it to Isaac—i.e. flip the joint state, not the hardware. Toggle in **Dashboard → ROS2 Bridge** if the sim is mirrored. For a permanent fix, adjust the **Rotation** revolute axis in USD.
