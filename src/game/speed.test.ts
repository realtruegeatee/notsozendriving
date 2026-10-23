import { expect, it } from "vitest";
import { FEEL } from "./store";
import { maxSpeedForDistance, powerCurve, UNLOCKED_MAX_KMH } from "./speed";

it("caps the car at its normal top speed before 5 km", () => {
  expect(maxSpeedForDistance(0)).toBe(FEEL.MAX);
  expect(maxSpeedForDistance(4999)).toBe(FEEL.MAX);
  expect(FEEL.MAX * 3.6).toBeLessThan(UNLOCKED_MAX_KMH);
});

it("raises the top speed to 200 km/h once 5 km is driven", () => {
  expect(maxSpeedForDistance(5000) * 3.6).toBeCloseTo(200, 6);
  expect(maxSpeedForDistance(50_000) * 3.6).toBeCloseTo(200, 6);
});

it("keeps the original engine curve below the unlock", () => {
  expect(powerCurve(0, FEEL.MAX)).toBe(1);
  expect(powerCurve(17, FEEL.MAX)).toBeCloseTo(1 - 17 / FEEL.MAX, 10);
});

it("still pulls at full throttle just under 200 km/h so the cap is reachable", () => {
  const maxV = maxSpeedForDistance(5000);
  // Drag alone would settle the car far below the cap, so thrust must beat it.
  expect(powerCurve(maxV * 0.98, maxV) * FEEL.ACCEL).toBeGreaterThan(FEEL.DRAG * maxV * 0.98);
});

it("reaches 200 km/h under full throttle once unlocked", () => {
  const dt = 1 / 60;
  let v = 0;
  let distance = 5000;
  for (let i = 0; i < 60 * 25; i++) {
    const maxV = maxSpeedForDistance(distance);
    v += FEEL.ACCEL * powerCurve(v, maxV) * dt;
    v *= Math.exp(-FEEL.DRAG * dt);
    v = Math.min(v, maxV);
    distance += v * dt;
  }
  expect(v * 3.6).toBeGreaterThanOrEqual(198);
  expect(v * 3.6).toBeLessThanOrEqual(200);
});
import { maxSpeedForDistance as msd } from "./speed";
test("max speed rises to 300 km/h at 10 km", () => {
  expect(msd(9999) * 3.6).toBeCloseTo(200, 6);
  expect(msd(10000) * 3.6).toBeCloseTo(300, 6);
});
