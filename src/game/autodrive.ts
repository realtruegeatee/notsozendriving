import { LANE, ROAD_HALF, roadX } from "./road";

export type RoadCar = { z: number; lane: number; speed: number; same: boolean };
// true retains the original left-pass state; right passes must retain their side too.
export type Passing = boolean | "right";
export const RIGHT_PASS = ROAD_HALF - 1;
export function planAutodrive(z: number, speed: number, passing: Passing, cars: RoadCar[]) {
  const ahead = cars.filter((c) => c.same && Math.abs(c.lane - LANE) < 1.8 && z - c.z > -6 && z - c.z < 65);
  const blocker = ahead.find((c) => c.speed < 29);
  const blocked = (lane: number) => cars.some((c) => Math.abs(c.lane - lane) < 2.2 && z - c.z > -18 && z - c.z < (c.same ? 65 : 85));
  const leftBlocked = blocked(-LANE), rightBlocked = blocked(RIGHT_PASS);
  let next: Passing = false;
  if (passing ? ahead.length > 0 : Boolean(blocker)) {
    if (passing === "right" && !rightBlocked) next = "right";
    else if (!leftBlocked) next = true;
    else if (!rightBlocked) next = "right";
  }
  let targetSpeed = 30;
  if (!next && blocker) targetSpeed = Math.min(targetSpeed, Math.max(0, blocker.speed + (z - blocker.z - 12) * 0.65));
  if (passing && !next && ahead.length > 0) targetSpeed = Math.min(targetSpeed, 16);
  return { lane: next === "right" ? RIGHT_PASS : next ? -LANE : LANE, targetSpeed, passing: next };
}

export function laneOffset(x: number, z: number) { return x - roadX(z); }