import { expect, it } from "vitest";
import { planAutodrive } from "./autodrive";
import { LANE } from "./road";

it("aggressive autodrive overtakes slow traffic in a clear opposite lane", () => {
  const result = planAutodrive(0, 25, false, [{ z: -35, lane: LANE, speed: 15, same: true }]);
  expect(result.lane).toBe(-LANE);
  expect(result.targetSpeed).toBe(30);
});
it("autodrive refuses to overtake into oncoming traffic", () => {
  const result = planAutodrive(0, 25, false, [{ z: -15, lane: LANE, speed: 15, same: true }, { z: -60, lane: -LANE, speed: 20, same: false }]);
  expect(result.lane).toBe(LANE);
  expect(result.targetSpeed).toBeLessThan(20);
});
it("autodrive returns to its lane after passing", () => {
  expect(planAutodrive(-60, 28, true, [{ z: -40, lane: LANE, speed: 15, same: true }]).lane).toBe(LANE);
});