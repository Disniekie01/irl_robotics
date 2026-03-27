# Isaac Sim setup (same as Humble)

Use the **same** setup you used with Humble. Jazzy only changes which ROS2 distro is sourced; the topics and joint names are unchanged.

- **Topic:** Subscribe to **`joint_command`** (or `isaac_joint_command`) in the ROS2 Subscribe Joint State node.
- **Joint names:** Rotation, Pitch, Elbow, Wrist_Pitch, Wrist_Roll, Jaw (SO-100 / SO-ARM101).
- **Wiring:** Subscribe Joint State → Articulation Controller → your robot prim.

If it worked on Humble with that configuration, use the same in Isaac when running with Jazzy.
