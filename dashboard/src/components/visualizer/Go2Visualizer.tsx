import { OrbitControls, Grid } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import URDFLoader from "urdf-loader";

const GO2_URDF_URL = "/urdf/go2_description/urdf/go2_description.urdf";

type URDFRobot = THREE.Object3D & {
  joints: Record<string, { setJointValue: (value: number) => void }>;
};

function Go2Model({ joints }: { joints: Record<string, number> }) {
  const rootRef = useRef<THREE.Group>(null);
  const robotRef = useRef<URDFRobot | null>(null);
  const targetRef = useRef(joints);

  targetRef.current = joints;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const loader = new URDFLoader();
    loader.packages = {
      go2_description: "/urdf/go2_description",
    };
    loader.loadMeshCb = (path, manager, onComplete) => {
      const colladaLoader = new ColladaLoader(manager);
      colladaLoader.load(
        path,
        (collada) => {
          onComplete(collada?.scene ?? new THREE.Group());
        },
        undefined,
        () => onComplete(new THREE.Group()),
      );
    };

    let cancelled = false;
    loader.load(
      GO2_URDF_URL,
      (robot) => {
        if (cancelled) return;
        robot.rotation.x = -Math.PI / 2;
        robot.position.y = 0.35;
        root.add(robot);
        robotRef.current = robot as URDFRobot;
      },
      undefined,
      (err) => {
        console.error("Failed to load Go2 URDF", err);
      },
    );

    return () => {
      cancelled = true;
      if (robotRef.current && root) {
        root.remove(robotRef.current);
        robotRef.current = null;
      }
    };
  }, []);

  useFrame(() => {
    const robot = robotRef.current;
    if (!robot?.joints) return;
    for (const [name, angle] of Object.entries(targetRef.current)) {
      const joint = robot.joints[name];
      if (joint) joint.setJointValue(angle);
    }
  });

  return <group ref={rootRef} />;
}

export function Go2Visualizer({
  joints,
  height = 360,
}: {
  joints: Record<string, number>;
  height?: number;
}) {
  return (
    <div
      className="rounded-lg border border-border overflow-hidden bg-muted/30"
      style={{ height }}
    >
      <Canvas shadows camera={{ position: [1.8, 1.2, 1.8], fov: 45 }}>
        <color attach="background" args={["#0f1117"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 6, 3]} intensity={1.1} castShadow />
        <Grid
          infiniteGrid
          fadeDistance={12}
          cellSize={0.25}
          sectionSize={1}
          cellColor="#334155"
          sectionColor="#475569"
        />
        <Suspense fallback={null}>
          <Go2Model joints={joints} />
        </Suspense>
        <OrbitControls makeDefault target={[0, 0.25, 0]} />
      </Canvas>
    </div>
  );
}
