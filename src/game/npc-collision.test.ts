import { expect, it } from "vitest";
import { carContact } from "./multiplayer-math";
import { npcCrash, npcOffset, resolveNpcCollision } from "./npc-collision";
import type { CollisionNpc } from "./npc-collision";
import { LANE, groundY, roadX, roadXd } from "./road";
import { createCrashMotion, stepCrashMotion } from "./crash-physics";

const npc = (s: number, v: number, lane = LANE) => ({ s, v, lane, crashAge: -1, impactOffset: 0, contactLeft: 0 });
it("NPC rear-end collisions separate and slow both cars", () => {
  const a = npc(30, 25), b = npc(32, 5);
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.v).toBeLessThan(5); expect(b.v).toBeLessThan(5);
  const pose = (c: typeof a) => ({ x: roadX(-c.s) + npcOffset(c), y: groundY(-c.s, npcOffset(c)) + 0.03, z: -c.s, yaw: Math.atan(roadXd(-c.s)) });
  expect(carContact(pose(a), pose(b))).toBeNull();
});
it("cars in separate lanes do not collide", () => {
  const a = npc(30, 20), b = npc(30, 20, -LANE);
  expect(resolveNpcCollision(a, b)).toBe(false);
  expect(a.v).toBe(20);
});
it("an oncoming NPC hitting another car loses speed", () => {
  const a = npc(30, 20), b = npc(31, 20, -LANE);
  b.impactOffset = LANE * 2;
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.v).toBe(4); expect(b.v).toBe(4);
});
it("a forceful NPC collision pushes the slower car off the road without a horn reaction", () => {
  for (const lane of [LANE, -LANE]) {
    const direction = Math.sign(lane);
    const faster = npc(30, 25, lane), slower = npc(30 + direction * 2, 10, lane);
    expect(resolveNpcCollision(faster, slower)).toBe(true);
    expect(slower.crashAge).toBe(0);
    expect(faster.crashAge).toBe(-1);
    slower.crashAge = 2;
    expect(Math.abs(npcOffset(slower))).toBeGreaterThan(5.5);
  }
});
it("gentle NPC bumps do not run cars off the road", () => {
  const a = npc(30, 15), b = npc(32, 12);
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.crashAge).toBe(-1);
  expect(b.crashAge).toBe(-1);
});
it("a shove gives immediate sideways momentum and body roll without teleporting", () => {
  const faster: CollisionNpc = npc(30, 25), slower: CollisionNpc = npc(32, 10);
  resolveNpcCollision(faster, slower);
  const origin = npcOffset(slower);
  expect(slower.shove).toBeCloseTo(15 / 18);
  slower.crashMotion = createCrashMotion(origin, slower.crashSpeed ?? slower.v, 1, slower.shove);
  stepCrashMotion(slower.crashMotion, 0.15);
  expect(npcOffset(slower) - origin).toBeGreaterThan(0.8);
  expect(Math.abs(npcCrash(slower).roll)).toBeGreaterThan(0.05);
  expect(npcCrash(slower).bounce).toBeGreaterThan(0);
});
it("nearby cars cannot shove without physical contact", () => {
  const faster = npc(30, 25), slower = npc(42, 10);
  expect(resolveNpcCollision(faster, slower)).toBe(false);
  expect(slower.crashAge).toBe(-1);
});
it("a new collision cannot restore a wreck's pre-impact momentum", () => {
  const wreck: CollisionNpc = npc(30, 10);
  wreck.crashAge = 0;
  wreck.crashMotion = createCrashMotion(LANE, 10, 1);
  const car = npc(32, 8);
  expect(resolveNpcCollision(wreck, car)).toBe(true);
  expect(wreck.crashMotion.speed).toBe(wreck.v);
  expect(wreck.crashMotion.speed).toBeLessThan(10);
});
it("head-on NPC crashes send both cars off the road in different directions", () => {
  const a = { s: 50, lane: LANE, v: 15, crashAge: -1, impactOffset: 0, contactLeft: 0, passOffset: -2 * LANE };
  const b = { s: 51, lane: -LANE, v: 15, crashAge: -1, impactOffset: 0, contactLeft: 0 };
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.crashAge).toBe(0); expect(b.crashAge).toBe(0);
  expect(Math.sign(npcCrash({ ...a, crashAge: 5 }).offset)).not.toBe(Math.sign(npcCrash({ ...b, crashAge: 5 }).offset));
});
