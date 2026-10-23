import { afterEach, expect, it, vi } from "vitest";
import { flashLights, horn, trafficSignalRevision } from "./signals";
import { game, net } from "./store";

afterEach(() => { vi.restoreAllMocks(); game.started = false; game.paused = false; game.flashUntil = 0; net.signal = null; });

it("flashes headlights for a bounded burst and shares it with friends", () => {
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const send = vi.fn(); net.signal = send; game.started = true;
  const before = trafficSignalRevision();
  flashLights();
  expect(game.flashUntil).toBe(1650);
  expect(send).toHaveBeenCalledWith("flash");
  flashLights();
  expect(send).toHaveBeenCalledTimes(1);
  expect(trafficSignalRevision()).toBe(before + 1);
});

it("paused drivers cannot flash lights or sound the horn", () => {
  const send = vi.fn(); net.signal = send; game.started = true; game.paused = true;
  const before = trafficSignalRevision();
  flashLights(); horn();
  expect(game.flashUntil).toBe(0);
  expect(send).not.toHaveBeenCalled();
  expect(trafficSignalRevision()).toBe(before);
});