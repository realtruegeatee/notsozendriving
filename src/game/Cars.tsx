import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { groundY, LANE, ROAD_HALF, roadX, roadXd, roadY, roadYd } from "./road";
import { CARS, FEEL, game, hudEls, input, net } from "./store";
import { carContact, STALE_MS, teleportPose } from "./multiplayer-math";
import type { CarId } from "./store";
import { planAutodrive } from "./autodrive";
import type { Passing } from "./autodrive";
import { flashLights, horn } from "./signals";
import { chooseTrafficReaction, npcTargetSpeed, shouldAutopilotSignal, SIGNAL_GAP, threatenedTraffic } from "./traffic-reaction";
import type { TrafficReaction } from "./traffic-reaction";
import { npcCrash, npcOffset, resolveNpcCollision } from "./npc-collision";
import { planNpcDriving, stepNpcLane } from "./npc-driving";
import type { DrivingNpc } from "./npc-driving";

const MODELS = ["sedan", "suv", "hatchback-sports", "taxi", "van", "truck", "sedan-sports"].map((m) => `/models/${m}.glb`);
// No useGLTF.preload: a rejected preload is an unhandled error on flaky networks.

export const headMat = new THREE.MeshStandardMaterial({ color: "#fff8e6", emissive: "#fff2cf", emissiveIntensity: 0.3, toneMapped: false });
export const tailMat = new THREE.MeshStandardMaterial({ color: "#a3262a", emissive: "#ff2a2a", emissiveIntensity: 0.3, toneMapped: false });

const CAR_LEN = 4.2;

type CarModelProps = { url: string; wheels?: React.MutableRefObject<THREE.Object3D[]>; driverId?: string };

function StandInCar() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.8, 0.7, CAR_LEN]} />
        <meshStandardMaterial color="#c9b79c" />
      </mesh>
      <mesh position={[0, 1.1, 0.2]} castShadow>
        <boxGeometry args={[1.5, 0.5, 2]} />
        <meshStandardMaterial color="#8a7d6a" />
      </mesh>
    </group>
  );
}

// A failed model download (flaky mobile network) must never blank the game:
// show a stand-in and retry the download a few seconds later.
class CarModelBoundary extends Component<{ url: string; children: ReactNode }, { failed: boolean; attempt: number }> {
  override state = { failed: false, attempt: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() {
    if (this.state.attempt >= 5) return;
    this.timer = setTimeout(() => {
      useGLTF.clear(this.props.url);
      this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
    }, 3000);
  }
  override componentWillUnmount() { clearTimeout(this.timer); }
  override render() {
    if (this.state.failed) return <StandInCar />;
    return <Suspense key={this.state.attempt} fallback={<StandInCar />}>{this.props.children}</Suspense>;
  }
}

export function CarModel(props: CarModelProps) {
  return <CarModelBoundary url={props.url}><GltfCar {...props} /></CarModelBoundary>;
}

function GltfCar({ url, wheels, driverId }: CarModelProps) {
  const { scene } = useGLTF(url);
  const headlights = useMemo(() => headMat.clone(), []);
  useEffect(() => () => headlights.dispose(), [headlights]);
  useFrame(() => {
    const flashing = performance.now() < (driverId === net.id ? game.flashUntil : driverId ? net.flashes.get(driverId) ?? 0 : 0);
    headlights.emissiveIntensity = flashing ? 10 : game.night ? 5 : 0.3;
  });
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
          <mesh position={[sd * m.w * 0.32, ly, -CAR_LEN / 2 - 0.01]} material={headlights}>
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

type Npc = { s: number; lane: number; v: number; base: number; model: string; crashAge: number; reaction: TrafficReaction | null; reactionLeft: number; impactOffset: number; contactLeft: number; passOffset: number; passing: boolean; crashOrigin?: number; shove: number; laneVelocity: number; laneRoll: number };

export function Traffic({ car, traffic = true }: { car: CarId; traffic?: boolean }) {
  const npcs = useMemo<Npc[]>(() => {
    const arr: Npc[] = [];
    if (!traffic) return arr;
    for (let i = 0; i < 10; i++) {
      const same = i < 6;
      const base = same ? 12 + Math.random() * 7 : 17 + Math.random() * 6;
      arr.push({ s: 40 + i * 55 + Math.random() * 30, lane: same ? LANE : -LANE, v: base, base, crashAge: -1, reaction: null, reactionLeft: 0, impactOffset: 0, contactLeft: 0, passOffset: 0, passing: false, shove: 0, laneVelocity: 0, laneRoll: 0, model: MODELS[i % MODELS.length] ?? MODELS[0] ?? "/models/sedan.glb" });
    }
    return arr;
  }, [traffic]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const player = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const st = useRef({ steer: 0, roll: 0, camYaw: 0, camY: 3, frame: 0, init: false, contactUntil: 0, passing: false as Passing, blockedFor: 0, signalCooldown: 0 });
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useFrame((state, raw) => {
    const sun = state.scene.getObjectByName("sun") as THREE.DirectionalLight | undefined;
    const dt = Math.min(raw, 0.05);
    const S = st.current;
    if (!S.init) {
      game.z = 0; game.x = roadX(0) + LANE; game.yaw = Math.atan(roadXd(0)); S.camYaw = game.yaw; S.init = true;
    }
    const active = game.started && !game.paused;
    const now = performance.now();
    if (net.teleportTo) {
      const friend = net.positions.get(net.teleportTo);
      net.teleportTo = null;
      if (friend && now - friend.at < STALE_MS) {
        const occupied = [...net.positions.values()].filter((p) => now - p.at < STALE_MS);
        const pose = teleportPose(friend, occupied);
        if (pose) {
          Object.assign(game, pose);
          game.speed = 0; game.shake = 0; game.warp++;
          S.camYaw = game.yaw; S.camY = game.y + 3.4; S.steer = 0; S.roll = 0;
          S.passing = false; S.blockedFor = 0;
          input.steer = 0;
        }
      }
    }
    const ps = -game.z;

    if (active) {
      const k = input.keys;
      let thr = Math.max(input.throttle, k["w"] || k["arrowup"] ? 1 : 0);
      let brk = Math.max(input.brake, k["s"] || k["arrowdown"] ? 1 : 0);
      let steerIn = clamp(input.steer + (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0), -1, 1);
      const auto = game.cruise && !thr && !brk && Math.abs(steerIn) < 0.05;
      S.signalCooldown = Math.max(0, S.signalCooldown - dt);
      if (shouldAutopilotSignal(auto, game.speed, S.signalCooldown, ps, game.x - roadX(game.z), npcs)) {
        horn(); flashLights(); S.signalCooldown = SIGNAL_GAP;
        for (const n of npcs) if (threatenedTraffic(ps, n)) {
          n.reaction = chooseTrafficReaction(Math.random()); n.reactionLeft = 7;
          if (n.reaction === "crash") { n.crashOrigin = npcOffset(n); n.impactOffset = 0; n.shove = 0; n.crashAge = 0; }
        }
      }
      if (auto) {
        const cars = npcs.map((n) => ({ z: -n.s, lane: npcOffset(n), speed: n.v, same: n.lane > 0 }));
        for (const peer of net.positions.values()) if (now - peer.at < STALE_MS) cars.push({ z: peer.z, lane: peer.x - roadX(peer.z), speed: 20, same: Math.abs(peer.yaw - game.yaw) < Math.PI / 2 });
        const plan = planAutodrive(game.z, game.speed, S.passing, cars, S.blockedFor, dt, game.x - roadX(game.z));
        S.passing = plan.passing;
        S.blockedFor = plan.blockedFor;
        const lookZ = game.z - Math.max(12, game.speed * 0.6);
        const desired = Math.atan2(game.x - roadX(lookZ) - plan.lane, game.z - lookZ);
        steerIn = clamp((game.yaw - desired) * 5, -1, 1);
        thr = clamp((plan.targetSpeed - game.speed) * 0.45, 0, 1);
        brk = clamp((game.speed - plan.targetSpeed) * 0.2, 0, 1);
      } else { S.passing = false; S.blockedFor = 0; }
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
      if (!auto && Math.abs(steerIn) < 0.05) {
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
      // Each browser resolves its own car immediately; no network round trip on impact.
      for (const peer of net.positions.values()) {
        if (now - peer.at >= STALE_MS) continue;
        const push = carContact({ x: game.x, y: roadY(game.z), z: game.z, yaw: game.yaw }, peer);
        if (!push) continue;
        game.x += push.x; game.z += push.z;
        if (now >= S.contactUntil) {
          game.speed *= 0.55; game.shake = 0.25; S.contactUntil = now + 400;
        }
      }
    }

    // NPCs
    const pLat = game.x - roadX(game.z);
    // Plan from one shared snapshot, so array order cannot change passing decisions.
    const playerLane = Math.cos(game.yaw) >= 0 ? LANE : -LANE;
    const nearby: DrivingNpc[] = npcs.map((n) => ({ ...n, offset: npcOffset(n) }));
    nearby.push({ s: -game.z, lane: playerLane, offset: pLat, passOffset: pLat - playerLane, v: game.speed, base: game.speed, crashAge: -1, passing: false });
    const plans = active ? npcs.map((n, i) => {
      const snapshot = nearby[i];
      return snapshot ? planNpcDriving(snapshot, nearby, npcTargetSpeed(n.base, n.reactionLeft > dt ? n.reaction : null, n.crashAge >= 0)) : undefined;
    }) : [];
    npcs.forEach((n, i) => {
      const same = n.lane > 0;
      if (active) {
        n.contactLeft = Math.max(0, n.contactLeft - dt);
        n.impactOffset *= Math.exp(-0.8 * dt);
        const crashing = n.crashAge >= 0;
        if (crashing) n.crashAge += dt;
        n.reactionLeft = Math.max(0, n.reactionLeft - dt);
        if (!crashing && n.reactionLeft === 0) n.reaction = null;
        let target = npcTargetSpeed(n.base, n.reaction, crashing);
        if (!crashing) {
          const plan = plans[i];
          if (!plan) return;
          n.passing = plan.passing;
          const previousVelocity = n.laneVelocity;
          const laneStep = stepNpcLane(n.passOffset, n.laneVelocity, plan.passOffset, n.v, dt);
          n.passOffset = laneStep.offset; n.laneVelocity = laneStep.velocity;
          const lean = clamp(-(n.laneVelocity - previousVelocity) / Math.max(dt, 0.001) * Math.sign(n.lane) * 0.012, -0.06, 0.06);
          n.laneRoll += (lean - n.laneRoll) * damp(6, dt);
          target = plan.speed;
        }
        if (same && !crashing) {
          const ahead = ps - n.s;
          if (ahead > 0 && ahead < 10 && Math.abs(pLat - npcOffset(n)) < 2.2) target = Math.min(target, game.speed);
        }
        n.v += (target - n.v) * damp(crashing || n.reaction === "brake" ? 3.5 : 2, dt);
        if (crashing && n.v < 0.05) n.v = 0;
        n.s += (same ? 1 : -1) * n.v * dt;
        const ds = n.s - ps;
        if (ds < -50 || ds > 520) {
          n.s = ps + 180 + Math.random() * 320;
          n.base = same ? 12 + Math.random() * 7 : 17 + Math.random() * 6;
          n.v = n.base;
          n.crashAge = -1;
          n.reaction = null; n.reactionLeft = 0;
          n.impactOffset = 0; n.contactLeft = 0;
          n.passOffset = 0; n.passing = false; delete n.crashOrigin; n.shove = 0; n.laneVelocity = 0; n.laneRoll = 0;
        }
      }
    });
    if (active) {
      for (let i = 0; i < npcs.length; i++) for (let j = i + 1; j < npcs.length; j++) {
        const a = npcs[i], b = npcs[j];
        if (a && b) {
          const aWasWreck = a.crashAge >= 0, bWasWreck = b.crashAge >= 0;
          resolveNpcCollision(a, b);
          if ((!aWasWreck && a.shove && a.crashAge >= 0) || (!bWasWreck && b.shove && b.crashAge >= 0)) {
            const aggressor = a.crashAge >= 0 ? b : a;
            aggressor.reaction = null; aggressor.reactionLeft = 0;
          }
        }
      }
      // Contact after NPC pair separation, using the player's current position.
      for (const n of npcs) {
        const playerS = -game.z;
        if (Math.abs(n.s - playerS) < CAR_LEN && Math.abs(game.x - roadX(game.z) - npcOffset(n)) < 1.9) {
          game.speed *= n.lane > 0 ? 0.6 : 0.3;
          if (n.s > playerS) game.z = -(n.s - CAR_LEN);
          else n.s = playerS - CAR_LEN;
          game.shake = 0.5;
        }
      }
    }
    npcs.forEach((n, i) => {
      const same = n.lane > 0;
      const g = refs.current[i];
      if (g) {
        const z = -n.s;
        const crash = n.crashAge < 0 ? null : npcCrash(n);
        const offset = npcOffset(n);
        g.position.set(roadX(z) + offset, (crash ? groundY(z, offset) + 0.03 : roadY(z)) + (crash?.bounce ?? 0), z);
        const direction = same ? 1 : -1;
        const drivingYaw = Math.atan(roadXd(z) - n.laneVelocity / (direction * Math.max(4, n.v))) + (same ? 0 : Math.PI);
        g.rotation.set(Math.atan(-roadYd(z)) * direction, crash ? Math.atan(roadXd(z)) + (same ? 0 : Math.PI) + crash.yaw : drivingYaw, crash?.roll ?? n.laneRoll, "YXZ");
        g.userData["reaction"] = n.reaction;
        g.userData["speed"] = n.v;
        g.userData["baseSpeed"] = n.base;
        g.userData["passing"] = n.passing;
        g.userData["shove"] = n.shove;
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
    const fp = game.view === "cockpit";
    if (body.current) body.current.visible = !fp;
    S.camYaw += (game.yaw - S.camYaw) * damp(fp ? 12 : 3.5, dt);
    game.shake *= Math.exp(-4 * dt);
    const sh = game.shake * (Math.random() - 0.5);
    if (fp) {
      const eye = game.y + 1.15 + Math.sin(game.distance * 0.9) * 0.008 * Math.min(1, game.speed / 10);
      S.camY = eye;
      camera.position.set(game.x - Math.sin(game.yaw) * 0.3 + sh * 0.3, eye + sh * 0.3, game.z - Math.cos(game.yaw) * 0.3);
      camera.lookAt(game.x - Math.sin(S.camYaw) * 20, roadY(game.z - Math.cos(game.yaw) * 20) + 1.0, game.z - Math.cos(S.camYaw) * 20);
      camera.rotateZ(-S.roll * 0.6);
    } else {
      const dist = 8.5 + game.speed * 0.05;
      S.camY += (game.y + 3.4 - S.camY) * damp(4, dt);
      camera.position.set(game.x + Math.sin(S.camYaw) * dist + sh, S.camY + sh, game.z + Math.cos(S.camYaw) * dist);
      camera.lookAt(game.x - Math.sin(game.yaw) * 8, game.y + 1.2, game.z - Math.cos(game.yaw) * 8);
    }
    const fov = (fp ? 68 : 58) + game.speed * 0.35;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * damp(3, dt); camera.updateProjectionMatrix(); }

    if (sun) {
      sun.position.set(game.x + 30, game.y + 50, game.z + 20);
      sun.target.position.set(game.x, game.y, game.z);
      sun.target.updateMatrixWorld();
    }
    if (spot.current) spot.current.intensity = now < game.flashUntil ? 280 : game.night ? 120 : 0;

    if (++S.frame % 6 === 0) {
      if (hudEls.speed) hudEls.speed.textContent = String(Math.round(game.speed * 3.6));
      if (hudEls.dist) hudEls.dist.textContent = (game.distance / 1000).toFixed(1);
    }
  });

  return (
    <>
      <group ref={player}>
        <group ref={body}>
          <CarModel key={car} driverId={net.id} url={`/models/${CARS.some((c) => c.id === car) ? car : "sedan-sports"}.glb`} wheels={wheels} />
        </group>
        <primitive object={spotTarget} position={[0, 0, -25]} />
        <spotLight ref={spot} position={[0, 0.9, -2]} target={spotTarget} angle={0.55} penumbra={0.7} distance={70} decay={1.2} color="#fff1d0" />
      </group>
      {npcs.map((n, i) => (
        <group key={i} name={`traffic-${i}`} ref={(el) => { refs.current[i] = el; }}>
          <CarModel url={n.model} />
        </group>
      ))}
    </>
  );
}
