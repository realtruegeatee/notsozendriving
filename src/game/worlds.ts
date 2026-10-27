import { BIOME_LEN, biomeOf, biomeWeights } from "./road";
import type { Biome } from "./road";

/** Each biome stretch of the one endless road is a numbered "world". */
const NAMES: Record<Biome, string> = {
  meadow: "the meadow", forest: "the forest", desert: "the desert", alpine: "the mountains", lake: "the lake",
  tundra: "the tundra", neon: "neon city", volcanic: "the wasteland", tropical: "the coast",
};
export function worldAt(s: number) {
  const segment = Math.max(0, Math.floor(s / BIOME_LEN));
  return { number: segment + 1, label: `world ${String(segment + 1).padStart(2, "0")}`, name: NAMES[biomeOf(segment)] };
}

export type Weather = "snow" | "rain" | "ash";
/** The entirely new worlds bring their own sky, fog and weather. */
export const LOOKS: Partial<Record<Biome, { sky: string; night: string; weather: Weather | null }>> = {
  tundra: { sky: "#cfdde6", night: "#1a2433", weather: "snow" },
  neon: { sky: "#3a2552", night: "#120a24", weather: "rain" },
  volcanic: { sky: "#8a4a33", night: "#2a0d08", weather: "ash" },
  tropical: { sky: "#8fd6e8", night: "#0c2238", weather: null },
};
/** Blend of special-world looks at road distance s: [biome, weight] for each one present. */
export function worldMood(s: number) {
  const w = biomeWeights(-s);
  return (Object.keys(LOOKS) as Biome[]).map((b) => [b, w[b]] as const).filter(([, v]) => v > 0);
}
export function weatherAt(s: number): Record<Weather, number> {
  const out = { snow: 0, rain: 0, ash: 0 };
  for (const [b, v] of worldMood(s)) { const k = LOOKS[b]?.weather; if (k) out[k] += v; }
  return out;
}
