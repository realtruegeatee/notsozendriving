import { BIOME_LEN, biomeOf } from "./road";
import type { Biome } from "./road";

/** Each biome stretch of the one endless road is a numbered "world". */
const NAMES: Record<Biome, string> = { meadow: "the meadow", forest: "the forest", desert: "the desert", alpine: "the mountains", lake: "the lake" };
export function worldAt(s: number) {
  const segment = Math.max(0, Math.floor(s / BIOME_LEN));
  return { number: segment + 1, label: `world ${String(segment + 1).padStart(2, "0")}`, name: NAMES[biomeOf(segment)] };
}
