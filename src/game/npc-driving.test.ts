import { expect, it } from "vitest";
import { planNpcDriving, stepNpcLane } from "./npc-driving";
import { LANE } from "./road";

const npc = (s: number, v: number, lane = LANE) => ({ s, v, base: v, lane, crashAge: -1, passOffset: 0, passing: false });
it("NPCs overtake slower NPCs in both travel directions", () => {
  for (const lane of [LANE, -LANE]) {
    const fast = npc(0, 22, lane), slow = npc(25 * Math.sign(lane), 12, lane);
    const plan = planNpcDriving(fast, [fast, slow], 22);
    expect(plan.passing).toBe(true);
    expect(plan.passOffset).toBe(-2 * lane);
    expect(plan.speed).toBeLessThan(22);
    fast.passOffset = plan.passOffset;
    fast.passing = true;
    expect(planNpcDriving(fast, [fast, slow], 22).speed).toBe(22);
  }
});
it("NPCs wait and slow down for oncoming traffic instead of passing into it", () => {
  const fast = npc(0, 22), slow = npc(15, 12), oncoming = npc(60, 20, -LANE);
  const plan = planNpcDriving(fast, [fast, slow, oncoming], 22);
  expect(plan.passing).toBe(false);
  expect(plan.speed).toBeLessThan(22);
});
it("NPCs retain the pass alongside and return after clearing the slower car", () => {
  const fast = { ...npc(0, 22), passing: true, passOffset: -2 * LANE };
  expect(planNpcDriving(fast, [fast, npc(2, 12)], 22).passing).toBe(true);
  expect(planNpcDriving(fast, [fast, npc(-10, 12)], 22).passOffset).toBe(0);
});

it("a close blocker still causes braking while pulling out in either direction", () => {
  for (const lane of [LANE, -LANE]) {
    const fast = npc(0, 22, lane), slow = npc(12 * Math.sign(lane), 10, lane);
    const plan = planNpcDriving(fast, [fast, slow], 22);
    expect(plan.passing).toBe(true);
    expect(plan.speed).toBe(10);
  }
});

it("wrecks at their actual offset block passing and merging", () => {
  const fast = npc(0, 22), slow = npc(20, 10);
  const wreck = { ...npc(30, 0), crashAge: 2, offset: -LANE };
  expect(planNpcDriving(fast, [fast, slow, wreck], 22).passing).toBe(false);
  const passing = { ...fast, passing: true, passOffset: -2 * LANE };
  const homeWreck = { ...wreck, s: 10, offset: LANE };
  expect(planNpcDriving(passing, [passing, homeWreck], 22).passing).toBe(true);
});

it("a faster car approaching from behind prevents merging back", () => {
  const passing = { ...npc(0, 16), passing: true, passOffset: -2 * LANE };
  expect(planNpcDriving(passing, [passing, npc(-20, 30)], 16).passing).toBe(true);
});

it("NPCs abort a pass when oncoming traffic appears and home is clear", () => {
  const fast = { ...npc(0, 22), passing: true, passOffset: -2 * LANE };
  const slow = npc(40, 10), oncoming = npc(80, 25, -LANE);
  expect(planNpcDriving(fast, [fast, slow, oncoming], 22).passing).toBe(false);
});

it("lane changes ease in, settle without overshoot, and work in both directions", () => {
  for (const target of [-2 * LANE, 2 * LANE]) {
    let state = { offset: 0, velocity: 0 };
    state = stepNpcLane(state.offset, state.velocity, target, 22, 1 / 60);
    expect(Math.abs(state.offset)).toBeLessThan(0.01);
    for (let i = 0; i < 240; i++) {
      const before = state.offset;
      state = stepNpcLane(state.offset, state.velocity, target, 22, 1 / 60);
      expect(Math.abs(state.offset - before)).toBeLessThanOrEqual(2.8 / 60 + 1e-9);
      expect(Math.abs(state.offset)).toBeLessThanOrEqual(Math.abs(target));
    }
    expect(state.offset).toBeCloseTo(target, 2);
    expect(Math.abs(state.velocity)).toBeLessThan(0.01);
  }
});

it("lane changes are delta-timed and parked NPCs do not slide sideways", () => {
  const simulate = (dt: number) => {
    let state = { offset: 0, velocity: 0 };
    for (let i = 0; i < Math.round(3 / dt); i++) state = stepNpcLane(state.offset, state.velocity, -2 * LANE, 22, dt);
    return state.offset;
  };
  expect(simulate(1 / 30)).toBeCloseTo(simulate(1 / 120), 2);
  expect(stepNpcLane(-1, -2, -4.2, 0, 0.05)).toEqual({ offset: -1, velocity: 0 });
});
it("A home-lane NPC only eases off for an oncoming passer instead of stopping", () => {
  const home = npc(0, 20), passer = { ...npc(20, 20, -LANE), passOffset: 2 * LANE, passing: true };
  expect(planNpcDriving(home, [home, passer], 20).speed).toBeCloseTo(12);
});

it("NPCs do not pull out when there is no gap ahead of the slow car to merge into", () => {
  const fast = npc(0, 22), slow = npc(20, 12), queue = npc(30, 12);
  expect(planNpcDriving(fast, [fast, slow, queue], 22).passing).toBe(false);
});

it("A stuck passer drops back below the slow car when oncoming traffic closes in", () => {
  const passer = { ...npc(0, 18), passOffset: -2 * LANE, passing: true };
  const slow = npc(2, 12), oncoming = npc(70, 20, -LANE);
  expect(planNpcDriving(passer, [passer, slow, oncoming], 22).speed).toBeLessThan(12);
});
