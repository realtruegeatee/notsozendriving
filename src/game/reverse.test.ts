import { describe, expect, it } from "vitest";
import { REVERSE_MAX, manualReverse } from "./reverse";

describe("manualReverse", () => {
  it("engages reverse when the brake is held while standing still", () => {
    const v = manualReverse(0, 1, 1 / 60);
    expect(v).toBeLessThan(0);
  });

  it("caps reverse speed below REVERSE_MAX", () => {
    let v = 0;
    for (let i = 0; i < 60 * 30; i++) v = manualReverse(v, 1, 1 / 60)!;
    expect(v).toBeCloseTo(-REVERSE_MAX, 5);
    expect(v).toBeGreaterThanOrEqual(-REVERSE_MAX);
  });

  it("rolls back to a stop once the brake is released", () => {
    let v: number | null = -REVERSE_MAX;
    for (let i = 0; i < 60 * 3 && v !== null; i++) v = manualReverse(v, 0, 1 / 60);
    expect(v).toBe(0);
    // Stays out of the way once stopped.
    expect(manualReverse(0, 0, 1 / 60)).toBeNull();
  });

  it("stays uninvolved while driving forward with the brake released", () => {
    expect(manualReverse(20, 0, 1 / 60)).toBeNull();
  });
});
