import { expect, it } from "vitest";
import { lightAutopilotBrake, movingAutopilotSpeed, movingBumpSpeed, planAutodrive, RIGHT_PASS } from "./autodrive";
import { LANE } from "./road";

it("never asks to stop even with every crossing blocked by wrecks", () => {
  const cars = [LANE, -LANE, RIGHT_PASS, -RIGHT_PASS].map((lane) => ({ z: -5, lane, speed: 0, same: true }));
  const plan = planAutodrive(0, 10, false, cars);
  expect(plan.targetSpeed).toBe(3);
  expect(plan.pushThrough).toBe(true);
  expect(movingAutopilotSpeed(plan.targetSpeed, Infinity, plan.pushThrough)).toBe(34 * 0.65);
});

it("chooses a clear left roadside instead of pushing a blocked passing lane", () => {
  const plan = planAutodrive(0, 8, true, [
    { z: -5, lane: -LANE, speed: 0, same: false },
    { z: 0, lane: LANE, speed: 0, same: true },
    { z: 0, lane: RIGHT_PASS, speed: 0, same: true },
  ], 0, 0.05, -LANE);
  expect(plan.lane).toBe(-RIGHT_PASS);
  expect(plan.pushThrough).toBe(false);
  expect(plan.targetSpeed).toBe(8);
  const held = planAutodrive(0, 8, plan.passing, [
    { z: -5, lane: -LANE, speed: 0, same: false },
    { z: 0, lane: LANE, speed: 0, same: true },
  ], 0, 0.05, -RIGHT_PASS);
  expect(held.lane).toBe(-RIGHT_PASS);
  expect(planAutodrive(-20, 8, held.passing, [], 0, 0.05, -RIGHT_PASS).lane).toBe(LANE);
});

it("allows modest slowing for traffic and hazards without stopping", () => {
  expect(movingAutopilotSpeed(3, 0, false)).toBe(34 * 0.65);
  expect(movingAutopilotSpeed(30, Infinity, false)).toBe(30);
  expect(movingAutopilotSpeed(3, 0, true, 300 / 3.6)).toBe((300 / 3.6) * 0.65);
});

it("brakes lightly when needed but never applies hard braking", () => {
  expect(lightAutopilotBrake(34, 34)).toBe(0);
  expect(lightAutopilotBrake(34, 30)).toBeCloseTo(0.105);
  expect(lightAutopilotBrake(80, 25)).toBe(0.18);
});

it("does not slow down on clear road", () => {
  const plan = planAutodrive(0, 25, false, []);
  expect(movingAutopilotSpeed(plan.targetSpeed, Infinity, plan.pushThrough)).toBe(34);
  expect(plan.pushThrough).toBe(false);
});

it("backs off repeated bumps while moving and pushes stopped blockers instead of parking", () => {
  expect(movingBumpSpeed(true, 0)).toBe(3);
  expect(movingBumpSpeed(false, 0)).toBe(6);
  expect(movingBumpSpeed(true, 15)).toBe(12);
  expect(movingBumpSpeed(false, 15)).toBe(20);
});