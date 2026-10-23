import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { groundY, LANE, ROAD_HALF, roadX, roadXd, roadY, roadYd } from "./road";
import { CARS, FEEL, game, hudEls, input, net } from "./store";
import { carContact, STALE_MS, teleportPose } from "./multiplayer-math";
import type { CarId } from "./store";
import { aggressionProfile } from "./aggression";
import { planAutodrive, ramTarget, stepBump, stepImpatience, stepUnstick } from "./autodrive";
import { maxSpeedForDistance, powerCurve } from "./speed";
import type { Passing } from "./autodrive";
import { flashLights, horn } from "./signals";
import { chooseSporadicEvent, chooseTrafficReaction, npcTargetSpeed, shouldActSporadic, shouldAutopilotSignal, shouldSwerveForPass, SIGNAL_GAP, threatenedTraffic } from "./traffic-reaction";
import type { TrafficReaction } from "./traffic-reaction";
import { npcCrash, npcOffset, resolveNpcCollision, resolveAutopilotNpcContact, crashVisible } from "./npc-collision";
import { canDriveAgain } from "./crash-physics";
import { npcCruisingSpeed, planNpcDriving, stepNpcLane } from "./npc-driving";
import type { DrivingNpc } from "./npc-driving";
import { createCrashMotion, createSwerveMotion, stepCrashMotion } from "./crash-physics";
import type { CrashMotion } from "./crash-physics";

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

type Npc = { s: number; lane: number; v: number; base: number; aggressive?: boolean; model: string; crashAge: number; reaction: TrafficReaction | null; reactionLeft: number; impactOffset: number; contactLeft: number; passOffset: number; passing: boolean; crashOrigin?: number; shove: number; laneVelocity: number; laneRoll: number; crashSide?: number; dodged?: boolean; crashMotion?: CrashMotion; crashSpeed?: number; recoveryLeft?: number; stunLeft?: number; wander?: number; wanderLeft?: number; restFor?: number };

export function Traffic({ car, traffic = true }: { car: CarId; traffic?: boolean }) {
  const npcs = useMemo<Npc[]>(() => {
    const arr: Npc[] = [];
    if (!traffic) return arr;
    for (let i = 0; i < 10; i++) {
      const same = i < 6;
      const aggressive = i % 3 !== 0;
      const base = npcCruisingSpeed(same, aggressive, Math.random());
      arr.push({ s: 40 + i * 55 + Math.random() * 30, lane: same ? LANE : -LANE, v: base, base, aggressive, crashAge: -1, reaction: null, reactionLeft: 0, impactOffset: 0, contactLeft: 0, passOffset: 0, passing: false, shove: 0, laneVelocity: 0, laneRoll: 0, model: MODELS[i % MODELS.length] ?? MODELS[0] ?? "/models/sedan.glb" });
    }
    return arr;
  }, [traffic]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const player = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const st = useRef({ steer: 0, roll: 0, camYaw: 0, camY: 3, frame: 0, init: false, contactUntil: 0, passing: false as Passing, blockedFor: 0, signalCooldown: 0, stuckFor: 0, reverseLeft: 0, impatience: 0, ramming: false, backingOff: false });
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useFrame((state, raw) => {
    const sun = state.scene.getObjectByName("sun") as THREE.DirectionalLight | undefined;
    const dt = Math.min(raw, 0.05);
    const S = st.current;
    if (!S.init) {
      game.z = 0; game.x = roadX(0) + LANE; game.yaw = Math.atan(roadXd(0)); S.camYaw = game.yaw; S.init = true;
    }
    const active = game.started && !game.paused;
    const auto = active && game.cruise && !input.throttle && !input.brake &&
      !input.keys["w"] && !input.keys["arrowup"] && !input.keys["s"] && !input.keys["arrowdown"] &&
      Math.abs(input.steer + (input.keys["d"] || input.keys["arrowright"] ? 1 : 0) - (input.keys["a"] || input.keys["arrowleft"] ? 1 : 0)) < 0.05;
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
      let reversing = false;
      let steerIn = clamp(input.steer + (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0), -1, 1);
      S.signalCooldown = Math.max(0, S.signalCooldown - dt);
      const prof = aggressionProfile(game.aggro);
      if (prof.signals && shouldAutopilotSignal(auto, game.speed, S.signalCooldown, ps, game.x - roadX(game.z), npcs)) {
        horn(); flashLights(); S.signalCooldown = SIGNAL_GAP;
        for (const n of npcs) if (threatenedTraffic(ps, n)) {
          n.reaction = chooseTrafficReaction(Math.random()); n.reactionLeft = 7;
          if (n.reaction === "crash") { n.crashOrigin = npcOffset(n); n.crashSide = (Math.random() < 0.5 ? 1 : -1) * Math.sign(n.lane); n.impactOffset = 0; n.shove = 0; n.crashAge = 0; }
        }
      }
      if (auto) {
        const cars = npcs.map((n) => ({ z: -n.s, lane: npcOffset(n), speed: n.v, same: n.lane > 0, laneVelocity: n.crashAge < 0 ? n.laneVelocity : 0, targetLane: n.crashAge < 0 ? n.passing ? -n.lane : n.lane : npcOffset(n) }));
        for (const peer of net.positions.values()) if (now - peer.at < STALE_MS) cars.push({ z: peer.z, lane: peer.x - roadX(peer.z), speed: 20, same: Math.abs(peer.yaw - game.yaw) < Math.PI / 2, laneVelocity: 0, targetLane: peer.x - roadX(peer.z) });
        const plan = planAutodrive(game.z, game.speed, S.passing, cars, S.blockedFor, dt, game.x - roadX(game.z), maxSpeedForDistance(game.distance) * prof.speedFactor);
        S.passing = plan.passing;
        S.blockedFor = plan.blockedFor;
        const lookZ = game.z - Math.max(12, game.speed * 0.6);
        const desired = Math.atan2(game.x - roadX(lookZ) - plan.lane, game.z - lookZ);
        steerIn = clamp((game.yaw - desired) * 5, -1, 1);
        thr = clamp((plan.targetSpeed - game.speed) * 0.45, 0, 1);
        brk = clamp((game.speed - plan.targetSpeed) * 0.5, 0, 1);
        const u = stepUnstick(S.stuckFor, S.reverseLeft, game.speed, plan.targetSpeed, dt);
        S.stuckFor = u.stuckFor; S.reverseLeft = u.reverseLeft; reversing = u.reversing;
        if (reversing) { thr = 0; brk = 0; steerIn = 0; }
        if (u.retryPass) { S.passing = true; S.blockedFor = 0; }
        const lat0 = game.x - roadX(game.z);
        const target = ramTarget(game.z, lat0, cars);
        // Only lose patience when no pass is possible.
        const heldUp = !plan.passing && plan.targetSpeed < Math.min(game.speed + 2, maxSpeedForDistance(game.distance) * 0.7);
        const imp = stepImpatience(S.impatience, S.ramming && !plan.passing, heldUp, prof.ramming && !!target, dt);
        S.impatience = imp.impatience; S.ramming = imp.ramming;
        if (S.ramming && target) {
          // Out of patience: bump it repeatedly — charge, hit, back off, charge again.
          const gap = game.z - target.z;
          S.backingOff = stepBump(S.backingOff, gap);
          const ramDesired = Math.atan2(lat0 - target.lane, game.z - target.z);
          steerIn = clamp((game.yaw - ramDesired) * 5, -1, 1);
          reversing = false; S.reverseLeft = 0; S.stuckFor = 0;
          if (S.backingOff) { thr = 0; brk = 1; }
          else { thr = 1; brk = 0; }
        } else S.backingOff = false;
      } else { S.passing = false; S.blockedFor = 0; S.stuckFor = 0; S.reverseLeft = 0; S.impatience = 0; S.ramming = false; }
      S.steer += (steerIn - S.steer) * damp(7, dt);

      let v = game.speed;
      const maxV = maxSpeedForDistance(game.distance);
      v += FEEL.ACCEL * thr * powerCurve(v, maxV) * dt;
      v -= FEEL.BRAKE * brk * dt;
      v *= Math.exp(-FEEL.DRAG * dt);
      const lat = game.x - roadX(game.z);
      if (Math.abs(lat) > ROAD_HALF + 0.6) v *= Math.exp(-0.9 * dt);
      v = reversing ? v + (-4 - v) * damp(3, dt) : clamp(v, 0, maxV);
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
      game.distance += Math.max(0, v) * dt;
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
        n.recoveryLeft = Math.max(0, (n.recoveryLeft ?? 0) - dt);
        const stunned = (n.stunLeft ?? 0) > 0 && n.crashAge < 0;
        if (stunned) {
          // Stalled after being rammed: stay put where shoved, then drive on and ease home.
          n.stunLeft = Math.max(0, (n.stunLeft ?? 0) - dt);
          n.v = 0;
          if (n.stunLeft === 0) n.recoveryLeft = 2;
          return;
        }
        n.impactOffset *= Math.exp(-0.8 * dt);
        const crashing = n.crashAge >= 0;
        if (crashing) n.crashAge += dt;
        n.reactionLeft = Math.max(0, n.reactionLeft - dt);
        if (!crashing && n.reactionLeft === 0) n.reaction = null;
        let target = npcTargetSpeed(n.base, n.reaction, crashing);
        if (!crashing) {
          // Sporadic mood swings: unprovoked speed bursts, sudden braking, lane
          // wandering, and the rare random dive off the road.
          n.wanderLeft = Math.max(0, (n.wanderLeft ?? 0) - dt);
          if (n.wanderLeft === 0) n.wander = 0;
          if (!n.passing && n.reactionLeft <= 0 && (n.recoveryLeft ?? 0) <= 0 && shouldActSporadic(Math.random(), dt)) {
            const mood = chooseSporadicEvent(Math.random());
            if (mood === "wander") { n.wander = (Math.random() - 0.5) * 2.6; n.wanderLeft = 1.5 + Math.random() * 2; }
            else if (mood === "crash") {
              // Out of sight, out of mind: no crashes the player cannot see.
              if (crashVisible(ps, n)) { n.reaction = "crash"; n.reactionLeft = 7; n.crashOrigin = npcOffset(n); n.crashSide = (Math.random() < 0.5 ? 1 : -1) * Math.sign(n.lane); n.impactOffset = 0; n.shove = 0; n.crashAge = 0; n.passing = false; }
            }
            else { n.reaction = mood; n.reactionLeft = 2 + Math.random() * 3; }
          }
          const plan = n.recoveryLeft > 0 ? { passing: false, passOffset: 0, speed: Math.max(6, n.base * 0.7), swerve: false } : plans[i];
          if (!plan) return;
          n.passing = plan.passing;
          const previousVelocity = n.laneVelocity;
          const laneStep = stepNpcLane(n.passOffset, n.laneVelocity, plan.passOffset + (n.wander ?? 0), n.v, dt);
          n.passOffset = laneStep.offset; n.laneVelocity = laneStep.velocity;
          const lean = clamp(-(n.laneVelocity - previousVelocity) / Math.max(dt, 0.001) * Math.sign(n.lane) * 0.012, -0.06, 0.06);
          n.laneRoll += (lean - n.laneRoll) * damp(6, dt);
          target = plan.speed;
          if (!plan.swerve) delete n.dodged;
          if (plan.swerve && n.dodged === undefined) n.dodged = !shouldSwerveForPass(Math.random());
          if (plan.swerve && !n.dodged && crashVisible(ps, n)) { n.reaction = "crash"; n.reactionLeft = 7; n.crashOrigin = npcOffset(n); n.crashSide = (Math.random() < 0.5 ? 1 : -1) * Math.sign(n.lane); n.impactOffset = 0; n.shove = 0; n.crashAge = 0; n.passing = false; }
        }
        if (same && !crashing) {
          const ahead = ps - n.s;
          if (ahead > 0 && ahead < 10 && Math.abs(pLat - npcOffset(n)) < 2.2) target = Math.min(target, game.speed);
        }
        if (n.crashAge >= 0) {
          n.crashMotion ??= n.shove > 0
            ? createCrashMotion(n.crashOrigin ?? npcOffset(n), n.crashSpeed ?? n.v, n.crashSide ?? Math.sign(n.lane), n.shove)
            : createSwerveMotion(n.crashOrigin ?? npcOffset(n), n.v, n.crashSide ?? Math.sign(n.lane), n.laneVelocity);
          n.s += (same ? 1 : -1) * stepCrashMotion(n.crashMotion, dt);
          n.v = n.crashMotion.speed;
          // A wreck that stopped on the road shakes itself off and drives again.
          if (canDriveAgain(n.crashMotion)) {
            n.restFor = (n.restFor ?? 0) + dt;
            if (n.restFor > 2.5) {
              const stoppedAt = npcOffset(n);
              n.crashAge = -1; delete n.crashMotion; delete n.crashSpeed;
              n.reaction = null; n.reactionLeft = 0; n.restFor = 0; n.impactOffset = 0;
              n.passOffset = stoppedAt - n.lane; n.laneVelocity = 0;
              n.recoveryLeft = 2; n.v = 0;
            }
          } else n.restFor = 0;
        } else {
          n.v += (target - n.v) * damp(n.reaction === "brake" ? 3.5 : 2, dt);
          n.s += (same ? 1 : -1) * n.v * dt;
        }
        const ds = n.s - ps;
        if (ds < -50 || ds > 520) {
          n.s = ps + 180 + Math.random() * 320;
          n.base = npcCruisingSpeed(same, n.aggressive ?? false, Math.random());
          n.v = n.base;
          n.crashAge = -1;
          delete n.crashMotion; delete n.crashSpeed;
          n.reaction = null; n.reactionLeft = 0;
          n.impactOffset = 0; n.contactLeft = 0;
          n.recoveryLeft = 0; n.stunLeft = 0;
          n.passOffset = 0; n.passing = false; delete n.crashOrigin; delete n.crashSide; delete n.dodged; n.shove = 0; n.laneVelocity = 0; n.laneRoll = 0; n.wander = 0; n.wanderLeft = 0;
        }
      }
    });
    if (active) {
      for (let i = 0; i < npcs.length; i++) for (let j = i + 1; j < npcs.length; j++) {
        const a = npcs[i], b = npcs[j];
        if (a && b) {
          const aWasWreck = a.crashAge >= 0, bWasWreck = b.crashAge >= 0;
          resolveNpcCollision(a, b, crashVisible(ps, a) || crashVisible(ps, b));
          if ((!aWasWreck && a.shove && a.crashAge >= 0) || (!bWasWreck && b.shove && b.crashAge >= 0)) {
            const aggressor = a.crashAge >= 0 ? b : a;
            aggressor.reaction = null; aggressor.reactionLeft = 0;
          }
        }
      }
      // Contact after NPC pair separation, using the player's current position.
      for (const n of npcs) {
        const wasCrashing = n.crashAge >= 0;
        const push = resolveAutopilotNpcContact({ x: game.x, y: roadY(game.z), z: game.z, yaw: game.yaw }, auto, n, n.laneVelocity, game.speed);
        if (push) {
          const launched = !wasCrashing && n.crashAge >= 0;
          if (launched) {
            n.reaction = "crash"; n.reactionLeft = 7; n.passing = false;
          }
          if (launched && n.shove > 0) {
            // Launched car: the player plows through and barely slows.
            game.speed *= 0.88;
          } else if (n.lane > 0 && game.speed > n.v && !((n.stunLeft ?? 0) > 0)) {
            // Push it: hand momentum to the car ahead instead of just stopping dead.
            const share = (game.speed - n.v) * 0.6;
            n.v += share; n.s += Math.min(1.5, share * 0.08);
            game.speed -= share * (auto ? 0.15 : 0.5);
          } else if (auto) game.speed *= n.lane > 0 ? 0.97 : 0.7;
          else game.speed *= n.lane > 0 ? 0.85 : 0.3;
          // On autopilot the car holds its line: only a nudge of the contact push applies.
          const firmness = auto ? 0.25 : 1;
          game.x += push.x * firmness; game.z += push.z * firmness;
          game.shake = auto ? 0.2 : 0.5;
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
        g.rotation.set(Math.atan(-roadYd(z)) * direction, crash ? Math.atan(roadXd(z)) + (same ? 0 : Math.PI) + crash.yaw * direction : drivingYaw, (crash?.roll ?? n.laneRoll) * (crash ? direction : 1), "YXZ");
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
    if (body.current) body.current.visible = true;
    S.camYaw += (game.yaw - S.camYaw) * damp(fp ? 12 : 3.5, dt);
    game.shake *= Math.exp(-4 * dt);
    const sh = game.shake * (Math.random() - 0.5);
    if (fp) {
      // Driver's-eye view: seated left of centre, steady head, gentle look into corners.
      const eye = game.y + 2.5 + Math.sin(game.distance * 0.9) * 0.004 * Math.min(1, game.speed / 10);
      S.camY = eye;
      // Dashcam: centred behind the windscreen so the bonnet stays in view.
      const side = 0, fwd = 0.6;
      const cx = game.x + Math.cos(game.yaw) * side - Math.sin(game.yaw) * -fwd;
      const cz = game.z - Math.sin(game.yaw) * side - Math.cos(game.yaw) * -fwd;
      camera.position.set(cx + sh * 0.15, eye + sh * 0.15, cz);
      const look = 30 + game.speed * 0.4;
      const lookYaw = S.camYaw + S.steer * 0.12;
      camera.lookAt(cx - Math.sin(lookYaw) * look, roadY(game.z - Math.cos(game.yaw) * look) - 3.5, cz - Math.cos(lookYaw) * look);
      camera.rotateZ(-S.roll * 0.3);
    } else {
      const dist = 8.5 + game.speed * 0.05;
      S.camY += (game.y + 3.4 - S.camY) * damp(4, dt);
      camera.position.set(game.x + Math.sin(S.camYaw) * dist + sh, S.camY + sh, game.z + Math.cos(S.camYaw) * dist);
      camera.lookAt(game.x - Math.sin(game.yaw) * 8, game.y + 1.2, game.z - Math.cos(game.yaw) * 8);
    }
    const fov = (fp ? 62 : 58) + Math.min(game.speed, 60) * (fp ? 0.25 : 0.35);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * damp(3, dt); camera.updateProjectionMatrix(); }

    if (sun) {
      sun.position.set(game.x + 30, game.y + 50, game.z + 20);
      sun.target.position.set(game.x, game.y, game.z);
      sun.target.updateMatrixWorld();
    }
    if (spot.current) spot.current.intensity = now < game.flashUntil ? 280 : game.night ? 120 : 0;

    if (++S.frame % 6 === 0) {
      if (hudEls.speed) hudEls.speed.textContent = String(Math.round(Math.abs(game.speed) * 3.6));
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
