import { LANE, roadX, roadXd, roadY } from "./road";

export type Pose = { x: number; y: number; z: number; yaw: number };
export type Sample = Pose & { at: number; warp: number };
export const INTERPOLATION_MS = 180;
export const STALE_MS = 2500;

export function hasNpcTraffic(room: string | null) {
  return room === null || room === "PUBLIC";
}

export function interpolatePose(a: Sample, b: Sample, at: number): Pose {
  if (a.warp !== b.warp || Math.hypot(b.x - a.x, b.z - a.z) > 25) return b;
  const t = Math.max(0, Math.min(1, (at - a.at) / Math.max(1, b.at - a.at)));
  const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw: a.yaw + turn * t };
}

/** Place behind the friend on the road, never inside their car. */
export function teleportPose(friend: Pose, occupied: Pose[]): Pose | null {
  const lane = friend.x - roadX(friend.z) >= 0 ? LANE : -LANE;
  for (let gap = 9; gap <= 81; gap += 9) {
    const z = friend.z + gap;
    const pose = { x: roadX(z) + lane, y: roadY(z), z, yaw: Math.atan(roadXd(z)) };
    if (occupied.every((p) => Math.hypot(p.x - pose.x, p.z - pose.z) >= 7)) return pose;
  }
  return null;
}

/** Oriented car footprints, with a minimum separating translation for the local car. */
export function carContact(a: Pose, b: Pose): { x: number; z: number } | null {
  if (Math.abs(a.y - b.y) > 2 || Math.hypot(a.x - b.x, a.z - b.z) > 5) return null;
  const rightA = [Math.cos(a.yaw), -Math.sin(a.yaw)];
  const frontA = [Math.sin(a.yaw), Math.cos(a.yaw)];
  const rightB = [Math.cos(b.yaw), -Math.sin(b.yaw)];
  const frontB = [Math.sin(b.yaw), Math.cos(b.yaw)];
  const dot = (v: number[], w: number[]) => (v[0] ?? 0) * (w[0] ?? 0) + (v[1] ?? 0) * (w[1] ?? 0);
  let depth = Infinity;
  let push = { x: 0, z: 0 };
  for (const axis of [rightA, frontA, rightB, frontB]) {
    const nx = axis[0] ?? 0, nz = axis[1] ?? 0;
    const signed = (a.x - b.x) * nx + (a.z - b.z) * nz;
    const radiusA = Math.abs(dot(rightA, axis)) + 2.1 * Math.abs(dot(frontA, axis));
    const radiusB = Math.abs(dot(rightB, axis)) + 2.1 * Math.abs(dot(frontB, axis));
    const overlap = radiusA + radiusB - Math.abs(signed);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const amount = (overlap + 0.02) * (signed < 0 ? -1 : 1);
      push = { x: nx * amount, z: nz * amount };
    }
  }
  return push;
}