// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { GameplayRecording } from "./recording";

const trackStop = vi.fn();
class MockRecorder {
  static isTypeSupported() { return true; }
  static latest: MockRecorder;
  state = "inactive";
  mimeType = "video/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { MockRecorder.latest = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["gameplay"], { type: this.mimeType }) }); this.onstop?.(); }
}
function startClip() {
  vi.stubGlobal("MediaRecorder", MockRecorder);
  const recording = new GameplayRecording(vi.fn());
  recording.start({ captureStream: () => ({ getTracks: () => [{ stop: trackStop }] }) } as unknown as HTMLCanvasElement);
  return recording;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); trackStop.mockClear(); });
it("keeps clips only in memory without writing storage or uploading", () => {
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const recording = startClip(); recording.stop();
  expect(recording.status).toBe("ready"); expect(recording.clip?.size).toBe(8);
  expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(trackStop).toHaveBeenCalledTimes(1);
});
it("download removes the clip and allows a fresh recording", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const recording = startClip(); recording.stop(); await recording.download();
  expect(click).toHaveBeenCalledTimes(1);
  expect(recording.clip).toBeNull(); expect(recording.status).toBe("idle");
});
it("discarding an active recording releases its capture and all clip data", () => {
  const recording = startClip(); recording.discard();
  expect(recording.status).toBe("idle"); expect(recording.clip).toBeNull();
  expect(MockRecorder.latest.ondataavailable).toBeNull(); expect(trackStop).toHaveBeenCalledTimes(1);
});