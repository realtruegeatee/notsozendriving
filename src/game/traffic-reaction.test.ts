import { expect, it } from "vitest";
import { LANE } from "./road";
import { ACCELERATE_CHANCE, BRAKE_CHANCE, chooseSporadicEvent, chooseTrafficReaction, CRASH_CHANCE, mustSlowFor, npcTargetSpeed, ONCOMING_SWERVE_CHANCE, pickRunoffVictim, reactionSpeed, shouldActSporadic, shouldAutopilotSignal, shouldSwerveForPass, SIGNAL_GAP, SPORADIC_INTERVAL, threatenedTraffic } from "./traffic-reaction";

const car = { s: 30, lane: LANE, crashAge: -1, v: 10 };
it("horns and flashes never make NPCs brake", () => {
  expect(chooseTrafficReaction(0.01)).toBe("crash");
  for (let i = 0; i <= 1000; i++) expect(chooseTrafficReaction(i / 1000)).not.toBe("brake");
  expect(BRAKE_CHANCE).toBe(0);
});
it("signals provoke more roadside panic while fleeing remains most common", () => {
  expect(chooseTrafficReaction(0.06)).toBe("crash");
  expect(chooseTrafficReaction(0.299)).toBe("crash");
  expect(chooseTrafficReaction(0.3)).toBe("panic");
  expect(chooseTrafficReaction(0.75)).toBe("panic");
  expect(CRASH_CHANCE).toBeGreaterThan(0.12);
  expect(ACCELERATE_CHANCE).toBeGreaterThan(0.5);
  expect(CRASH_CHANCE + ACCELERATE_CHANCE + BRAKE_CHANCE).toBeCloseTo(1, 10);
});
it("panicking cars accelerate harder than ordinary bursts without removing spontaneous braking", () => {
  expect(reactionSpeed(16, "panic")).toBeGreaterThan(reactionSpeed(16, "accelerate"));
  expect(reactionSpeed(40, "panic")).toBe(45);
  expect(chooseSporadicEvent(0.5)).toBe("brake");
});
it("oncoming encounters have a higher but bounded roadside swerve chance", () => {
  expect(ONCOMING_SWERVE_CHANCE).toBe(0.55);
  expect(shouldSwerveForPass(0.54)).toBe(true);
  expect(shouldSwerveForPass(0.55)).toBe(false);
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

it("sporadic mood swings are frame-rate independent and rare per frame", () => {
  expect(shouldActSporadic(0, 0.016)).toBe(true);
  expect(shouldActSporadic(0.999, 0.016)).toBe(false);
  // Same average rate at any frame rate: p = dt / interval.
  expect(shouldActSporadic(0.05 / SPORADIC_INTERVAL - 0.0001, 0.05)).toBe(true);
  expect(shouldActSporadic(0.05 / SPORADIC_INTERVAL + 0.0001, 0.05)).toBe(false);
  expect(shouldActSporadic(0, 0)).toBe(false);
});
it("sporadic events favor harmless chaos over unprovoked crashes", () => {
  expect(chooseSporadicEvent(0.1)).toBe("accelerate");
  expect(chooseSporadicEvent(0.5)).toBe("brake");
  expect(chooseSporadicEvent(0.9)).toBe("wander");
  expect(chooseSporadicEvent(0.99)).toBe("crash");
});
