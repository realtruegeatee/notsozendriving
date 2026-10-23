import { expect, it } from "vitest";
import { carContact } from "./multiplayer-math";
import { npcCrash, npcOffset, resolveNpcCollision, resolveAutopilotNpcContact } from "./npc-collision";
import type { CollisionNpc } from "./npc-collision";
import { LANE, groundY, roadX, roadXd } from "./road";
import { createCrashMotion, stepCrashMotion } from "./crash-physics";

const npc = (s: number, v: number, lane = LANE) => ({ s, v, lane, crashAge: -1, impactOffset: 0, contactLeft: 0 });
const playerPose = (s: number, lane = LANE) => ({ x: roadX(-s) + lane, y: groundY(-s, lane), z: -s, yaw: Math.atan(roadXd(-s)) });
it("autopilot rear bumper touching an NPC front bumper starts a smooth roadside swerve", () => {
  for (const offset of [LANE, -LANE]) {
    const hit: CollisionNpc = { ...npc(47, 25), passOffset: offset - LANE };
    const origin = npcOffset(hit);
    expect(resolveAutopilotNpcContact(playerPose(50, offset), true, hit)).not.toBeNull();
    expect(hit.crashAge).toBe(0);
    expect(hit.crashMotion?.offset).toBe(origin);
    expect(hit.crashMotion?.swerveTarget).toBe(Math.sign(offset) * 8);
    expect(hit.crashMotion?.spin).toBe(0);
    if (!hit.crashMotion) throw new Error("Missing swerve motion");
    stepCrashMotion(hit.crashMotion, 0.3);
    expect((npcOffset(hit) - origin) * Math.sign(offset)).toBeGreaterThan(0.2);
  }
});
it("manual driving rear contact does not trigger the autopilot swerve", () => {
  const hit = npc(47, 25);
  expect(resolveAutopilotNpcContact(playerPose(50), false, hit)).not.toBeNull();
  expect(hit.crashAge).toBe(-1);
});
it("autopilot front-to-rear contact does not trigger the rear-bumper swerve", () => {
  const hit = npc(53, 20);
  expect(resolveAutopilotNpcContact(playerPose(50), true, hit)).not.toBeNull();
  expect(hit.crashAge).toBe(-1);
});
it("autopilot side contact does not trigger the rear-bumper swerve", () => {
  const hit = { ...npc(50, 20), impactOffset: 1.5 };
  expect(resolveAutopilotNpcContact(playerPose(50), true, hit)).not.toBeNull();
  expect(hit.crashAge).toBe(-1);
});
it("nearby non-touching cars and head-on contact do not trigger the rear-bumper swerve", () => {
  const distant = npc(43, 25);
  expect(resolveAutopilotNpcContact(playerPose(50), true, distant)).toBeNull();
  expect(distant.crashAge).toBe(-1);
  const oncoming = { ...npc(47, 25, -LANE), impactOffset: 2 * LANE };
  expect(resolveAutopilotNpcContact(playerPose(50), true, oncoming)).not.toBeNull();
  expect(oncoming.crashAge).toBe(-1);
});
it("repeated autopilot contact never resets an existing swerve", () => {
  const hit: CollisionNpc = npc(47, 25);
  const player = playerPose(50);
  resolveAutopilotNpcContact(player, true, hit);
  hit.crashAge = 0.2;
  const motion = hit.crashMotion;
  resolveAutopilotNpcContact(player, true, hit);
  expect(hit.crashAge).toBe(0.2);
  expect(hit.crashMotion).toBe(motion);
});
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
