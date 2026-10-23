import { expect, it } from "vitest";
import { planNpcDriving } from "./npc-driving";
import { LANE } from "./road";

const npc = (s: number, v: number, lane = LANE) => ({ s, v, base: v, lane, crashAge: -1, passOffset: 0, passing: false });
it("NPCs overtake slower NPCs in both travel directions", () => {
  for (const lane of [LANE, -LANE]) {
    const fast = npc(0, 22, lane), slow = npc(25 * Math.sign(lane), 12, lane);
    const plan = planNpcDriving(fast, [fast, slow], 22);
    expect(plan.passing).toBe(true);
    expect(plan.passOffset).toBe(-2 * lane);
    expect(plan.speed).toBe(22);
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