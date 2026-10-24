// Pure speed-ceiling math: the car is capped until it has driven far enough.
import { FEEL } from "./store";

export const KMH_PER_MS = 3.6;
export const SPEED_UNLOCK_KM = 5;
export const UNLOCKED_MAX_KMH = 200;
export const SECOND_UNLOCK_KM = 10;
export const SECOND_MAX_KMH = 300;
export const BASE_MAX_MS = FEEL.MAX;

// Rolling drag alone would settle the car well below a raised ceiling, so the
// engine keeps pulling until it is nearly there. The higher the ceiling, the
// later the power tapers — the normal ceiling keeps its original linear curve.
const TAPER_PER_MS = 4.2;

/** Top speed in m/s for a given distance driven along the road. Mayhem opens the 300 km/h ceiling from the start. */
export function maxSpeedForDistance(distance: number, mayhem = false): number {
  if (mayhem) return SECOND_MAX_KMH / KMH_PER_MS;
  if (distance >= SECOND_UNLOCK_KM * 1000) return SECOND_MAX_KMH / KMH_PER_MS;
  return distance >= SPEED_UNLOCK_KM * 1000 ? UNLOCKED_MAX_KMH / KMH_PER_MS : BASE_MAX_MS;
}

/** Full-throttle thrust factor (0..1) at speed `v` against the given ceiling. */
export function powerCurve(v: number, maxSpeed: number): number {
  const ratio = Math.max(0, Math.min(1, v / maxSpeed));
  const taper = 1 + Math.max(0, maxSpeed - BASE_MAX_MS) * TAPER_PER_MS;
  return 1 - ratio ** taper;
}
