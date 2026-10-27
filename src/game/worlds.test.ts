import { describe, expect, it } from "vitest";
import { worldAt, segmentForBiome, warpToWorld, WORLD_CHOICES, worldMood } from "./worlds";
import { BIOME_LEN, biomeOf, biomeWeights, LANE, roadX } from "./road";
import { game } from "./store";

describe("worlds", () => {
  it("starts in world 01 in the meadow", () => {
    expect(worldAt(0)).toMatchObject({ number: 1, label: "world 01", name: "the meadow" });
  });
  it("advances one world per biome stretch", () => {
    expect(worldAt(BIOME_LEN * 3 + 10).label).toBe("world 04");
  });
});

describe("world picker", () => {
  it("offers every biome as a choice", () => {
    expect(new Set(WORLD_CHOICES.map((w) => w.id)).size).toBe(9);
  });
  it("finds a segment for every chosen biome", () => {
    for (const w of WORLD_CHOICES) expect(biomeOf(segmentForBiome(w.id))).toBe(w.id);
  });
  it("warps the car into the chosen world on the right lane", () => {
    const before = game.warp;
    warpToWorld("neon");
    expect(worldAt(-game.z).name).toBe("neon city");
    expect(biomeWeights(game.z).neon).toBeGreaterThan(0.9);
    expect(worldMood(-game.z).some(([b, v]) => b === "neon" && v > 0.9)).toBe(true);
    expect(Math.abs(game.x - roadX(game.z) - LANE)).toBeLessThan(0.01);
    expect(game.speed).toBe(0);
    expect(game.warp).toBe(before + 1);
  });
  it("warps fully inside the biome, not at the blend edge", () => {
    warpToWorld("tropical");
    expect(-game.z % BIOME_LEN).toBeGreaterThan(0.5 * BIOME_LEN * 0.1);
  });
});
