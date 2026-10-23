import { RAM_AFTER, ramTarget, stepImpatience } from "./autodrive";

test("rams after being held up for 3 seconds", () => {
  let s = { impatience: 0, ramming: false };
  for (let t = 0; t < RAM_AFTER - 0.1; t += 0.1) s = stepImpatience(s.impatience, s.ramming, true, true, 0.1);
  expect(s.ramming).toBe(false);
  for (let i = 0; i < 3; i++) s = stepImpatience(s.impatience, s.ramming, true, true, 0.1);
  expect(s.ramming).toBe(true);
});
test("stops ramming once the car is passed", () => {
  expect(stepImpatience(0, true, true, false, 0.1).ramming).toBe(false);
});
test("only targets same-direction cars ahead in its lane", () => {
  expect(ramTarget(0, 2, [{ z: -10, lane: 2, same: true }])).not.toBeNull();
  expect(ramTarget(0, 2, [{ z: -10, lane: -2, same: false }])).toBeNull();
  expect(ramTarget(0, 2, [{ z: 10, lane: 2, same: true }])).toBeNull();
});
import { stepBump, BUMP_RUNUP } from "./autodrive";
test("backs off after a bump and charges again from a run-up", () => {
  expect(stepBump(false, 4)).toBe(true);
  expect(stepBump(true, 6)).toBe(true);
  expect(stepBump(true, BUMP_RUNUP)).toBe(false);
  expect(stepBump(false, 8)).toBe(false);
});
