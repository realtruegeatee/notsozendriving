import { expect, it } from "vitest";
import { cruisingDodge, RIGHT_PASS } from "./autodrive";
import { LANE } from "./road";

it("dodges a slower car early at 300 km/h without waiting behind it", () => {
  expect(cruisingDodge(0, 300 / 3.6, LANE, [{ z: -150, lane: LANE, speed: 20, same: true }])?.lane).toBe(RIGHT_PASS);
});

it("does not cross an alongside car to reach the shoulder", () => {
  const dodge = cruisingDodge(0, 55, LANE, [
    { z: -100, lane: LANE, speed: 15, same: true },
    { z: 0, lane: RIGHT_PASS, speed: 55, same: true },
  ]);
  expect(dodge?.lane).toBe(-LANE);
});

it("avoids a head-on overtaker early rather than holding its collision course", () => {
  expect(cruisingDodge(0, 55, LANE, [{ z: -160, lane: LANE, speed: 30, same: false }])?.lane).toBe(RIGHT_PASS);
});

it("leaves a clear road alone and does not dodge unrelated opposite-side traffic", () => {
  expect(cruisingDodge(0, 55, LANE, [])).toBeNull();
  expect(cruisingDodge(0, 55, LANE, [{ z: -100, lane: -LANE, speed: 30, same: false }])).toBeNull();
});

it("rejects a shoulder into which another car is already merging", () => {
  const dodge = cruisingDodge(0, 55, LANE, [
    { z: -100, lane: LANE, speed: 15, same: true },
    { z: -35, lane: 6, speed: 35, same: true, laneVelocity: -2, targetLane: RIGHT_PASS },
  ]);
  expect(dodge?.lane).toBe(-LANE);
});