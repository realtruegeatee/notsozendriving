import { carContact } from "./multiplayer-math";
import { groundY, roadX, roadXd } from "./road";
import { roadsideCrash } from "./traffic-reaction";

export type CollisionNpc = { s: number; lane: number; v: number; crashAge: number; impactOffset: number; contactLeft: number; passOffset?: number; crashOrigin?: number; shove?: number; crashSide?: number };
export function npcCrash(car: CollisionNpc) { return roadsideCrash(car.crashAge, car.lane, car.crashOrigin, car.shove, car.crashSide); }
export function npcOffset(car: CollisionNpc) {
  return (car.crashAge < 0 ? car.lane + (car.passOffset ?? 0) : npcCrash(car).offset) + car.impactOffset;
}
function pose(car: CollisionNpc) {
  const z = -car.s, offset = npcOffset(car);
  return { x: roadX(z) + offset, y: groundY(z, offset) + 0.03, z, yaw: Math.atan(roadXd(z)) + (car.lane > 0 ? 0 : Math.PI) + (car.crashAge < 0 ? 0 : npcCrash(car).yaw) };
}
/** Each pair is separated symmetrically; impacts slow both cars, never accelerate a wreck. */
export function resolveNpcCollision(a: CollisionNpc, b: CollisionNpc) {
  const pa = pose(a), pb = pose(b), push = carContact(pa, pb);
  if (!push) return false;
  const freshImpact = a.contactLeft <= 0 && b.contactLeft <= 0;
  const faster = a.v > b.v ? a : b, slower = faster === a ? b : a;
  const direction = Math.sign(faster.lane);
  const shove = freshImpact && a.crashAge < 0 && b.crashAge < 0 && a.lane * b.lane > 0 &&
    faster.v - slower.v > 6 && (slower.s - faster.s) * direction >= -1;
  a.s -= push.z / 2; b.s += push.z / 2;
  a.impactOffset += pa.x + push.x / 2 - roadX(-a.s) - npcOffset(a);
  b.impactOffset += pb.x - push.x / 2 - roadX(-b.s) - npcOffset(b);
  if (freshImpact) {
    if (a.lane * b.lane < 0) { a.v *= 0.2; b.v *= 0.2; }
    else {
      const shared = Math.min(a.v, b.v) * 0.7;
      a.v = shared; b.v = shared;
    }
    a.contactLeft = 0.5; b.contactLeft = 0.5;
  }
  // A forceful hit starts the existing roadside skid; wreck physics then stops the victim.
  if (shove) {
    slower.crashOrigin = npcOffset(slower);
    slower.impactOffset = 0;
    slower.shove = 1;
    slower.crashAge = 0;
  }
  return true;
}