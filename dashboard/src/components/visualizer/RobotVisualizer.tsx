import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useRef, useState, useEffect, useCallback, Suspense } from "react";
import { fetchWithBaseUrl } from "@/lib/utils";
import { SO100ArmModel } from "@/components/visualizer/SO100ArmModel";

const JOINT_NAMES = ["Rotation", "Pitch", "Elbow", "Wrist Pitch", "Wrist Roll", "Jaw"];
const JOINT_COLORS = ["#6366f1", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6"];

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
        <SO100ArmModel jointAngles={jointAngles} />
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
            {angles[i] !== undefined ? `${((angles[i] * 180) / Math.PI).toFixed(1)}°` : "--"}
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
      const res = await fetchWithBaseUrl("/joints/read", "POST", {
        unit: "rad",
        joints_ids: null,
        source: "robot",
      });
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
