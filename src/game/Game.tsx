import { Environment, Lightformer, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Traffic, headMat, tailMat } from "./Cars";
import { World, lampGlowMat, lampHeadMat } from "./World";
import { game } from "./store";

const PALETTE = {
  day: { top: "#7fb0d6", horizon: "#f3dcc0", fog: "#ecd9c0", fogFar: 330, amb: 0.55, sun: 2.2, sunColor: "#fff0d8" },
  night: { top: "#03081a", horizon: "#1b2a48", fog: "#111c33", fogFar: 230, amb: 0.35, sun: 0.45, sunColor: "#9db4ff" },
};

function SkyDome({ night }: { night: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.05,0.,1.); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)),1.);
#include <colorspace_fragment>
}`,
      }),
    [],
  );
  useEffect(() => {
    const p = night ? PALETTE.night : PALETTE.day;
    mat.uniforms.top.value.set(p.top);
    mat.uniforms.bottom.value.set(p.horizon);
  }, [night, mat]);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <group ref={ref}>
      <mesh material={mat} renderOrder={-1}>
        <sphereGeometry args={[480, 32, 16]} />
      </mesh>
      <mesh position={night ? [-150, 160, -380] : [180, 120, -400]}>
        <sphereGeometry args={[night ? 10 : 18, 24, 12]} />
        <meshBasicMaterial color={night ? "#f2efe2" : "#fff4d6"} fog={false} toneMapped={false} />
      </mesh>
      {night && <Stars radius={300} depth={60} count={1500} factor={6} fade speed={0.3} />}
    </group>
  );
}

function Atmosphere({ night }: { night: boolean }) {
  const scene = useThree((s) => s.scene);
  const p = night ? PALETTE.night : PALETTE.day;
  useEffect(() => {
    game.night = night;
    scene.fog = new THREE.Fog(p.fog, 40, p.fogFar);
    lampHeadMat.emissiveIntensity = night ? 4 : 0;
    lampGlowMat.opacity = night ? 0.28 : 0;
    headMat.emissiveIntensity = night ? 5 : 0.3;
    tailMat.emissiveIntensity = night ? 4 : 0.4;
  }, [night, scene, p]);
  return (
    <>
      <hemisphereLight key={String(night)} args={[p.top, night ? "#1c2333" : "#8a8a5c", p.amb]} />
      <directionalLight
        name="sun"
        intensity={p.sun}
        color={p.sunColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={150}
        shadow-bias={-0.0005}
      />
      <Environment resolution={64}>
        <Lightformer intensity={night ? 0.4 : 1.6} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={night ? 0.2 : 0.8} color={night ? "#6b7fb3" : "#f7d9b5"} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
    </>
  );
}

export function Game({ night }: { night: boolean }) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 60, near: 0.1, far: 600, position: [0, 3, 8] }} gl={{ antialias: true }}>
      <SkyDome night={night} />
      <Atmosphere night={night} />
      <Suspense fallback={null}>
        <World />
        <Traffic />
      </Suspense>
    </Canvas>
  );
}
