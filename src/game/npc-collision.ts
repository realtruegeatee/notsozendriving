import { carContact } from "./multiplayer-math";
import { groundY, roadX, roadXd } from "./road";
import { roadsideCrash } from "./traffic-reaction";
import type { CrashMotion } from "./crash-physics";
import { createCrashMotion, createSwerveMotion } from "./crash-physics";
import type { Pose } from "./multiplayer-math";

export type CollisionNpc = { s: number; lane: number; v: number; crashAge: number; impactOffset: number; contactLeft: number; passOffset?: number; crashOrigin?: number; shove?: number; crashSide?: number; crashMotion?: CrashMotion; crashSpeed?: number; recoveryLeft?: number; passing?: boolean; stunLeft?: number };
/** Seconds a car rammed from behind by the autopilot stays stopped before driving again. */
export const STUN_FOR = 3;
export function npcCrash(car: CollisionNpc) { return car.crashMotion ?? roadsideCrash(car.crashAge, car.lane, car.crashOrigin, car.shove, car.crashSide); }
export function npcOffset(car: CollisionNpc) {
  return (car.crashAge < 0 ? car.lane + (car.passOffset ?? 0) : npcCrash(car).offset) + car.impactOffset;
}
function pose(car: CollisionNpc) {
  const z = -car.s, offset = npcOffset(car);
  return { x: roadX(z) + offset, y: groundY(z, offset) + 0.03, z, yaw: Math.atan(roadXd(z)) + (car.lane > 0 ? 0 : Math.PI) + (car.crashAge < 0 ? 0 : npcCrash(car).yaw * Math.sign(car.lane)) };
}
/** Only real rear-to-front contact with an active autopilot triggers this avoidance exit. */
export function resolveAutopilotNpcContact(player: Pose, autopilot: boolean, car: CollisionNpc, lateral = 0) {
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
  }
  return push;
}
/** Separate both footprints; one active victim crashes while the survivor recovers. */
export function resolveNpcCollision(a: CollisionNpc, b: CollisionNpc) {
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
    if (bothDriving) {
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