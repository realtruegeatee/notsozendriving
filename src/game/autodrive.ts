import { LANE, ROAD_HALF, roadX } from "./road";

export type RoadCar = { z: number; lane: number; speed: number; same: boolean };
// true retains the original left-pass state; right passes must retain their side too.
export type Passing = boolean | "right";
export const RIGHT_PASS = ROAD_HALF - 1;
export const RIGHT_PASS_WAIT = 1.5;
export function planAutodrive(z: number, speed: number, passing: Passing, cars: RoadCar[], blockedFor = 0, dt = 0, currentLane = passing === "right" ? RIGHT_PASS : passing ? -LANE : LANE, maxSpeed = 34) {
  const ahead = cars.filter((c) => c.same && Math.abs(c.lane - LANE) < 1.8 && z - c.z > -6 && z - c.z < 65);
  const blocker = ahead.filter((c) => c.speed < 29).sort((a, b) => Math.abs(z - a.z) - Math.abs(z - b.z))[0];
  const blocked = (lane: number) => cars.some((c) => Math.abs(c.lane - lane) < 2.2 && z - c.z > -Math.max(10, (c.speed - speed) * 1.0) && z - c.z < (c.same ? Math.max(32, (speed - c.speed) * 1.0) : Math.max(70, (speed + c.speed) * 1.6)));
  const leftBlocked = blocked(-LANE), rightBlocked = blocked(RIGHT_PASS);
  const mergeSafe = !cars.some((c) => {
    if (Math.abs(c.lane - LANE) >= 2.2) return false;
    const gap = z - c.z;
    const aheadGap = c.same ? 8 + Math.max(0, speed - c.speed) * 0.6 : Math.max(45, (speed + c.speed) * 1.15);
    const behindGap = 6 + (c.same ? Math.max(0, c.speed - speed) * 0.8 : 0);
    return gap > -behindGap && gap < aheadGap;
  });
  // Patience only runs out while following nearby slow traffic, not on approach.
  const waiting = !passing && blocker && z - blocker.z >= 0 && z - blocker.z <= 40 && leftBlocked;
  const waited = waiting ? Math.min(RIGHT_PASS_WAIT, blockedFor + Math.max(0, dt)) : 0;
  let next: Passing = false;
  if (passing === "right") {
    // Return on the very first safe frame, not after clearing all distant traffic.
    next = mergeSafe ? false : "right";
  } else if (passing ? ahead.length > 0 : Boolean(blocker)) {
    if (!leftBlocked) next = true;
    else if (!rightBlocked && (passing || waited >= RIGHT_PASS_WAIT)) next = "right";
  }
  // Reckless but never parked: it always keeps creeping so it cannot get stuck.
  const CREEP = 3;
  // Speed from which we can still brake to the car's speed before reaching a safe gap; creep only with room.
  const follow = (carSpeed: number, gap: number, keep: number) =>
    Math.max(gap > keep + 3 ? CREEP : 0, Math.min(carSpeed + (gap - keep) * 0.7, Math.sqrt(carSpeed * carSpeed + 2 * 7 * Math.max(0, gap - keep))));
  let targetSpeed = maxSpeed;
  if (!next && blocker) targetSpeed = Math.min(targetSpeed, follow(blocker.speed, z - blocker.z, 9));
  if (passing === true && !next && ahead.length > 0) targetSpeed = Math.min(targetSpeed, 16);
  const lane = next === "right" ? RIGHT_PASS : next ? -LANE : LANE;
  // Brake for hazards in the destination lane and close hazards along the lane-change path.
  for (const c of cars) {
    const gap = z - c.z;
    const inTarget = Math.abs(c.lane - lane) < 2.2;
    const inPath = c.lane > Math.min(currentLane, lane) - 1.9 && c.lane < Math.max(currentLane, lane) + 1.9;
    if (gap < 0 || !(inTarget || (inPath && gap < 10))) continue;
    if (c.same) targetSpeed = Math.min(targetSpeed, follow(c.speed, gap, 7));
    else if (gap < Math.max(18, (speed + c.speed) * 0.9)) targetSpeed = Math.min(targetSpeed, gap < 25 ? 0 : CREEP);
  }
  return { lane, targetSpeed, passing: next, blockedFor: next ? 0 : waited };
}

export function laneOffset(x: number, z: number) { return x - roadX(z); }