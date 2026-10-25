import { expect, it } from "vitest";
import { applyImpact, computeImpact, controlFactor, createPlayerImpact, massOf, stepPlayerImpact } from "./impact";

it("a heavy truck barely moves while a hatchback gets thrown", () => {
  const truck = computeImpact(25, 0.5, massOf("truck"), 1.4, 1);
  const hatch = computeImpact(25, 0.5, massOf("hatchback-sports"), 1.4, 1);
  expect(truck.playerSpeedLoss).toBeLessThan(hatch.playerSpeedLoss);
  expect(Math.abs(truck.playerSpin)).toBeLessThan(Math.abs(hatch.playerSpin));
  expect(truck.npcThrow).toBeGreaterThan(hatch.npcThrow);
});
it("side hits spin more than rear hits", () => {
  const side = computeImpact(20, 1, 1.4, 1.4, 1), rear = computeImpact(20, 0, 1.4, 1.4, 1);
  expect(Math.abs(side.playerSpin)).toBeGreaterThan(Math.abs(rear.playerSpin));
  expect(Math.abs(side.playerLateral)).toBeGreaterThan(Math.abs(rear.playerLateral));
});
it("light bumps don't take control away", () => {
  expect(computeImpact(4, 0.3, 1.4, 1.4, 1).controlLoss).toBe(0);
});
it("the autopilot regains control after a hard hit", () => {
  const s = createPlayerImpact();
  applyImpact(s, computeImpact(40, 1, 1.4, 1.4, 1));
  expect(controlFactor(s)).toBeLessThan(1);
  for (let i = 0; i < 300; i++) stepPlayerImpact(s, 1 / 60);
  expect(controlFactor(s)).toBe(1);
  expect(s.spin).toBe(0);
});
it("impact decay is frame-rate independent", () => {
  const a = createPlayerImpact(), b = createPlayerImpact();
  const r = computeImpact(30, 0.8, 1.4, 1.4, -1);
  applyImpact(a, r); applyImpact(b, r);
  let ma = 0, mb = 0;
  for (let i = 0; i < 120; i++) ma += stepPlayerImpact(a, 1 / 60).moved;
  for (let i = 0; i < 40; i++) mb += stepPlayerImpact(b, 0.05).moved;
  expect(ma).toBeCloseTo(mb, 3);
});
