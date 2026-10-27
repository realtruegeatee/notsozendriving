import { describe, expect, it } from "vitest";
import { worldAt } from "./worlds";

describe("worlds", () => {
  it("starts in world 01 in the meadow", () => {
    expect(worldAt(0)).toMatchObject({ number: 1, label: "world 01", name: "the meadow" });
  });
  it("advances one world per biome stretch", () => {
    expect(worldAt(900 * 3 + 10).label).toBe("world 04");
  });
});

import { weatherAt } from "./worlds";
import { BIOME_LEN, biomeOf } from "./road";
describe("new worlds", () => {
  it("snows in the tundra and rains in neon city", () => {
    const find = (b: string) => { for (let i = 1; i < 500; i++) if (biomeOf(i) === b) return i; throw new Error(b); };
    expect(weatherAt(find("tundra") * BIOME_LEN + 100).snow).toBe(1);
    expect(weatherAt(find("neon") * BIOME_LEN + 100).rain).toBe(1);
    expect(weatherAt(find("volcanic") * BIOME_LEN + 100).ash).toBe(1);
  });
  it("starts with clear weather", () => {
    expect(weatherAt(100)).toEqual({ snow: 0, rain: 0, ash: 0 });
  });
});
