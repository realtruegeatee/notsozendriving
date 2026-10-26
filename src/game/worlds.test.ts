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
