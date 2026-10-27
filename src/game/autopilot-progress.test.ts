import { expect, it } from "vitest";
import { movingAutopilotSpeed, movingBumpSpeed, planAutodrive, RIGHT_PASS } from "./autodrive";
import { LANE } from "./road";

it("never asks to stop even with every crossing blocked by wrecks", () => {
  const cars = [LANE, -LANE, RIGHT_PASS, -RIGHT_PASS].map((lane) => ({ z: -5, lane, speed: 0, same: true }));
  const plan = planAutodrive(0, 10, false, cars);
  expect(plan.targetSpeed).toBe(3);
  expect(plan.pushThrough).toBe(true);
  expect(movingAutopilotSpeed(plan.targetSpeed, Infinity, plan.pushThrough)).toBe(6);
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
});

it("slows for an unavoidable hazard without ever requesting a standstill", () => {
  expect(movingAutopilotSpeed(34, 0, false)).toBe(3);
  expect(movingAutopilotSpeed(34, 12, false)).toBe(12);
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