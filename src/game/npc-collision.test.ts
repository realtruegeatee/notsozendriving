import { expect, it } from "vitest";
import { carContact } from "./multiplayer-math";
import { npcCrash, npcOffset, resolveNpcCollision, resolveAutopilotNpcContact, crashVisible, shovedNpcSpeed, STUN_FOR } from "./npc-collision";
import type { CollisionNpc } from "./npc-collision";
import { LANE, groundY, roadX, roadXd } from "./road";
import { createCrashMotion, stepCrashMotion } from "./crash-physics";
import { planNpcDriving, stepNpcLane } from "./npc-driving";

const npc = (s: number, v: number, lane = LANE) => ({ s, v, lane, crashAge: -1, impactOffset: 0, contactLeft: 0 });
const playerPose = (s: number, lane = LANE) => ({ x: roadX(-s) + lane, y: groundY(-s, lane), z: -s, yaw: Math.atan(roadXd(-s)) });
it("autopilot rear bumper touching an NPC front bumper starts a smooth roadside swerve", () => {
  for (const offset of [LANE, -LANE]) {
    const hit: CollisionNpc = { ...npc(47, 25), passOffset: offset - LANE };
    const origin = npcOffset(hit);
    expect(resolveAutopilotNpcContact(playerPose(50, offset), true, hit)).not.toBeNull();
    expect(hit.crashAge).toBe(0);
    expect(hit.crashMotion?.offset).toBe(origin);
    // An impulsive sideways kick toward the nearer roadside, then free physics.
    expect((hit.crashMotion?.lateral ?? 0) * Math.sign(offset)).toBeGreaterThan(0);
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
it("nearby non-touching cars and slow head-on contact do not trigger the rear-bumper swerve", () => {
  const distant = npc(43, 25);
  expect(resolveAutopilotNpcContact(playerPose(50), true, distant)).toBeNull();
  expect(distant.crashAge).toBe(-1);
  const oncoming = { ...npc(47, 25, -LANE), impactOffset: 2 * LANE };
  expect(resolveAutopilotNpcContact(playerPose(50), true, oncoming)).not.toBeNull();
  expect(oncoming.crashAge).toBe(-1);
});
it("a hard player hit launches the NPC comically instead of just slowing it", () => {
  const hit: CollisionNpc = npc(52, 10);
  expect(resolveAutopilotNpcContact(playerPose(50), false, hit, 0, 30)).not.toBeNull();
  expect(hit.crashAge).toBe(0);
  expect(hit.shove).toBeGreaterThan(0);
  expect(hit.crashMotion?.vertical).toBeGreaterThan(2);
  expect(Math.abs(hit.crashMotion?.spin ?? 0)).toBeGreaterThan(1);
  expect(Math.abs(hit.crashMotion?.rollVelocity ?? 0)).toBeGreaterThan(1);
});
it("autopilot side-swiping a faster passing car still launches it", () => {
  // The passer is faster than the player, so along-road closing speed is zero;
  // the side impact alone must be enough to send it flying.
  const hit: CollisionNpc = { ...npc(50, 35), impactOffset: 1.5, passing: true };
  expect(resolveAutopilotNpcContact(playerPose(50), true, hit, 0, 30)).not.toBeNull();
  expect(hit.crashAge).toBe(0);
  expect(hit.shove).toBeGreaterThan(0);
  expect(hit.passing).toBe(false);
  expect(hit.crashMotion?.vertical).toBeGreaterThan(2);
});
it("a gentle player touch does not launch the NPC", () => {
  const hit = npc(52, 20);
  expect(resolveAutopilotNpcContact(playerPose(50), false, hit, 0, 24)).not.toBeNull();
  expect(hit.crashAge).toBe(-1);
});
it("a fast head-on player hit launches the oncoming car", () => {
  const hit: CollisionNpc = { ...npc(47, 25, -LANE), impactOffset: 2 * LANE };
  expect(resolveAutopilotNpcContact(playerPose(50), false, hit, 0, 30)).not.toBeNull();
  expect(hit.crashAge).toBe(0);
  expect(hit.shove).toBeGreaterThan(0);
});
it("autopilot front-to-rear stun still wins over the launch", () => {
  const hit: CollisionNpc = npc(53, 20);
  expect(resolveAutopilotNpcContact(playerPose(50), true, hit, 0, 40)).not.toBeNull();
  expect(hit.crashAge).toBe(-1);
  expect(hit.stunLeft).toBe(STUN_FOR);
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
it("NPC rear-end collisions separate both cars and leave one recovering driver", () => {
  const a = npc(30, 25), b = npc(32, 5);
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.v).toBeLessThan(25); expect(b.v).toBeLessThan(5);
  expect(a.crashAge).toBe(-1); expect(b.crashAge).toBe(0);
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
  expect(a.v).toBeLessThan(20); expect(b.v).toBeLessThan(20);
  expect([a, b].filter(c => c.crashAge >= 0)).toHaveLength(1);
});
it("a forceful NPC collision pushes the slower car off the road without a horn reaction", () => {
  for (const lane of [LANE, -LANE]) {
    const direction = Math.sign(lane);
    const faster: CollisionNpc = npc(30, 25, lane), slower: CollisionNpc = npc(30 + direction * 2, 10, lane);
    expect(resolveNpcCollision(faster, slower)).toBe(true);
    expect(slower.crashAge).toBe(0);
    expect(faster.crashAge).toBe(-1);
    if (!slower.crashMotion) throw new Error("Missing impact motion");
    for (let i = 0; i < 120; i++) stepCrashMotion(slower.crashMotion, 1 / 60);
    expect(Math.abs(npcOffset(slower))).toBeGreaterThan(5.5);
  }
});
it("even gentle NPC collisions leave exactly one wreck and one recovering car", () => {
  const a = npc(30, 15), b = npc(32, 12);
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.crashAge).toBe(-1);
  expect(b.crashAge).toBe(0);
});
it("a shove gives immediate sideways momentum and body roll without teleporting", () => {
  const faster: CollisionNpc = npc(30, 25), slower: CollisionNpc = npc(32, 10);
  resolveNpcCollision(faster, slower);
  const origin = npcOffset(slower);
  expect(slower.shove).toBeCloseTo(15 / 18);
  slower.crashMotion = createCrashMotion(origin, slower.crashSpeed ?? slower.v, 1, slower.shove);
  stepCrashMotion(slower.crashMotion, 0.2);
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
it("head-on NPC crashes wreck the overtaker while the other recovers and continues", () => {
  const a: CollisionNpc = { s: 50, lane: LANE, v: 15, crashAge: -1, impactOffset: 0, contactLeft: 0, passOffset: -2 * LANE };
  const b: CollisionNpc = { s: 51, lane: -LANE, v: 15, crashAge: -1, impactOffset: 0, contactLeft: 0 };
  expect(resolveNpcCollision(a, b)).toBe(true);
  expect(a.crashAge).toBe(0); expect(b.crashAge).toBe(-1);
  expect(b.recoveryLeft).toBe(1.2);
  expect(b.v).toBeGreaterThan(0);
  if (!a.crashMotion) throw new Error("Missing impact motion");
  for (let i = 0; i < 600; i++) stepCrashMotion(a.crashMotion, 1 / 60);
  expect(a.crashMotion.speed).toBeLessThan(0.1);
});
it("contact with a wreck keeps the second driver recoverable", () => {
  const wreck: CollisionNpc = { ...npc(30, 0), crashAge: 0 };
  wreck.crashMotion = createCrashMotion(LANE, 0, 1);
  const driver: CollisionNpc = npc(32, 15);
  expect(resolveNpcCollision(wreck, driver)).toBe(true);
  expect(driver.crashAge).toBe(-1);
  expect(driver.recoveryLeft).toBe(1.2);
  expect(driver.v).toBeGreaterThan(0);
});
it("the surviving NPC smoothly regains speed and continues in its original direction", () => {
  const victim: CollisionNpc = { ...npc(50, 15), passOffset: -2 * LANE };
  const survivor: CollisionNpc = npc(51, 20, -LANE);
  resolveNpcCollision(victim, survivor);
  const start = survivor.s;
  const driver = { ...survivor, base: 20, passOffset: survivor.passOffset ?? 0, passing: false, laneVelocity: 0 };
  for (let i = 0; i < 300; i++) {
    const plan = planNpcDriving(driver, [driver], driver.base);
    const step = stepNpcLane(driver.passOffset, driver.laneVelocity, plan.passOffset, driver.v, 1 / 60);
    driver.passOffset = step.offset; driver.laneVelocity = step.velocity;
    driver.v += (plan.speed - driver.v) * (1 - Math.exp(-2 / 60));
    driver.s += Math.sign(driver.lane) * driver.v / 60;
  }
  expect(driver.crashAge).toBe(-1);
  expect(driver.s).toBeLessThan(start - 60);
  expect(driver.v).toBeGreaterThan(19);
});

it("autopilot front hitting a car's rear stops it for 3 seconds and shoves it aside", () => {
  const hit: CollisionNpc = npc(53, 20);
  resolveAutopilotNpcContact({ ...playerPose(50), x: playerPose(50).x - 0.4 }, true, hit);
  expect(hit.stunLeft).toBe(3);
  expect(STUN_FOR).toBe(3);
  expect(hit.v).toBe(0);
  expect(Math.abs(hit.impactOffset)).toBeGreaterThan(0);
  expect(hit.crashAge).toBe(-1);
});
it("manual driving does not stall a car hit from behind", () => {
  const hit: CollisionNpc = npc(53, 20);
  resolveAutopilotNpcContact(playerPose(50), false, hit);
  expect(hit.stunLeft).toBeUndefined();
});
it("crashes only start within the player's visible band", () => {
  const car = npc(100, 20);
  expect(crashVisible(50, car)).toBe(true);   // 50 m ahead
  expect(crashVisible(50, npc(40, 20))).toBe(true);  // just behind
  expect(crashVisible(50, npc(20, 20))).toBe(false); // too far behind
  // The band is tight: wrecks start close enough to watch clearly.
  expect(crashVisible(50, npc(189, 20))).toBe(true);  // 139 m ahead, still in
  expect(crashVisible(50, npc(191, 20))).toBe(false); // 141 m ahead, out
  expect(crashVisible(50, npc(400, 20))).toBe(false); // far ahead
  expect(car.crashAge).toBe(-1);
});
it("NPC collisions out of sight separate and slow but never wreck", () => {
  const a: CollisionNpc = npc(400, 25), b: CollisionNpc = npc(402, 5);
  expect(resolveNpcCollision(a, b, crashVisible(50, a) || crashVisible(50, b))).toBe(true);
  expect(a.crashAge).toBe(-1);
  expect(b.crashAge).toBe(-1);
  expect(b.v).toBeGreaterThan(0);
});
it("NPC collisions in sight still wreck one car", () => {
  const a: CollisionNpc = npc(100, 25), b: CollisionNpc = npc(102, 5);
  expect(resolveNpcCollision(a, b, crashVisible(50, a) || crashVisible(50, b))).toBe(true);
  expect(a.crashAge >= 0 || b.crashAge >= 0).toBe(true);
});
it("a shoved car stays slower than the pusher so the autopilot keeps dodging it", () => {
  // Autopilot at 55 m/s rear-ends a car cruising at 20 m/s; its base is 20.
  const pushed = shovedNpcSpeed(20, (55 - 20) * 0.6, 20, false);
  expect(pushed).toBe(20);
  // Repeated contact frames never lift it above its base, so the closing
  // speed stays positive and the dodge planner still sees a threat.
  expect(shovedNpcSpeed(pushed, (55 - pushed) * 0.6, 20, false)).toBe(20);
});
it("a shoved wreck only creeps instead of being launched to the pusher's speed", () => {
  expect(shovedNpcSpeed(0, 33, 20, true)).toBe(4);
  expect(shovedNpcSpeed(4, 30, 20, true)).toBe(4);
});
it("a slow car may be pushed up to but not past its cruising speed", () => {
  expect(shovedNpcSpeed(5, 6, 20, false)).toBe(11);
});
