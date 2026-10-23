import { ROAD_HALF } from "./road";

export type CrashMotion = { offset: number; lateral: number; speed: number; yaw: number; spin: number; roll: number; rollVelocity: number; bounce: number; vertical: number; side: number; restRoll: number; swerveTarget?: number };
/** Avoidance starts with steering, not an impact impulse or an arbitrary spin. */
export function createSwerveMotion(offset: number, speed: number, side: number, lateral = 0): CrashMotion {
  const direction = Math.sign(side) || 1;
  return { offset, speed, lateral, yaw: -Math.atan2(lateral, Math.max(0.1, speed)),
    spin: 0, roll: 0, rollVelocity: 0, bounce: 0, vertical: 0,
    side: direction, restRoll: direction * 0.04, swerveTarget: direction * (ROAD_HALF + 2.5) };
}
export function createCrashMotion(offset: number, speed: number, side: number, severity = 0): CrashMotion {
  const strength = Math.max(0, Math.min(2, severity));
  const direction = Math.sign(side) || 1;
  return { offset, lateral: direction * (5 + Math.min(3, speed * 0.1) + strength * 2), speed,
    yaw: 0, spin: -direction * (0.65 + strength * 0.8), roll: 0, rollVelocity: direction * (0.5 + strength * 0.7),
    bounce: 0, vertical: strength * 0.8, side: direction, restRoll: direction * 0.13 };
}
const reduce = (v: number, amount: number) => Math.sign(v) * Math.max(0, Math.abs(v) - amount);
/** Road-relative momentum, surface friction and damped suspension. Never driven toward a timed endpoint. */
export function stepCrashMotion(motion: CrashMotion, dt: number): number {
  let distance = 0;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const offroad = Math.abs(motion.offset) > ROAD_HALF;
    const oldSpeed = motion.speed;
    motion.speed = reduce(motion.speed, (offroad ? 5 : 2.8) * h);
    distance += (oldSpeed + motion.speed) * 0.5 * h;
    if (motion.swerveTarget !== undefined) {
      const error = motion.swerveTarget - motion.offset;
      // A bounded steering angle makes a curved exit, then countersteers to straighten in the grass.
      const targetLateral = Math.max(-motion.speed * 0.38, Math.min(motion.speed * 0.38, error * 1.8));
      const previousLateral = motion.lateral;
      motion.lateral += (targetLateral - motion.lateral) * (1 - Math.exp(-4 * h));
      if (motion.speed === 0 && Math.abs(motion.lateral) < 0.01) motion.lateral = 0;
      motion.offset += (previousLateral + motion.lateral) * 0.5 * h;
      const heading = -Math.atan2(motion.lateral, Math.max(0.5, motion.speed));
      motion.yaw += (heading - motion.yaw) * (1 - Math.exp(-6 * h));
      const lean = Math.max(-0.07, Math.min(0.07, -(motion.lateral - previousLateral) / h * 0.006));
      motion.rollVelocity += (-28 * (motion.roll - (lean + (offroad ? motion.restRoll : 0))) - 8 * motion.rollVelocity) * h;
      motion.roll += motion.rollVelocity * h;
      continue;
    }
    const oldLateral = motion.lateral;
    motion.lateral = reduce(motion.lateral, (offroad ? 3.6 : 1.6) * h);
    motion.offset += (oldLateral + motion.lateral) * 0.5 * h;
    // Deep roadside vegetation catches the wreck, rather than letting it slide forever.
    if (Math.abs(motion.offset) > ROAD_HALF + 8) { motion.offset = Math.sign(motion.offset) * (ROAD_HALF + 8); motion.lateral = 0; }
    motion.yaw += motion.spin * h;
    motion.spin *= Math.exp(-(offroad ? 2 : 0.9) * h);
    motion.rollVelocity += (-28 * (motion.roll - (offroad ? motion.restRoll : 0)) - 8 * motion.rollVelocity) * h;
    motion.roll += motion.rollVelocity * h;
    motion.vertical -= 9.81 * h;
    motion.bounce += motion.vertical * h;
    if (motion.bounce < 0) { motion.bounce = 0; motion.vertical = Math.abs(motion.vertical) > 0.5 ? -motion.vertical * 0.22 : 0; }
    if (motion.speed === 0 && motion.lateral === 0 && Math.abs(motion.spin) < 0.001) motion.spin = 0;
  }
  return distance;
}