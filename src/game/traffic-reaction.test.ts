import { expect, it } from "vitest";
import { LANE, ROAD_HALF } from "./road";
import { ACCELERATE_CHANCE, BRAKE_CHANCE, chooseTrafficReaction, CRASH_CHANCE, mustSlowFor, reactionSpeed, roadsideCrash, shouldAutopilotSignal, SIGNAL_GAP, threatenedTraffic } from "./traffic-reaction";

const car = { s: 30, lane: LANE, crashAge: -1, v: 10 };
it("NPC reactions include a chance to crash, accelerate, or brake", () => {
  expect(chooseTrafficReaction(0.1)).toBe("crash");
  expect(chooseTrafficReaction(0.5)).toBe("accelerate");
  expect(chooseTrafficReaction(0.9)).toBe("brake");
});
it("swerving off the road is rare and speeding up is the common reaction", () => {
  expect(chooseTrafficReaction(0.2)).toBe("accelerate");
  expect(chooseTrafficReaction(0.6)).toBe("accelerate");
  expect(chooseTrafficReaction(0.69)).toBe("accelerate");
  expect(chooseTrafficReaction(0.71)).toBe("brake");
  expect(CRASH_CHANCE).toBeLessThan(0.2);
  expect(ACCELERATE_CHANCE).toBeGreaterThan(0.5);
  expect(CRASH_CHANCE + ACCELERATE_CHANCE + BRAKE_CHANCE).toBeCloseTo(1, 10);
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
it("autopilot honks and flashes only at a slower car ahead in our lane", () => {
  expect(shouldAutopilotSignal(true, 20, 0, 0, LANE, [car])).toBe(true);
  expect(shouldAutopilotSignal(true, 20, 1, 0, LANE, [car])).toBe(false);
  expect(shouldAutopilotSignal(false, 20, 0, 0, LANE, [car])).toBe(false);
});
it("no signal unless the car ahead forces us to slow down", () => {
  expect(shouldAutopilotSignal(true, 20, 0, 0, -LANE, [car])).toBe(false); // oncoming lane
  expect(shouldAutopilotSignal(true, 20, 0, 0, LANE, [{ ...car, v: 26 }])).toBe(false); // pulling away
  expect(shouldAutopilotSignal(true, 20, 0, 0, LANE, [{ ...car, s: 100 }])).toBe(false); // far ahead
  expect(shouldAutopilotSignal(true, 20, 0, 0, LANE, [{ ...car, s: 1 }])).toBe(false); // alongside
  expect(shouldAutopilotSignal(true, 20, 0, 0, LANE, [{ ...car, reactionLeft: 3 }])).toBe(true); // still in the way
  expect(mustSlowFor(0, LANE, 20, car)).toBe(true);
  expect(mustSlowFor(0, LANE, 20, { ...car, crashAge: 2 })).toBe(false);
});
it("blares again and again while a car is still blocking the lane", () => {
  let cooldown = 0, fired = 0;
  for (let t = 0; t < 5; t += 1 / 60) {
    cooldown = Math.max(0, cooldown - 1 / 60);
    if (shouldAutopilotSignal(true, 20, cooldown, 0, LANE, [car])) { fired++; cooldown = SIGNAL_GAP; }
  }
  expect(fired).toBeGreaterThanOrEqual(4);
  expect(SIGNAL_GAP).toBeLessThan(1);
});
it("falls silent once the car ahead is no longer in the way", () => {
  let cooldown = 0, fired = 0;
  for (let t = 0; t < 5; t += 1 / 60) {
    cooldown = Math.max(0, cooldown - 1 / 60);
    const blocking = t < 1 ? [car] : [{ ...car, v: 26 }];
    if (shouldAutopilotSignal(true, 20, cooldown, 0, LANE, blocking)) { fired++; cooldown = SIGNAL_GAP; }
  }
  expect(fired).toBe(1);
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