import { game, net } from "./store";

let context: AudioContext | null = null;
let lastHorn = -Infinity;
export function initSignals() {
  context ??= new AudioContext();
  void context.resume();
}
export function playHorn(volume = 1) {
  if (!context) return;
  const ctx = context, t = ctx.currentTime;
  for (const frequency of [350, 440]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.035 * volume, t + 0.025);
    gain.gain.setValueAtTime(0.035 * volume, t + 0.3); gain.gain.linearRampToValueAtTime(0, t + 0.4);
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