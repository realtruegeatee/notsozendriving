// One transient clip: no network, storage, or recording history.
export type RecordingStatus = "idle" | "recording" | "stopping" | "ready";
export class GameplayRecording {
  status: RecordingStatus = "idle";
  clip: Blob | null = null;
  private chunks: Blob[] = [];
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private bytes = 0;
  constructor(private changed: () => void) {}

  start(canvas: HTMLCanvasElement) {
    if (this.status !== "idle") return;
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") throw new Error("Recording isn't supported in this browser.");
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/mp4", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    this.stream = canvas.captureStream(30);
    try {
      const recorder = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 4_000_000 });
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        this.chunks.push(event.data); this.bytes += event.data.size;
        // Bound temporary memory on phones; finalize instead of losing the clip.
        if (this.bytes >= 64 * 1024 * 1024) this.stop();
      };
      recorder.onstop = () => {
        this.clip = new Blob(this.chunks, { type: recorder.mimeType || mimeType || "video/webm" });
        this.chunks = []; this.bytes = 0;
        this.release();
        this.status = this.clip.size ? "ready" : "idle";
        if (!this.clip.size) this.clip = null;
        this.changed();
      };
      recorder.onerror = () => this.stop();
      recorder.start(1000); this.status = "recording"; this.changed();
    } catch (error) { this.release(); throw error; }
  }
  stop() {
    if (this.status !== "recording") return;
    this.status = "stopping"; this.changed();
    this.recorder?.stop();
  }
  async download() {
    const blob = this.clip;
    if (this.status !== "ready" || !blob) return;
    const filename = `zen-drive-${new Date().toISOString().replace(/[:.]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    const file = new File([blob], filename, { type: blob.type });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Zen Drive" }); }
      catch (error) { if ((error as DOMException).name === "AbortError") return; throw error; }
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
    }
    this.discard();
  }
  discard() {
    if (this.recorder) {
      this.recorder.ondataavailable = null; this.recorder.onstop = null; this.recorder.onerror = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
    }
    this.release(); this.chunks = []; this.clip = null; this.bytes = 0; this.status = "idle"; this.changed();
  }
  private release() { this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; this.recorder = null; }
}