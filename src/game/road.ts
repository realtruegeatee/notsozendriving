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

// Biomes change every few hundred metres, blending smoothly between neighbours.
export const BIOMES = ["meadow", "forest", "desert", "alpine", "lake"] as const;
export type Biome = (typeof BIOMES)[number];
export type BiomeWeights = Record<Biome, number>;
export const BIOME_LEN = 900;
export function biomeOf(segment: number): Biome {
  return segment <= 0 ? "alpine" : BIOMES[Math.floor(hash(segment * 7.31 + 2) * BIOMES.length)] ?? "meadow";
}
export const lakeSide = (segment: number) => (hash(segment * 3.17 + 5) > 0.5 ? 1 : -1);
function segments(z: number) {
  const b = -z / BIOME_LEN, i = Math.floor(b);
  const mix = smooth((b - i - 0.75) / 0.25);
  return [[i, 1 - mix], [i + 1, mix]] as const;
}
export function biomeWeights(z: number): BiomeWeights {
  const w: BiomeWeights = { meadow: 0, forest: 0, desert: 0, alpine: 0, lake: 0 };
  for (const [i, m] of segments(z)) w[biomeOf(i)] += m;
  return w;
}
/** How much lake there is on the side of the road at offset u (0..1). */
export function lakeAmount(z: number, u: number) {
  let a = 0;
  for (const [i, m] of segments(z)) if (biomeOf(i) === "lake" && Math.sign(u) === lakeSide(i)) a += m;
  return a;
}
export const WATER_DROP = 0.45;

/** Ground height at road-distance z and lateral offset u from the centerline. */
export function groundY(z: number, u: number) {
  const base = roadY(z) - 0.03;
  const a = Math.abs(u);
  if (a < 6.5) return base;
  const ditch = -0.5 * Math.min((a - 6.5) / 2, 1);
  const t = smooth((a - 9) / 40);
  const w = biomeWeights(z);
  const hills = (5 + 4 * Math.sin(z * 0.013 + u * 0.03) + 3 * Math.sin(z * 0.031 - u * 0.07)) * (1 - 0.65 * w.desert) * (1 + 1.5 * w.alpine);
  const peaks = w.alpine * smooth((a - 30) / 90) * (40 + 25 * Math.sin(z * 0.011 + u * 0.023));
  const land = base + ditch + t * hills + peaks;
  const lake = lakeAmount(z, u) * smooth((a - 11) / 6);
  return land + (base - WATER_DROP - 1.6 - land) * lake;
}
