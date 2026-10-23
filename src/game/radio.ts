// Car radio: built-in generative stations (offline, Web Audio) + live internet streams.
export type Station = { id: string; name: string; kind: "built-in" | "live"; url?: string; tag: string };

export const STATIONS: Station[] = [
  { id: "haze", name: "Lofi Haze", kind: "built-in", tag: "Mellow chords & soft beat" },
  { id: "drift", name: "Ambient Drift", kind: "built-in", tag: "Slow floating pads" },
  { id: "pulse", name: "Night Pulse", kind: "built-in", tag: "Gentle arpeggios" },
  { id: "soma-groove", name: "Groove Salad", kind: "live", url: "https://ice1.somafm.com/groovesalad-128-mp3", tag: "Live · downtempo" },
  { id: "soma-drone", name: "Drone Zone", kind: "live", url: "https://ice1.somafm.com/dronezone-128-mp3", tag: "Live · ambient" },
  { id: "soma-lush", name: "Lush", kind: "live", url: "https://ice1.somafm.com/lush-128-mp3", tag: "Live · dreamy vocals" },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const PROGS: Record<string, number[][]> = {
  haze: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
  drift: [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]],
  pulse: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]],
};

class Radio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  audio: HTMLAudioElement | null = null;
  timer = 0;
  current: Station | null = null;
  volume = 0.7;
  listeners = new Set<() => void>();
  status: "off" | "playing" | "loading" | "error" = "off";

  private emit() { this.listeners.forEach((l) => l()); }
  private setStatus(s: Radio["status"]) { this.status = s; this.emit(); }

  play(st: Station) {
    this.stop(false);
    this.current = st;
    if (st.kind === "live") {
      if (!navigator.onLine) return this.setStatus("error");
      const a = new Audio(st.url);
      a.crossOrigin = "anonymous";
      a.volume = this.volume;
      a.onplaying = () => this.setStatus("playing");
      a.onerror = () => this.setStatus("error");
      this.audio = a;
      this.setStatus("loading");
      a.play().catch(() => this.setStatus("error"));
    } else {
      this.startGen(st.id);
      this.setStatus("playing");
    }
  }

  stop(emit = true) {
    clearInterval(this.timer);
    if (this.audio) { this.audio.pause(); this.audio.src = ""; this.audio = null; }
    if (this.master) { const m = this.master; m.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.1); setTimeout(() => m.disconnect(), 600); this.master = null; }
    if (emit) { this.current = null; this.setStatus("off"); }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.audio) this.audio.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.05);
    this.emit();
  }

  private startGen(id: string) {
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.setTargetAtTime(this.volume * 0.5, ctx.currentTime, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = id === "pulse" ? 2400 : 1500;
    lp.connect(master); master.connect(ctx.destination);
    this.master = master;
    const prog = PROGS[id]!;
    const beat = id === "haze" ? 0.75 : id === "pulse" ? 0.5 : 2;
    let step = 0;
    let next = ctx.currentTime + 0.1;

    const tone = (f: number, t: number, dur: number, g: number, type: OscillatorType = "triangle") => {
      const o = ctx.createOscillator(); const e = ctx.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + Math.min(0.4, dur * 0.3));
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (t: number, dur: number, g: number, hp: number) => {
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
      const e = ctx.createGain(); e.gain.value = g;
      s.connect(f); f.connect(e); e.connect(master); s.start(t);
    };
    const kick = (t: number) => {
      const o = ctx.createOscillator(); const e = ctx.createGain();
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      e.gain.setValueAtTime(0.5, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(e); e.connect(master); o.start(t); o.stop(t + 0.4);
    };

    const schedule = () => {
      while (next < ctx.currentTime + 0.6) {
        const t = next;
        const chord = prog[Math.floor(step / (id === "drift" ? 2 : 8)) % prog.length]!;
        if (id === "haze") {
          if (step % 8 === 0) chord.forEach((n) => tone(midi(n), t, beat * 8, 0.07));
          if (step % 4 === 0) kick(t);
          if (step % 4 === 2) noise(t, 0.18, 0.12, 1800);
          if (step % 2 === 1) noise(t, 0.05, 0.05, 6000);
          if (Math.random() < 0.3) tone(midi(chord[Math.floor(Math.random() * 4)]! + 12), t, beat * 2, 0.04, "sine");
        } else if (id === "drift") {
          if (step % 2 === 0) chord.forEach((n) => tone(midi(n), t, beat * 5, 0.06, "sine"));
          if (Math.random() < 0.5) tone(midi(chord[Math.floor(Math.random() * 4)]! + 24), t + Math.random(), 3, 0.025, "sine");
        } else {
          if (step % 8 === 0) tone(midi(chord[0]! - 12), t, beat * 8, 0.12, "sine");
          tone(midi(chord[step % 4]! + 12), t, beat * 1.6, 0.05, "square");
          if (step % 4 === 0) kick(t);
        }
        step++; next += beat;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 200);
  }
}

export const radio = new Radio();
