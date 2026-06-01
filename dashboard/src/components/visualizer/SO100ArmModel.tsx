import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export const SO100_MESH_BASE = "/urdf/so-100/meshes/";

export const SO100_ARM_MATERIAL = {
  color: "#b0b8d0",
  metalness: 0.5,
  roughness: 0.35,
};

function STLMesh({
  url,
  material,
}: {
  url: string;
  material?: THREE.MeshStandardMaterialParameters;
}) {
  const geometry = useLoader(STLLoader, url);
  const mat = useMemo(() => material ?? SO100_ARM_MATERIAL, [material]);
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
      current.current[i] += (t - current.current[i]) * 0.25;
    }
  });
  return current;
}

/** SO-100 arm from existing STL meshes (same layout as RobotVisualizer). */
export function SO100ArmModel({ jointAngles }: { jointAngles: number[] }) {
  const targets = useMemo(
    () => (jointAngles.length >= 6 ? jointAngles : [0, 0, 0, 0, 0, 0]),
    [jointAngles],
  );
  const lerpRef = useLerpedAngles(targets);
  const a = lerpRef.current;
  const rotEuler = (r: number, p: number, y: number) => new THREE.Euler(r, p, y, "XYZ");

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <STLMesh url={`${SO100_MESH_BASE}Base.STL`} />
      <group position={[0, -0.0452, 0.0165]} rotation={rotEuler(1.5708, 0, 0)}>
        <group rotation={[0, a[0], 0]}>
          <STLMesh url={`${SO100_MESH_BASE}Rotation_Pitch.STL`} />
          <group position={[0, 0.1025, 0.0306]}>
            <group rotation={[a[1], 0, 0]}>
              <STLMesh url={`${SO100_MESH_BASE}Upper_Arm.STL`} />
              <group position={[0, 0.11257, 0.028]}>
                <group rotation={[a[2], 0, 0]}>
                  <STLMesh url={`${SO100_MESH_BASE}Lower_Arm.STL`} />
                  <group position={[0, 0.0052, 0.1349]} rotation={rotEuler(-1.6, 0, 0)}>
                    <group rotation={[a[3], 0, 0]}>
                      <STLMesh url={`${SO100_MESH_BASE}Wrist_Pitch_Roll.STL`} />
                      <group position={[0, -0.0601, 0]} rotation={rotEuler(0, -3.14, 0)}>
                        <group rotation={[0, a[4], 0]}>
                          <STLMesh url={`${SO100_MESH_BASE}Fixed_Jaw.STL`} />
                          <group
                            position={[-0.0202, -0.0244, 0]}
                            rotation={rotEuler(3.1416, 0, 3.35)}
                          >
                            <group rotation={[0, 0, a[5]]}>
                              <STLMesh url={`${SO100_MESH_BASE}Moving%20Jaw.STL`} />
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

/**
 * Mount SO-100 on Go2 back.
 * Tune here: rotation is [X, Y, Z] in radians (Three.js Euler order).
 * - X: tilt forward/back
 * - Y: spin on the dog's back (yaw)
 * - Z: roll sideways
 */
export function SO100OnGo2Mount({
  jointAngles,
  position = [0.03, 0.5, 0.02],
  // Physical mount: vertical base on the Go2 back, arm yawed forward over the head.
  rotation = [Math.PI / 2, Math.PI, -Math.PI / 2],
  scale = 1,
}: {
  jointAngles: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <SO100ArmModel jointAngles={jointAngles} />
    </group>
  );
}
