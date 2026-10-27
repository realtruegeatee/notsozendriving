import { describe, expect, it } from "vitest";
import { LANE, ROAD_HALF, roadRecovery, roadX, roadXd } from "./road";

describe("off-road recovery", () => {
  const z = -50;
  it("pulls a car that drifted off back toward its lane", () => {
    const lat = ROAD_HALF + 3; // off the right side
    const yaw = Math.atan(roadXd(z)) + 0.4; // pointing further away
    const target = Math.atan(roadXd(z)) - Math.max(-0.3, Math.min(0.3, (LANE - lat) * 0.09));
    const next = roadRecovery(z, lat, yaw, 1 / 60);
    expect(next).not.toBe(yaw);
    expect(Math.abs(next - target)).toBeLessThan(Math.abs(yaw - target));
  });
  it("works on the left shoulder too", () => {
    const lat = -(ROAD_HALF + 3);
    const yaw = Math.atan(roadXd(z)) - 0.4;
    const target = Math.atan(roadXd(z)) - Math.max(-0.3, Math.min(0.3, (-LANE - lat) * 0.09));
    const next = roadRecovery(z, lat, yaw, 1 / 60);
    expect(Math.abs(next - target)).toBeLessThan(Math.abs(yaw - target));
  });
  it("is frame-rate independent: two half steps equal one full step", () => {
    const lat = ROAD_HALF + 4, yaw = Math.atan(roadXd(z)) + 0.5;
    const half = roadRecovery(z, lat, roadRecovery(z, lat, yaw, 1 / 120), 1 / 120);
    const full = roadRecovery(z, lat, yaw, 1 / 60);
    expect(half).toBeCloseTo(full, 4);
  });
});
