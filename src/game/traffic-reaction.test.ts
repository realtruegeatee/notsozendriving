import { expect, it } from "vitest";
import { LANE, ROAD_HALF } from "./road";
import { chooseTrafficReaction, reactionSpeed, roadsideCrash, shouldAutopilotSignal, threatenedTraffic } from "./traffic-reaction";

const car = { s: 30, lane: LANE, crashAge: -1 };
it("NPC reactions include a chance to crash, accelerate, or brake", () => {
  expect(chooseTrafficReaction(0.1)).toBe("crash");
  expect(chooseTrafficReaction(0.5)).toBe("accelerate");
  expect(chooseTrafficReaction(0.9)).toBe("brake");
});
it("accelerating NPCs speed up and braking NPCs slow down", () => {
  expect(reactionSpeed(16, "accelerate")).toBeGreaterThan(16);
  expect(reactionSpeed(16, "brake")).toBeLessThan(16);
  expect(reactionSpeed(16, "crash")).toBe(0);
  expect(reactionSpeed(16, null)).toBe(16);
});
it("an NPC can finish its reaction before responding again", () => {
  expect(threatenedTraffic(0, { ...car, reactionLeft: 4 })).toBe(false);
  expect(threatenedTraffic(0, { ...car, reactionLeft: 0 })).toBe(true);
});
it("autopilot honks and flashes at nearby NPCs without spamming", () => {
  expect(shouldAutopilotSignal(true, 20, 0, 0, [car])).toBe(true);
  expect(shouldAutopilotSignal(true, 20, 1, 0, [car])).toBe(false);
  expect(shouldAutopilotSignal(false, 20, 0, 0, [car])).toBe(false);
});
it("only nearby cars ahead react, and wrecks do not react again", () => {
  expect(threatenedTraffic(0, car)).toBe(true);
  expect(threatenedTraffic(0, { ...car, s: -10 })).toBe(false);
  expect(threatenedTraffic(0, { ...car, s: 100 })).toBe(false);
  expect(threatenedTraffic(0, { ...car, crashAge: 2 })).toBe(false);
});
it("NPCs skid to the roadside on their own side and remain crashed", () => {
  for (const lane of [LANE, -LANE]) {
    expect(roadsideCrash(0, lane).offset).toBe(lane);
    expect(Math.abs(roadsideCrash(0.65, lane).offset)).toBeGreaterThan(Math.abs(lane));
    const wreck = roadsideCrash(3, lane);
    expect(Math.abs(wreck.offset)).toBeGreaterThan(ROAD_HALF + 1);
    expect(Math.sign(wreck.offset)).toBe(Math.sign(lane));
    expect(wreck.yaw).not.toBe(0);
    expect(roadsideCrash(10, lane).offset).toBe(wreck.offset);
  }
});