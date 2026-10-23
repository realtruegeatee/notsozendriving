import { describe, expect, it } from "vitest";
import { REVERSE_FOR, stepUnstick } from "./autodrive";

describe("autopilot stuck recovery", () => {
  it("reverses after 2 seconds stuck", () => {
    expect(stepUnstick(1.9, 0, 0.5, 2, 0.05).reversing).toBe(false);
    expect(stepUnstick(1.96, 0, 0.5, 2, 0.05)).toMatchObject({ reversing: true, reverseLeft: REVERSE_FOR });
  });
  it("does not count while moving freely", () => {
    expect(stepUnstick(1.9, 0, 10, 30, 0.05).stuckFor).toBe(0);
  });
  it("retries a pass when reversing ends", () => {
    expect(stepUnstick(0, 0.03, -4, 0, 0.05)).toMatchObject({ reversing: false, retryPass: true });
  });
});
