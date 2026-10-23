import { expect, it } from "vitest";
import { createCrashMotion, createSwerveMotion, stepCrashMotion } from "./crash-physics";
import { LANE, ROAD_HALF } from "./road";

it("avoidance builds sideways motion gradually instead of kicking the car sideways", () => {
  const state = createSwerveMotion(LANE, 24, 1);
  expect(state.lateral).toBe(0);
  expect(state.spin).toBe(0);
  stepCrashMotion(state, 1 / 60);
  expect(state.offset - LANE).toBeLessThan(0.01);
  expect(state.lateral).toBeGreaterThan(0);
});
it("swerves follow their heading, stay planted and straighten before settling on either roadside", () => {
  for (const side of [-1, 1]) {
    const state = createSwerveMotion(LANE, 24, side);
    for (let i = 0; i < 180; i++) {
      stepCrashMotion(state, 1 / 60);
      expect(state.yaw * side).toBeLessThanOrEqual(0);
      expect(Math.abs(state.yaw)).toBeLessThan(0.4);
      expect(Math.abs(state.roll)).toBeLessThan(0.1);
      expect(state.bounce).toBe(0);
    }
    expect(state.offset * side).toBeGreaterThan(ROAD_HALF);
    for (let i = 0; i < 1200; i++) stepCrashMotion(state, 1 / 60);
    expect(state.speed).toBe(0);
    expect(state.lateral).toBe(0);
    expect(Math.abs(state.yaw)).toBeLessThan(0.001);
    const rest = state.offset;
    stepCrashMotion(state, 1);
    expect(state.offset).toBe(rest);
  }
});
it("swerve steering carries existing lane motion and is frame-rate independent", () => {
  const a = createSwerveMotion(LANE, 24, -1, -1.2), b = { ...a };
  expect(a.lateral).toBe(-1.2);
  for (let i = 0; i < 600; i++) stepCrashMotion(a, 1 / 60);
  for (let i = 0; i < 200; i++) stepCrashMotion(b, 0.05);
  expect(a.offset).toBeCloseTo(b.offset, 5);
  expect(a.yaw).toBeCloseTo(b.yaw, 5);
});

it("crashed cars retain momentum then stop instead of sliding forever", () => {
  const state = createCrashMotion(LANE, 20, 1, 1);
  expect(stepCrashMotion(state, 0.1)).toBeGreaterThan(1.8);
  for (let i = 0; i < 1200; i++) stepCrashMotion(state, 1 / 60);
  expect(state.speed).toBe(0); expect(state.lateral).toBe(0);
  expect(state.offset).toBeGreaterThan(ROAD_HALF);
  const end = state.offset;
  stepCrashMotion(state, 2);
  expect(state.offset).toBe(end);
  expect(Math.abs(state.roll - state.restRoll)).toBeLessThan(0.001);
  expect(state.bounce).toBe(0);
});
it("stronger crashes impart more sideways momentum and spin", () => {
  const soft = createCrashMotion(LANE, 20, 1, 0.3);
  const hard = createCrashMotion(LANE, 20, 1, 1.5);
  expect(hard.lateral).toBeGreaterThan(soft.lateral);
  expect(Math.abs(hard.spin)).toBeGreaterThan(Math.abs(soft.spin));
});
it("crashes can skid toward either roadside", () => {
  for (const side of [-1, 1]) {
    const state = createCrashMotion(LANE, 20, side, 1);
    for (let i = 0; i < 600; i++) stepCrashMotion(state, 1 / 60);
    expect(state.offset * side).toBeGreaterThan(ROAD_HALF);
  }
});
it("crash movement remains consistent across frame rates", () => {
  const a = createCrashMotion(LANE, 20, 1, 1), b = { ...a };
  for (let i = 0; i < 600; i++) stepCrashMotion(a, 1 / 60);
  for (let i = 0; i < 200; i++) stepCrashMotion(b, 0.05);
  expect(a.offset).toBeCloseTo(b.offset, 5);
  expect(a.yaw).toBeCloseTo(b.yaw, 5);
});