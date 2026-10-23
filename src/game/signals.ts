import { game, net } from "./store";

let context: AudioContext | null = null;
let lastHorn = -Infinity;
export function initSignals() {
  // iOS: play through the ringer/silent switch like a media app.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) try { session.type = "playback"; } catch { /* unsupported */ }
  if (!context) {
    context = new AudioContext();
    // A silent buffer played inside a gesture unlocks Safari's audio.
    const src = context.createBufferSource(); src.buffer = context.createBuffer(1, 1, 22050);
    src.connect(context.destination); src.start(0);
  }
  if (context.state !== "running") void context.resume();
}
// Unlock audio on any touch, so autopilot honks work even before the horn button is pressed.
if (typeof window !== "undefined") for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, initSignals, { passive: true });
export function playHorn(volume = 1) {
  if (!context) return;
  if (context.state !== "running") void context.resume();
  const ctx = context, t = ctx.currentTime;
  for (const frequency of [350, 440]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.14 * volume, t + 0.025);
    gain.gain.setValueAtTime(0.14 * volume, t + 0.3); gain.gain.linearRampToValueAtTime(0, t + 0.4);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.42);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
export function horn() {
  if (!game.started || game.paused || performance.now() - lastHorn < 700) return;
  lastHorn = performance.now(); initSignals(); playHorn(); net.signal?.("horn");
}
export function flashLights() {
  if (!game.started || game.paused || performance.now() < game.flashUntil) return;
  game.flashUntil = performance.now() + 650; net.signal?.("flash");
}