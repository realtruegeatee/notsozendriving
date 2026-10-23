import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LANE, ROAD_HALF, roadX, roadXd, roadY, roadYd } from "./road";
import { FEEL, game, hudEls, input } from "./store";

const MODELS = ["sedan", "suv", "hatchback-sports", "taxi", "van", "truck", "sedan-sports"].map((m) => `/models/${m}.glb`);
MODELS.forEach((m) => useGLTF.preload(m));

export const headMat = new THREE.MeshStandardMaterial({ color: "#fff8e6", emissive: "#fff2cf", emissiveIntensity: 0.3, toneMapped: false });
export const tailMat = new THREE.MeshStandardMaterial({ color: "#a3262a", emissive: "#ff2a2a", emissiveIntensity: 0.3, toneMapped: false });

const CAR_LEN = 4.2;

function CarModel({ url, wheels }: { url: string; wheels?: React.MutableRefObject<THREE.Object3D[]> }) {
  const { scene } = useGLTF(url);
  const m = useMemo(() => {
    const obj = scene.clone(true);
    const list: THREE.Object3D[] = [];
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (o.name.toLowerCase().includes("wheel")) list.push(o);
    });
    if (wheels) wheels.current = list;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sc = CAR_LEN / size.z;
    return { obj, sc, center, min: box.min.y, w: size.x * sc, h: size.y * sc };
  }, [scene, wheels]);
  const ly = m.h * 0.38;
  return (
    <group>
      <group scale={m.sc} rotation-y={Math.PI}>
        <primitive object={m.obj} position={[-m.center.x, -m.min, -m.center.z]} />
      </group>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <mesh position={[sd * m.w * 0.32, ly, -CAR_LEN / 2 - 0.01]} material={headMat}>
            <boxGeometry args={[0.36, 0.16, 0.04]} />
          </mesh>
          <mesh position={[sd * m.w * 0.34, ly + 0.05, CAR_LEN / 2 + 0.01]} material={tailMat}>
            <boxGeometry args={[0.32, 0.14, 0.04]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

type Npc = { s: number; lane: number; v: number; base: number; model: string };

export function Traffic() {
  const npcs = useMemo<Npc[]>(() => {
    const arr: Npc[] = [];
    for (let i = 0; i < 10; i++) {
      const same = i < 6;
      const base = same ? 12 + Math.random() * 7 : 17 + Math.random() * 6;
      arr.push({ s: 40 + i * 55 + Math.random() * 30, lane: same ? LANE : -LANE, v: base, base, model: MODELS[i % MODELS.length]! });
    }
    return arr;
  }, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const player = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const st = useRef({ steer: 0, roll: 0, camYaw: 0, camY: 3, frame: 0, init: false });
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useFrame((state, raw) => {
    const sun = state.scene.getObjectByName("sun") as THREE.DirectionalLight | undefined;
    const dt = Math.min(raw, 0.05);
    const S = st.current;
    if (!S.init) {
      game.z = 0; game.x = roadX(0) + LANE; game.yaw = Math.atan(roadXd(0)); S.camYaw = game.yaw; S.init = true;
    }
    const active = game.started && !game.paused;
    const ps = -game.z;

    if (active) {
      const k = input.keys;
      let thr = Math.max(input.throttle, k["w"] || k["arrowup"] ? 1 : 0);
      const brk = Math.max(input.brake, k["s"] || k["arrowdown"] ? 1 : 0);
      const steerIn = clamp(input.steer + (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0), -1, 1);
      if (game.cruise && !thr && !brk) thr = clamp((FEEL.CRUISE - game.speed) * 0.2, 0, 1);
      S.steer += (steerIn - S.steer) * damp(7, dt);

      let v = game.speed;
      v += FEEL.ACCEL * thr * (1 - v / FEEL.MAX) * dt;
      v -= FEEL.BRAKE * brk * dt;
      v *= Math.exp(-FEEL.DRAG * dt);
      const lat = game.x - roadX(game.z);
      if (Math.abs(lat) > ROAD_HALF + 0.6) v *= Math.exp(-0.9 * dt);
      v = clamp(v, 0, FEEL.MAX);
      game.speed = v;

      const roadYaw = Math.atan(roadXd(game.z));
      const rate = FEEL.TURN * S.steer * (v / (v + 5)) / (1 + v * 0.025);
      game.yaw -= rate * dt;
      if (Math.abs(steerIn) < 0.05) {
        const target = lat >= 0 ? LANE : -LANE;
        const desired = roadYaw - clamp((target - lat) * 0.07, -0.22, 0.22);
        game.yaw += (desired - game.yaw) * damp(FEEL.ASSIST * Math.min(1, v / 8), dt);
      }
      game.yaw = clamp(game.yaw, roadYaw - 0.9, roadYaw + 0.9);
      game.x += -Math.sin(game.yaw) * v * dt;
      game.z += -Math.cos(game.yaw) * v * dt;
      const lat2 = game.x - roadX(game.z);
      if (Math.abs(lat2) > 12) game.x = roadX(game.z) + Math.sign(lat2) * 12;
      game.distance += v * dt;
      S.roll += (S.steer * v * 0.006 - S.roll) * damp(5, dt);
      wheels.current.forEach((w) => (w.rotation.x += (v * dt) / 0.35));
    }

    // NPCs
    const pLat = game.x - roadX(game.z);
    npcs.forEach((n, i) => {
      const same = n.lane > 0;
      if (active) {
        let target = n.base;
        if (same) {
          for (const o of npcs) if (o !== n && o.lane === n.lane && o.s > n.s && o.s - n.s < 14) target = Math.min(target, o.v);
          const ahead = ps - n.s;
          if (ahead > 0 && ahead < 10 && Math.abs(pLat - n.lane) < 2.2) target = Math.min(target, game.speed);
        }
        n.v += (target - n.v) * damp(2, dt);
        n.s += (same ? 1 : -1) * n.v * dt;
        const ds = n.s - ps;
        if (ds < -50 || ds > 520) {
          n.s = ps + 180 + Math.random() * 320;
          n.base = same ? 12 + Math.random() * 7 : 17 + Math.random() * 6;
          n.v = n.base;
        }
        // gentle bump
        if (Math.abs(n.s - ps) < CAR_LEN && Math.abs(pLat - n.lane) < 1.9) {
          game.speed *= same ? 0.6 : 0.3;
          if (n.s > ps) game.z = -(n.s - CAR_LEN);
          else n.s = ps - CAR_LEN;
          game.shake = 0.5;
        }
      }
      const g = refs.current[i];
      if (g) {
        const z = -n.s;
        g.position.set(roadX(z) + n.lane, roadY(z), z);
        g.rotation.set(Math.atan(-roadYd(z)) * (same ? 1 : -1), Math.atan(roadXd(z)) + (same ? 0 : Math.PI), 0, "YXZ");
      }
    });

    game.y = roadY(game.z);
    const p = player.current;
    if (p) {
      p.position.set(game.x, game.y, game.z);
      p.rotation.set(Math.atan(-roadYd(game.z)), game.yaw, 0, "YXZ");
    }
    if (body.current) body.current.rotation.z = S.roll;

    // camera
    S.camYaw += (game.yaw - S.camYaw) * damp(3.5, dt);
    const dist = 8.5 + game.speed * 0.05;
    S.camY += (game.y + 3.4 - S.camY) * damp(4, dt);
    game.shake *= Math.exp(-4 * dt);
    const sh = game.shake * (Math.random() - 0.5);
    camera.position.set(game.x + Math.sin(S.camYaw) * dist + sh, S.camY + sh, game.z + Math.cos(S.camYaw) * dist);
    camera.lookAt(game.x - Math.sin(game.yaw) * 8, game.y + 1.2, game.z - Math.cos(game.yaw) * 8);
    const fov = 58 + game.speed * 0.35;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * damp(3, dt); camera.updateProjectionMatrix(); }

    if (sun) {
      sun.position.set(game.x + 30, game.y + 50, game.z + 20);
      sun.target.position.set(game.x, game.y, game.z);
      sun.target.updateMatrixWorld();
    }
    if (spot.current) spot.current.intensity = game.night ? 120 : 0;

    if (++S.frame % 6 === 0) {
      if (hudEls.speed) hudEls.speed.textContent = String(Math.round(game.speed * 3.6));
      if (hudEls.dist) hudEls.dist.textContent = (game.distance / 1000).toFixed(1);
    }
  });

  return (
    <>
      <group ref={player}>
        <group ref={body}>
          <CarModel url="/models/sedan-sports.glb" wheels={wheels} />
        </group>
        <primitive object={spotTarget} position={[0, 0, -25]} />
        <spotLight ref={spot} position={[0, 0.9, -2]} target={spotTarget} angle={0.55} penumbra={0.7} distance={70} decay={1.2} color="#fff1d0" />
      </group>
      {npcs.map((n, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <CarModel url={n.model} />
        </group>
      ))}
    </>
  );
}
