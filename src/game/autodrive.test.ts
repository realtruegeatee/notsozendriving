import { expect, it } from "vitest";
import { planAutodrive, RIGHT_PASS, RIGHT_PASS_WAIT } from "./autodrive";
import { LANE } from "./road";

it("aggressive autodrive overtakes slow traffic in a clear opposite lane", () => {
  const result = planAutodrive(0, 25, false, [{ z: -35, lane: LANE, speed: 15, same: true }]);
  expect(result.lane).toBe(-LANE);
  expect(result.targetSpeed).toBe(30);
});
it("autodrive passes on the right after losing patience instead of into oncoming traffic", () => {
  const result = planAutodrive(0, 25, false, [{ z: -15, lane: LANE, speed: 15, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }], RIGHT_PASS_WAIT);
  expect(result.lane).toBeGreaterThan(LANE);
  expect(result.lane).toBe(RIGHT_PASS);
  expect(result.passing).toBe("right");
  expect(result.targetSpeed).toBe(30);
});
it("waits behind slower traffic before attempting a right pass", () => {
  const cars = [{ z: -15, lane: LANE, speed: 15, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }];
  let blockedFor = 0;
  for (let frame = 0; frame < 59; frame++) {
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