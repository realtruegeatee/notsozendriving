import { expect, it } from "vitest";
import { LANE, ROAD_HALF } from "./road";
import { ACCELERATE_CHANCE, BRAKE_CHANCE, chooseTrafficReaction, CRASH_CHANCE, mustSlowFor, npcTargetSpeed, pickRunoffVictim, reactionSpeed, roadsideCrash, shouldAutopilotSignal, SIGNAL_GAP, threatenedTraffic } from "./traffic-reaction";

const car = { s: 30, lane: LANE, crashAge: -1, v: 10 };
it("NPC reactions include a chance to crash, accelerate, or brake", () => {
  expect(chooseTrafficReaction(0.03)).toBe("crash");
  expect(chooseTrafficReaction(0.5)).toBe("accelerate");
  expect(chooseTrafficReaction(0.9)).toBe("brake");
});
it("swerving off the road is rare and speeding up is the common reaction", () => {
  expect(chooseTrafficReaction(0.06)).toBe("accelerate");
  expect(chooseTrafficReaction(0.6)).toBe("accelerate");
  expect(chooseTrafficReaction(0.66)).toBe("accelerate");
  expect(chooseTrafficReaction(0.68)).toBe("brake");
  expect(CRASH_CHANCE).toBe(0.05);
  expect(ACCELERATE_CHANCE).toBeGreaterThan(0.5);
  expect(CRASH_CHANCE + ACCELERATE_CHANCE + BRAKE_CHANCE).toBeCloseTo(1, 10);
});
it("accelerating NPCs speed up and braking NPCs slow down", () => {
  expect(reactionSpeed(16, "accelerate")).toBeGreaterThan(16);
  expect(reactionSpeed(16, "brake")).toBeLessThan(16);
  expect(reactionSpeed(16, "crash")).toBe(0);
  expect(reactionSpeed(16, null)).toBe(16);
  // A crashing car rolls to a stop even when its reaction flag was cleared (run-off victims).
  expect(npcTargetSpeed(16, null, true)).toBe(0);
  expect(npcTargetSpeed(16, "accelerate", true)).toBe(0);
  expect(npcTargetSpeed(16, null, false)).toBe(16);
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
    const blocking = t < 0.5 ? [car] : [{ ...car, v: 26 }];
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
it("an accelerating NPC runs a slower car in its lane off the street", () => {
  const hot = { s: 0, lane: LANE, crashAge: -1, v: 26, reaction: "accelerate" as const };
  const slow = { s: 12, lane: LANE, crashAge: -1, v: 12, reaction: null };
  expect(pickRunoffVictim(hot, [slow])).toBe(slow);
  expect(pickRunoffVictim({ ...hot, reaction: null }, [slow])).toBeNull();
  expect(pickRunoffVictim(hot, [{ ...slow, lane: -LANE }])).toBeNull();
  expect(pickRunoffVictim(hot, [{ ...slow, v: 25 }])).toBeNull();
  expect(pickRunoffVictim(hot, [{ ...slow, s: 200 }])).toBeNull();
  expect(pickRunoffVictim(hot, [{ ...slow, crashAge: 1 }])).toBeNull();
});
it("the nearest car in the way is the one that gets shoved", () => {
  const hot = { s: 0, lane: LANE, crashAge: -1, v: 26, reaction: "accelerate" as const };
  const slow = { s: 12, lane: LANE, crashAge: -1, v: 12, reaction: null };
  const near = { ...slow, s: 8 }, far = { ...slow, s: 18 };
  expect(pickRunoffVictim(hot, [far, near])).toBe(near);
});
it("swerving cars can leave the road on either side", () => {
  expect(roadsideCrash(5, LANE, LANE, 0, 1).offset).toBeGreaterThan(LANE);
  expect(roadsideCrash(5, LANE, LANE, 0, -1).offset).toBeLessThan(-LANE);
});
