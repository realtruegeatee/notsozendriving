import { describe, expect, it } from "vitest";
import { carContact, hasNpcTraffic, interpolatePose, teleportPose } from "./multiplayer-math";
import { LANE, roadX, roadY } from "./road";

describe("Friend driving", () => {
  it("empties friend roads while retaining solo and open-road traffic", () => {
    expect(hasNpcTraffic("FRIEND")).toBe(false);
    expect(hasNpcTraffic(null)).toBe(true);
    expect(hasNpcTraffic("PUBLIC")).toBe(true);
  });
  it("teleports behind the friend on the road without overlapping other cars", () => {
    const friend = { x: roadX(-500) + LANE, y: roadY(-500), z: -500, yaw: 0 };
    const pose = teleportPose(friend, [friend]);
    expect(pose?.z).toBe(-491);
    expect(pose?.x).toBe(roadX(-491) + LANE);
    expect(pose && carContact(pose, friend)).toBeNull();
    const blocked = teleportPose(friend, pose ? [friend, pose] : [friend]);
    expect(blocked?.z).toBe(-482);
  });
  it("colliding cars separate, but non-contact cars are unaffected", () => {
    const a = { x: 0, y: 0, z: 0, yaw: 0 };
    const b = { ...a, z: -3 };
    const push = carContact(a, b);
    expect(push?.z).toBeCloseTo(1.22);
    expect(carContact({ ...a, z: a.z + (push?.z ?? 0) }, b)).toBeNull();
    expect(carContact(a, { ...b, x: 3 })).toBeNull();
    expect(carContact(a, { ...b, y: 3 })).toBeNull();
  });
  it("smoothly interpolates received motion and snaps a teleport", () => {
    const a = { x: 0, y: 0, z: 0, yaw: 0, at: 100, warp: 0 };
    const b = { ...a, z: -4, at: 300 };
    expect(interpolatePose(a, b, 200).z).toBe(-2);
    expect(interpolatePose(a, { ...b, warp: 1, z: -500 }, 200).z).toBe(-500);
  });
});