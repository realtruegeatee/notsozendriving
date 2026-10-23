import { expect, it } from "vitest";
import { planAutodrive, RIGHT_PASS, RIGHT_PASS_WAIT } from "./autodrive";
import { LANE } from "./road";
import { maxSpeedForDistance, powerCurve } from "./speed";
import { FEEL } from "./store";
import type { Passing } from "./autodrive";

it("aggressive autodrive overtakes slow traffic in a clear opposite lane", () => {
  const result = planAutodrive(0, 25, false, [{ z: -35, lane: LANE, speed: 15, same: true }]);
  expect(result.lane).toBe(-LANE);
  expect(result.targetSpeed).toBe(34);
});
it("autodrive passes on the right after losing patience instead of into oncoming traffic", () => {
  const result = planAutodrive(0, 25, false, [{ z: -15, lane: LANE, speed: 15, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }], RIGHT_PASS_WAIT);
  expect(result.lane).toBeGreaterThan(LANE);
  expect(result.lane).toBe(RIGHT_PASS);
  expect(result.passing).toBe("right");
  expect(result.targetSpeed).toBe(34);
});
it("waits behind slower traffic before attempting a right pass", () => {
  const cars = [{ z: -15, lane: LANE, speed: 15, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }];
  let blockedFor = 0;
  for (let frame = 0; frame < 29; frame++) {
    const result = planAutodrive(0, 25, false, cars, blockedFor, 0.05);
    expect(result.passing).toBe(false);
    expect(result.lane).toBe(LANE);
    expect(result.targetSpeed).toBeLessThan(25);
    blockedFor = result.blockedFor;
  }
  expect(planAutodrive(0, 25, false, cars, blockedFor, 0.1).passing).toBe("right");
});
it("resets patience when traffic clears and does not count distant traffic", () => {
  expect(planAutodrive(0, 25, false, [], 2.9, 0.05).blockedFor).toBe(0);
  expect(planAutodrive(0, 25, false, [{ z: -55, lane: LANE, speed: 15, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }], 2.9, 0.05).blockedFor).toBe(0);
});
it("never forces a right pass into occupied space after waiting", () => {
  const result = planAutodrive(0, 25, false, [
    { z: -15, lane: LANE, speed: 15, same: true },
    { z: -60, lane: -LANE, speed: 20, same: false },
    { z: -25, lane: RIGHT_PASS, speed: 0, same: true },
  ], RIGHT_PASS_WAIT, 0.05);
  expect(result.passing).toBe(false);
  expect(result.targetSpeed).toBeLessThan(25);
});
it("autodrive returns to its lane after passing", () => {
  expect(planAutodrive(-60, 28, true, [{ z: -40, lane: LANE, speed: 15, same: true }]).lane).toBe(LANE);
});
it("keeps a right pass until the blocker has been cleared even if the left opens", () => {
  expect(planAutodrive(-20, 28, "right", [{ z: -35, lane: LANE, speed: 15, same: true }]).passing).toBe("right");
});
it("returns to the normal lane after a right pass", () => {
  const result = planAutodrive(-60, 28, "right", [{ z: -40, lane: LANE, speed: 15, same: true }]);
  expect(result.lane).toBe(LANE);
  expect(result.passing).toBe(false);
});
it("slows down when both passing routes are occupied including a right-side wreck", () => {
  const result = planAutodrive(0, 25, false, [
    { z: -15, lane: LANE, speed: 15, same: true },
    { z: -60, lane: -LANE, speed: 20, same: false },
    { z: -25, lane: RIGHT_PASS, speed: 0, same: true },
  ]);
  expect(result.lane).toBe(LANE);
  expect(result.passing).toBe(false);
  expect(result.targetSpeed).toBeLessThan(20);
});
it("returns immediately after clearing the overtaken car even with distant traffic ahead", () => {
  const result = planAutodrive(-22, 28, "right", [
    { z: -15, lane: LANE, speed: 15, same: true },
    { z: -75, lane: LANE, speed: 15, same: true },
  ]);
  expect(result.lane).toBe(LANE);
  expect(result.passing).toBe(false);
});
it("does not cut back into a car alongside or a fast car approaching from behind", () => {
  for (const car of [
    { z: 3, lane: LANE, speed: 15, same: true },
    { z: 12, lane: LANE, speed: 40, same: true },
  ]) {
    expect(planAutodrive(0, 25, "right", [car]).passing).toBe("right");
  }
});
it("stays right and stops short of a close wreck rather than bumping it or merging into an adjacent car", () => {
  const result = planAutodrive(0, 25, "right", [
    { z: 0, lane: LANE, speed: 15, same: true },
    { z: -7, lane: RIGHT_PASS, speed: 0, same: true },
  ]);
  expect(result.lane).toBe(RIGHT_PASS);
  expect(result.targetSpeed).toBe(0);
});
it("checks approaching oncoming cars before choosing the left passing lane", () => {
  const result = planAutodrive(0, 40, false, [
    { z: -25, lane: LANE, speed: 15, same: true },
    { z: -110, lane: -LANE, speed: 30, same: false },
  ]);
  expect(result.lane).toBe(LANE);
  expect(result.targetSpeed).toBeLessThan(40);
});
it("autopilot squeezes into a gap 40 m behind a car in the passing lane", () => {
  const result = planAutodrive(0, 25, false, [
    { z: -15, lane: LANE, speed: 15, same: true },
    { z: -40, lane: -LANE, speed: 22, same: true },
  ]);
  expect(result.passing).toBe(true);
});
it("still creeps toward a stopped car with room so it never gets stuck far behind", () => {
  expect(planAutodrive(0, 10, false, [{ z: -20, lane: LANE, speed: 0, same: true }, { z: -30, lane: -LANE, speed: 20, same: false }, { z: -22, lane: RIGHT_PASS, speed: 0, same: true }]).targetSpeed).toBeGreaterThanOrEqual(3);
});
it("brakes early enough for a stopped car ahead at high speed", () => {
  const r = planAutodrive(0, 34, false, [{ z: -30, lane: LANE, speed: 0, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }, { z: -32, lane: RIGHT_PASS, speed: 0, same: true }]);
  expect(r.targetSpeed).toBeLessThanOrEqual(Math.sqrt(2 * 7 * 23) + 0.01);
});
it("stops rather than creeping into an oncoming car in its path", () => {
  expect(planAutodrive(0, 10, false, [{ z: -15, lane: LANE, speed: 20, same: false }]).targetSpeed).toBe(0);
});
it("aims for the unlocked 200 km/h ceiling once the road allows it", () => {
  const v200 = maxSpeedForDistance(5000);
  expect(planAutodrive(0, 40, false, [], 0, 0, LANE, v200).targetSpeed).toBeCloseTo(v200, 6);
});
it("still brakes early for a stopped car when aiming for 200 km/h", () => {
  const r = planAutodrive(0, 55, false, [
    { z: -30, lane: LANE, speed: 0, same: true },
    { z: -60, lane: -LANE, speed: 20, same: false },
    { z: -32, lane: RIGHT_PASS, speed: 0, same: true },
  ], 0, 0, LANE, maxSpeedForDistance(5000));
  expect(r.targetSpeed).toBeLessThanOrEqual(Math.sqrt(2 * 7 * 23) + 0.01);
});
it("holds the unlocked 200 km/h ceiling without rear-ending slower traffic", () => {
  const dt = 1 / 60;
  const maxV = maxSpeedForDistance(5000);
  const traffic = [
    { z: -340, lane: LANE, speed: 19, same: true },
    { z: -700, lane: LANE, speed: 17, same: true },
    { z: -1000, lane: LANE, speed: 21, same: true },
    { z: -1400, lane: LANE, speed: 18, same: true },
    { z: -620, lane: -LANE, speed: 20, same: false },
    { z: -1150, lane: -LANE, speed: 22, same: false },
    { z: -1600, lane: -LANE, speed: 19, same: false },
  ];
  let z = 0, speed = 20, distance = 5000, blockedFor = 0;
  let passing: Passing = false;
  let closest = Infinity;
  for (let i = 0; i < 60 * 45; i++) {
    const lane = passing === "right" ? RIGHT_PASS : passing ? -LANE : LANE;
    const plan = planAutodrive(z, speed, passing, traffic, blockedFor, dt, lane, maxV);
    passing = plan.passing; blockedFor = plan.blockedFor;
    const thr = Math.max(0, Math.min(1, (plan.targetSpeed - speed) * 0.45));
    const brk = Math.max(0, Math.min(1, (speed - plan.targetSpeed) * 0.5));
    speed += FEEL.ACCEL * thr * powerCurve(speed, maxV) * dt;
    speed -= FEEL.BRAKE * brk * dt;
    speed *= Math.exp(-FEEL.DRAG * dt);
    speed = Math.max(0, Math.min(maxV, speed));
    z -= speed * dt; distance += speed * dt;
    for (const c of traffic) c.z += (c.same ? -1 : 1) * c.speed * dt;
    for (const c of traffic) {
      if (!c.same || Math.abs(c.lane - plan.lane) > 2) continue;
      const gap = z - c.z;
      if (gap > 0 && gap < 60) closest = Math.min(closest, gap);
    }
  }
  expect(distance).toBeGreaterThan(5000);
  expect(speed * 3.6).toBeGreaterThanOrEqual(190);
  expect(closest).toBeGreaterThan(5);
});
