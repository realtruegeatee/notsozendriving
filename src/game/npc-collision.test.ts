import { expect, it } from "vitest";
import { carContact } from "./multiplayer-math";
import { npcOffset, resolveNpcCollision } from "./npc-collision";
import { LANE, groundY, roadX, roadXd } from "./road";

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