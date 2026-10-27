// Manual reverse: holding the brake once the car has (nearly) stopped backs it up.
// Pure math so the driving-loop rule stays testable.
import { FEEL } from "./store";

export const REVERSE_MAX = 9;

// Returns the new speed while reverse is engaged, or null when not involved.
export function manualReverse(v: number, brake: number, dt: number) {
  if (brake > 0 && v < 1) return Math.max(v - FEEL.ACCEL * 0.45 * brake * dt, -REVERSE_MAX);
  if (v < 0) return Math.min(0, v + FEEL.BRAKE * 0.5 * dt); // brake released: roll to a stop
  return null;
}
