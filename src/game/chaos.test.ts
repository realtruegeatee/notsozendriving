import { expect, it } from "vitest";
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
