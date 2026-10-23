import { carContact } from "./multiplayer-math";
import { groundY, roadX, roadXd } from "./road";
import type { CrashMotion } from "./crash-physics";
import { createCrashMotion, createSwerveMotion } from "./crash-physics";
import type { Pose } from "./multiplayer-math";

export type CollisionNpc = { s: number; lane: number; v: number; crashAge: number; impactOffset: number; contactLeft: number; passOffset?: number; crashOrigin?: number; shove?: number; crashSide?: number; crashMotion?: CrashMotion; crashSpeed?: number; recoveryLeft?: number; passing?: boolean; stunLeft?: number };
/** Seconds a car rammed from behind by the autopilot stays stopped before driving again. */
export const STUN_FOR = 3;
/** Before the motion store exists (the frame a crash starts), show the car where it was hit. */
export function npcCrash(car: CollisionNpc) { return car.crashMotion ?? { offset: car.crashOrigin ?? car.lane, yaw: 0, roll: 0, bounce: 0 }; }
export function npcOffset(car: CollisionNpc) {
  return (car.crashAge < 0 ? car.lane + (car.passOffset ?? 0) : npcCrash(car).offset) + car.impactOffset;
}
function pose(car: CollisionNpc) {
  const z = -car.s, offset = npcOffset(car);
  return { x: roadX(z) + offset, y: groundY(z, offset) + 0.03, z, yaw: Math.atan(roadXd(z)) + (car.lane > 0 ? 0 : Math.PI) + (car.crashAge < 0 ? 0 : npcCrash(car).yaw * Math.sign(car.lane)) };
}
/** Relative impact speed between the player and this car, in m/s. */
export function impactSpeed(playerSpeed: number, car: CollisionNpc) {
  return car.lane > 0 ? Math.max(0, playerSpeed - car.v) : playerSpeed + car.v;
}
/** A crash may only start where the player can actually see it: just behind the car to ~260 m ahead. */
export function crashVisible(playerS: number, car: CollisionNpc) {
  const ds = car.s - playerS;
  return ds > -15 && ds < 260;
}
/** Only real rear-to-front contact with an active autopilot triggers this avoidance exit. */
export function resolveAutopilotNpcContact(player: Pose, autopilot: boolean, car: CollisionNpc, lateral = 0, playerSpeed = 0) {
  const npcPose = pose(car);
  const push = carContact(player, npcPose);
  if (!push) return null;
  const dx = npcPose.x - player.x, dz = npcPose.z - player.z;
  const behindPlayer = dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw);
  const aheadOfNpc = dx * Math.sin(npcPose.yaw) + dz * Math.cos(npcPose.yaw);
  const aligned = Math.cos(player.yaw - npcPose.yaw) > 0.7;
  if (autopilot && aligned && behindPlayer > 2.1 && aheadOfNpc > 2.1 && car.crashAge < 0 && car.contactLeft <= 0) {
    const offset = npcOffset(car);
    // Steer toward the nearer roadside; retain current lateral motion instead of teleporting.
    car.crashSide = Math.sign(offset) || Math.sign(car.lane) || 1;
    car.crashOrigin = offset;
    car.impactOffset = 0;
    car.shove = 0;
    car.crashAge = 0;
    car.contactLeft = 0.5;
    car.crashMotion = createSwerveMotion(offset, car.v, car.crashSide, lateral);
  } else if (autopilot && aligned && behindPlayer < -2.1 && aheadOfNpc < -2.1 && car.crashAge < 0) {
    // Autopilot front hits this car's rear: it stalls and gets shoved aside, then drives on.
    if (!(car.stunLeft && car.stunLeft > 0)) car.stunLeft = STUN_FOR;
    car.v = 0;
    const lat = (npcPose.x - player.x) * Math.cos(player.yaw) - (npcPose.z - player.z) * Math.sin(player.yaw);
    const side = Math.abs(lat) > 0.05 ? Math.sign(lat) : Math.sign(npcOffset(car)) || 1;
    car.impactOffset = Math.max(-6, Math.min(6, car.impactOffset + side * 0.25));
  } else if (car.crashAge < 0 && car.contactLeft <= 0) {
    // A hard hit from the player launches the car like NPC-on-NPC impacts do:
    // it tumbles away comically instead of just slowing the player down.
    const speed = impactSpeed(playerSpeed, car);
    if (playerSpeed > 9 && speed > 9) {
      const severity = Math.min(2, Math.max(0.6, speed / 14));
      const offset = npcOffset(car);
      const lat = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
      car.crashOrigin = offset;
      car.crashSide = Math.abs(lat) > 0.05 ? Math.sign(lat) : Math.sign(offset) || Math.sign(car.lane) || 1;
      car.impactOffset = 0;
      car.shove = severity;
      car.crashSpeed = Math.max(car.v * 0.5, playerSpeed * 0.35);
      car.crashAge = 0;
      car.passing = false;
      car.contactLeft = 0.8;
      car.crashMotion = createCrashMotion(offset, car.crashSpeed, car.crashSide, severity);
      car.v = car.crashMotion.speed;
    }
  }
  return push;
}
/** Separate both footprints; one active victim crashes while the survivor recovers. When allowWreck is false the cars only separate and slow — no crash starts out of the player's sight. */
export function resolveNpcCollision(a: CollisionNpc, b: CollisionNpc, allowWreck = true) {
  const pa = pose(a), pb = pose(b), push = carContact(pa, pb);
  if (!push) return false;
  const freshImpact = a.contactLeft <= 0 && b.contactLeft <= 0;
  const faster = a.v > b.v ? a : b, slower = faster === a ? b : a;
  const relativeSpeed = a.lane * b.lane < 0 ? a.v + b.v : Math.abs(a.v - b.v);
  const severity = Math.min(2, Math.max(0.3, relativeSpeed / 18));
  const bothDriving = a.crashAge < 0 && b.crashAge < 0;
  // In a head-on encounter the car furthest out of its home lane takes the
  // crash, rather than randomly destroying the innocent oncoming driver too.
  const aDisplaced = Math.abs(npcOffset(a) - a.lane), bDisplaced = Math.abs(npcOffset(b) - b.lane);
  const victim = a.lane * b.lane < 0 && Math.abs(aDisplaced - bDisplaced) > 0.1 ? aDisplaced > bDisplaced ? a : b : slower;
  const victimSpeed = victim.v;
  a.s -= push.z / 2; b.s += push.z / 2;
  a.impactOffset += pa.x + push.x / 2 - roadX(-a.s) - npcOffset(a);
  b.impactOffset += pb.x - push.x / 2 - roadX(-b.s) - npcOffset(b);
  if (freshImpact) {
    if (bothDriving && allowWreck) {
      const survivor = victim === a ? b : a;
      victim.crashOrigin = npcOffset(victim);
      victim.crashSide = Math.sign(victim.crashOrigin) || Math.sign(victim.lane) || 1;
      victim.impactOffset = 0;
      victim.shove = severity;
      victim.crashSpeed = victimSpeed * 0.65;
      victim.crashAge = 0;
      victim.passing = false;
      victim.crashMotion = createCrashMotion(victim.crashOrigin, victim.crashSpeed, victim.crashSide, severity);
      victim.v = victim.crashMotion.speed;
      survivor.v = Math.max(2, survivor.v * 0.45);
      survivor.recoveryLeft = 1.2;
      survivor.passing = false;
    } else {
      // Hitting an existing wreck never turns the remaining driver into a
      // second permanent wreck, or restarts the original wreck's momentum.
      for (const car of [a, b]) {
        car.v *= 0.5;
        if (car.crashAge < 0) { car.v = Math.max(2, car.v); car.recoveryLeft = 1.2; car.passing = false; }
      }
    }
    a.contactLeft = 0.8; b.contactLeft = 0.8;
    // Contact must also slow the momentum store, or the next frame restores wreck speed.
    if (a.crashMotion) a.crashMotion.speed = Math.min(a.crashMotion.speed, a.v);
    if (b.crashMotion) b.crashMotion.speed = Math.min(b.crashMotion.speed, b.v);
  }
  return true;
}