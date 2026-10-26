import { expect, it } from "vitest";
import { autopilotHazardPlan, trafficProfile } from "./chaos";

it("Zen has fewer calm cars than Normal and Mayhem", () => {
  expect(trafficProfile("zen").count).toBe(6);
  expect(trafficProfile("zen").count).toBeLessThan(trafficProfile("normal").count);
  expect(trafficProfile("zen").count).toBeLessThan(trafficProfile("mayhem").count);
  expect(trafficProfile("zen").calm).toBe(true);
  expect(trafficProfile("normal").calm).toBe(false);
});
for (const kind of ["oil", "rock"] as const) {
  it(`autopilot holds a safe ${kind} escape until the rear clears`, () => {
    const e: RoadEvent = { kind, s: 100, offset: 2.1, radius: kind === "oil" ? 2.6 : 1.3 };
    const first = autopilotHazardPlan([e], 30, 2.1, 30, null);
    expect(first.target).not.toBeNull();
    if (first.target === null) throw new Error("Expected escape");
    expect(hitsEvent(e, 100, first.target)).toBe(false);
    expect(autopilotHazardPlan([e], 101, first.target, 20, first.memory).target).toBe(first.target);
    expect(autopilotHazardPlan([e], 107, first.target, 20, first.memory).target).toBeNull();
  });
}
it("autopilot brakes when traffic blocks both hazard escapes", () => {
  const e: RoadEvent = { kind: "rock", s: 30, offset: 0, radius: 1.3 };
  const plan = autopilotHazardPlan([e], 0, 0, 20, null, () => true);
  expect(plan.target).toBeNull();
  expect(plan.speed).toBeLessThan(30);
  expect(autopilotHazardPlan([e], 26, 0, 20, null, () => true).speed).toBe(0);
});
import { chaosProfile, dodgeEvent, hitsEvent, pileupSeverity, RAGE_FOR, stepRage, stepRoadEvents } from "./chaos";
import type { RoadEvent } from "./chaos";
import { resolveNpcCollision } from "./npc-collision";
import { createCrashMotion } from "./crash-physics";

it("zen turns all extra chaos off", () => {
  const z = chaosProfile("zen");
  expect(z.pileup).toBe(0); expect(z.ragePerSec).toBe(0);
  const ev: RoadEvent[] = [];
  for (let i = 0; i < 1000; i++) stepRoadEvents(ev, 0, 0, 1, z, Math.random);
  expect(ev.length).toBe(0);
  expect(stepRage(0, 30, false, 0, 1, z)).toBe(0);
});
it("mayhem is more frequent and harder than normal", () => {
  const n = chaosProfile("normal"), m = chaosProfile("mayhem");
  expect(m.eventGap).toBeLessThan(n.eventGap);
  expect(m.ragePerSec).toBeGreaterThan(n.ragePerSec);
  expect(pileupSeverity(15, m)).toBeGreaterThan(pileupSeverity(15, n));
});
it("rage starts only for a car behind the player and ends after a while or on crash", () => {
  const p = chaosProfile("mayhem");
  expect(stepRage(0, 30, false, 0, 1, p)).toBe(RAGE_FOR);
  expect(stepRage(0, 200, false, 0, 1, p)).toBe(0);
  expect(stepRage(5, 30, true, 0, 1, p)).toBe(0);
  expect(stepRage(0.5, 30, false, 0.99, 1, p)).toBe(0);
});
it("events spawn ahead and are hit only nearby", () => {
  const ev: RoadEvent[] = [];
  stepRoadEvents(ev, 100, 0, 20, chaosProfile("normal"), () => 0.1);
  const e = ev[0]!;
  expect(e.s).toBeGreaterThan(200);
  expect(hitsEvent(e, e.s, e.offset)).toBe(true);
  expect(hitsEvent(e, e.s + 20, e.offset)).toBe(false);
});
it("a flying wreck knocks a driving car into a pileup", () => {
  const wreck = { s: 100, lane: 1.8, v: 18, crashAge: 0.3, impactOffset: 0, contactLeft: 0, crashMotion: createCrashMotion(1.8, 18, 1, 1) };
  wreck.crashMotion.offset = 1.8;
  const car = { s: 101.5, lane: 1.8, v: 10, crashAge: -1, impactOffset: 0, contactLeft: 0 };
  resolveNpcCollision(wreck, car, true, chaosProfile("mayhem"), 0);
  expect(car.crashAge).toBe(0);
  const calm = { s: 101.5, lane: 1.8, v: 10, crashAge: -1, impactOffset: 0, contactLeft: 0 };
  const w2 = { ...wreck, contactLeft: 0, crashMotion: { ...wreck.crashMotion } };
  resolveNpcCollision(w2, calm, true, chaosProfile("zen"), 0);
  expect(calm.crashAge).toBe(-1);
});
it("skilled drivers dodge an event with room to spare, but not when it is too late", () => {
  const oil: RoadEvent = { kind: "oil", s: 100, offset: 1.8, radius: 2.6 };
  // Far enough ahead: a clear offset outside the slick, still on the road.
  const dodge = dodgeEvent([oil], 40, 1.8, 25);
  expect(dodge).not.toBeNull();
  expect(Math.abs(dodge! - oil.offset)).toBeGreaterThan(oil.radius);
  // Too close at speed: no dodge, it will hit.
  expect(dodgeEvent([oil], 96, 1.8, 30)).toBeNull();
  // Nothing ahead or already passed: no dodge.
  expect(dodgeEvent([], 40, 1.8, 25)).toBeNull();
  expect(dodgeEvent([oil], 120, 1.8, 25)).toBeNull();
  // A lane already clear of the event needs no dodge.
  expect(dodgeEvent([oil], 40, -1.8, 25)).toBeNull();
});

import { rockAhead as rockAheadT, dodgeEvent as dodgeT } from "./chaos";
it("every driver can steer around a rock but ordinary drivers ignore oil", () => {
  const rock = [{ kind: "rock" as const, s: 40, offset: 2, radius: 1.2 }];
  const oil = [{ kind: "oil" as const, s: 40, offset: 2, radius: 1.2 }];
  expect(dodgeT(rock, 0, 2, 20, ["rock"])).not.toBeNull();
  expect(dodgeT(oil, 0, 2, 20, ["rock"])).toBeNull();
});
it("a rock right ahead makes the car brake", () => {
  const rock = [{ kind: "rock" as const, s: 15, offset: 2, radius: 1.2 }];
  expect(rockAheadT(rock, 0, 2, 20)).toBe(true);
  expect(rockAheadT(rock, 0, -2, 20)).toBe(false);
});

import { dodgePlan } from "./chaos";
it("a dodging car keeps its chosen side until it is past the rock", () => {
  const rock = [{ kind: "rock" as const, s: 40, offset: 0, radius: 1.2 }];
  const first = dodgePlan(rock, 0, 0.1, 20, ["rock"]);
  expect(first?.side).toBe(1);
  // Drifted to the other side of centre and now very close: still keeps the original side.
  expect(dodgePlan(rock, 35, -0.1, 20, ["rock"], 1)?.side).toBe(1);
});
it("a dodge never steers into an oncoming car", () => {
  const rock = [{ kind: "rock" as const, s: 40, offset: 0, radius: 1.2 }];
  const plan = dodgePlan(rock, 0, 0.1, 20, ["rock"], 0, (t) => t < 0);
  expect(plan?.target).toBeGreaterThan(0);
  expect(dodgePlan(rock, 0, 0.1, 20, ["rock"], 0, () => true)).toBeNull();
});
