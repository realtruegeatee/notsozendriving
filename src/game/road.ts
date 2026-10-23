// Pure road/terrain math. The road runs toward -Z; distance along it is s = -z.
export const ROAD_HALF = 5.5;
export const LANE = 2.1;
export const CHUNK = 100;

export function roadX(z: number) {
  return 30 * Math.sin(z * 0.004) + 12 * Math.sin(z * 0.011 + 1) + 4 * Math.sin(z * 0.023 + 2);
}
export function roadXd(z: number) {
  return (
    30 * 0.004 * Math.cos(z * 0.004) +
    12 * 0.011 * Math.cos(z * 0.011 + 1) +
    4 * 0.023 * Math.cos(z * 0.023 + 2)
  );
}
export function roadY(z: number) {
  return 6 * Math.sin(z * 0.003) + 2.5 * Math.sin(z * 0.009 + 1.3);
}
export function roadYd(z: number) {
  return 6 * 0.003 * Math.cos(z * 0.003) + 2.5 * 0.009 * Math.cos(z * 0.009 + 1.3);
}

export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t: number) {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

/** Ground height at road-distance z and lateral offset u from the centerline. */
export function groundY(z: number, u: number) {
  const base = roadY(z) - 0.03;
  const a = Math.abs(u);
  if (a < 6.5) return base;
  const ditch = -0.5 * Math.min((a - 6.5) / 2, 1);
  const t = smooth((a - 9) / 40);
  const hills = 5 + 4 * Math.sin(z * 0.013 + u * 0.03) + 3 * Math.sin(z * 0.031 - u * 0.07);
  return base + ditch + t * hills;
}
