import { LANE, roadX } from "./road";

export type RoadCar = { z: number; lane: number; speed: number; same: boolean };
export function planAutodrive(z: number, speed: number, passing: boolean, cars: RoadCar[]) {
  const ahead = cars.filter((c) => c.same && c.lane > 0 && z - c.z > -6 && z - c.z < 65);
  const blocker = ahead.find((c) => c.speed < 29);
  const danger = cars.some((c) => c.lane < 0 && Math.abs(z - c.z) < (c.same ? 18 : 85));
  const overtake = !danger && (passing ? ahead.length > 0 : Boolean(blocker));
  let targetSpeed = 30;
  if (!overtake && blocker) targetSpeed = Math.min(targetSpeed, Math.max(0, blocker.speed + (z - blocker.z - 12) * 0.65));
  if (passing && danger) targetSpeed = Math.min(targetSpeed, 16);
  return { lane: overtake ? -LANE : LANE, targetSpeed, passing: overtake };
}

export function laneOffset(x: number, z: number) { return x - roadX(z); }