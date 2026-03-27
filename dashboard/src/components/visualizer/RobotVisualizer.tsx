import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useRef, useState, useEffect, useCallback, useMemo, Suspense } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useLoader } from "@react-three/fiber";
import { fetchWithBaseUrl } from "@/lib/utils";

const LERP_FACTOR = 0.25;

const JOINT_NAMES = ["Rotation", "Pitch", "Elbow", "Wrist Pitch", "Wrist Roll", "Jaw"];
const JOINT_COLORS = ["#6366f1", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6"];

const MESH_BASE = "/urdf/so-100/meshes/";

const ARM_MATERIAL_PROPS = {
  color: "#b0b8d0",
  metalness: 0.5,
  roughness: 0.35,
};

function STLMesh({ url, material }: { url: string; material?: THREE.MeshStandardMaterialParameters }) {
  const geometry = useLoader(STLLoader, url);
  const mat = useMemo(() => material ?? ARM_MATERIAL_PROPS, [material]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

function useLerpedAngles(target: number[]) {
  const current = useRef([0, 0, 0, 0, 0, 0]);
  useFrame(() => {
    for (let i = 0; i < 6; i++) {
      const t = target[i] ?? 0;
      current.current[i] += (t - current.current[i]) * LERP_FACTOR;
    }
  });
  return current;
}

function SO100Arm({ jointAngles }: { jointAngles: number[] }) {
  const targets = useMemo(() => {
    return jointAngles.length >= 6 ? jointAngles : [0, 0, 0, 0, 0, 0];
  }, [jointAngles]);
  const lerpRef = useLerpedAngles(targets);
  const a = lerpRef.current;

  // URDF joint origins and axes encoded directly from the URDF
  // Joint: Rotation — origin xyz="0 -0.0452 0.0165" rpy="1.5708 0 0", axis=[0,1,0]
  // Joint: Pitch — origin xyz="0 0.1025 0.0306" rpy="0 0 0", axis=[1,0,0]
  // Joint: Elbow — origin xyz="0 0.11257 0.028" rpy="0 0 0", axis=[1,0,0]
  // Joint: Wrist_Pitch — origin xyz="0 0.0052 0.1349" rpy="-1.6 0 0", axis=[1,0,0]
  // Joint: Wrist_Roll — origin xyz="0 -0.0601 0" rpy="0 -3.14 0", axis=[0,1,0]
  // Joint: Jaw — origin xyz="-0.0202 -0.0244 0" rpy="3.1416 0 3.35", axis=[0,0,1]

  const rotEuler = (r: number, p: number, y: number) => new THREE.Euler(r, p, y, "XYZ");

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Base link */}
      <STLMesh url={`${MESH_BASE}Base.STL`} />

      {/* Rotation joint */}
      <group position={[0, -0.0452, 0.0165]} rotation={rotEuler(1.5708, 0, 0)}>
        <group rotation={[0, a[0], 0]}>
          <STLMesh url={`${MESH_BASE}Rotation_Pitch.STL`} />

          {/* Pitch joint */}
          <group position={[0, 0.1025, 0.0306]}>
            <group rotation={[a[1], 0, 0]}>
              <STLMesh url={`${MESH_BASE}Upper_Arm.STL`} />

              {/* Elbow joint */}
              <group position={[0, 0.11257, 0.028]}>
                <group rotation={[a[2], 0, 0]}>
                  <STLMesh url={`${MESH_BASE}Lower_Arm.STL`} />

                  {/* Wrist Pitch joint */}
                  <group position={[0, 0.0052, 0.1349]} rotation={rotEuler(-1.6, 0, 0)}>
                    <group rotation={[a[3], 0, 0]}>
                      <STLMesh url={`${MESH_BASE}Wrist_Pitch_Roll.STL`} />

                      {/* Wrist Roll joint */}
                      <group position={[0, -0.0601, 0]} rotation={rotEuler(0, -3.14, 0)}>
                        <group rotation={[0, a[4], 0]}>
                          <STLMesh url={`${MESH_BASE}Fixed_Jaw.STL`} />

                          {/* Jaw joint */}
                          <group position={[-0.0202, -0.0244, 0]} rotation={rotEuler(3.1416, 0, 3.35)}>
                            <group rotation={[0, 0, a[5]]}>
                              <STLMesh url={`${MESH_BASE}Moving%20Jaw.STL`} />
                            </group>
                          </group>
                        </group>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.02, 0.02, 0.02]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  );
}

function Scene({ jointAngles }: { jointAngles: number[] }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 4, 2]} intensity={0.9} castShadow />
      <directionalLight position={[-1, 2, -1]} intensity={0.3} />
      <pointLight position={[0, 0.3, 0.1]} intensity={0.15} color="#818cf8" />
      <Suspense fallback={<LoadingFallback />}>
        <SO100Arm jointAngles={jointAngles} />
      </Suspense>
      <Grid
        args={[2, 2]}
        cellSize={0.05}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={0.2}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={1.5}
        fadeStrength={1}
        infiniteGrid
        position={[0, -0.01, 0]}
      />
      <OrbitControls
        makeDefault
        minDistance={0.1}
        maxDistance={1.2}
        target={[0, 0.1, 0.08]}
        enableDamping
        dampingFactor={0.1}
      />
    </>
  );
}

function JointReadout({ angles }: { angles: number[] }) {
  return (
    <div className="absolute bottom-3 left-3 bg-card/90 border border-border rounded-lg px-3 py-2 text-xs space-y-0.5">
      {JOINT_NAMES.map((name, i) => (
        <div key={name} className="flex items-center gap-2">
          <div
            className="size-2 rounded-full"
            style={{ backgroundColor: JOINT_COLORS[i] }}
          />
          <span className="text-muted-foreground w-20">{name}</span>
          <span className="font-mono text-foreground">
            {angles[i] !== undefined ? `${(angles[i] * 180 / Math.PI).toFixed(1)}°` : "--"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RobotVisualizer({ className }: { className?: string }) {
  const [jointAngles, setJointAngles] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJoints = useCallback(async () => {
    try {
      const res = await fetchWithBaseUrl(
        "/joints/read",
        "POST",
        { unit: "rad", joints_ids: null, source: "robot" },
      );
      if (res && res.angles && Array.isArray(res.angles)) {
        setJointAngles(res.angles.map((a: number | null) => a ?? 0));
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    pollJoints();
    intervalRef.current = setInterval(pollJoints, 10);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollJoints]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs">
        <div className={`size-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
        <span className="text-muted-foreground">
          {connected ? "Live · 100 Hz" : "Disconnected"}
        </span>
      </div>
      <Canvas
        camera={{ position: [0.3, 0.25, 0.3], fov: 40, near: 0.001, far: 10 }}
        style={{ background: "transparent" }}
        shadows
      >
        <Scene jointAngles={jointAngles} />
      </Canvas>
      <JointReadout angles={jointAngles} />
    </div>
  );
}
