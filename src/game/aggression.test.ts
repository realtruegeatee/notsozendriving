import { expect, it } from "vitest";
import { aggressionProfile } from "./aggression";

it("only reckless autopilot rams", () => {
  expect(aggressionProfile("reckless").ramming).toBe(true);
  expect(aggressionProfile("normal").ramming).toBe(false);
  expect(aggressionProfile("calm").ramming).toBe(false);
});
it("calm autopilot never honks or flashes and drives slower", () => {
  expect(aggressionProfile("calm").signals).toBe(false);
  expect(aggressionProfile("calm").speedFactor).toBeLessThan(1);
});
