import { useEffect, useRef, useState } from "react";
import { Moon, Pause, Play, Sun, Gauge } from "lucide-react";
import { game, hudEls, input } from "./store";

export type Layout = "wheel-left" | "wheel-right" | "slider";
const LAYOUTS: { id: Layout; label: string; mini: React.ReactNode }[] = [
  { id: "wheel-left", label: "Wheel left", mini: <><i style={{ width: 12, height: 12, borderRadius: 99 }} /><span style={{ width: 8 }} /><i style={{ width: 4, height: 10 }} /><i style={{ width: 4, height: 14 }} /></> },
  { id: "wheel-right", label: "Wheel right", mini: <><i style={{ width: 4, height: 10 }} /><i style={{ width: 4, height: 14 }} /><span style={{ width: 8 }} /><i style={{ width: 12, height: 12, borderRadius: 99 }} /></> },
  { id: "slider", label: "Slider", mini: <><i style={{ width: 4, height: 10 }} /><i style={{ width: 18, height: 6 }} /><i style={{ width: 4, height: 14 }} /></> },
];

function Pedal({ label, onChange, className }: { label: string; onChange: (v: number) => void; className: string }) {
  return (
    <button
      aria-label={label}
      className={`zen-pedal ${className}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(1); }}
      onPointerUp={() => onChange(0)}
      onPointerCancel={() => onChange(0)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

const MAX_ROT = 110;
function Wheel() {
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef<SVGGElement>(null);
  const st = useRef({ start: 0, base: 0, rot: 0, raf: 0 });
  const angle = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const apply = (rot: number) => {
    st.current.rot = rot;
    input.steer = rot / MAX_ROT;
    if (g.current) g.current.style.transform = `rotate(${rot}deg)`;
  };
  const release = () => {
    const tick = () => {
      const r = st.current.rot * 0.8;
      apply(Math.abs(r) < 0.5 ? 0 : r);
      if (r !== 0 && Math.abs(r) >= 0.5) st.current.raf = requestAnimationFrame(tick);
    };
    tick();
  };
  return (
    <div
      ref={ref}
      className="zen-wheel zen-touch"
      onPointerDown={(e) => {
        cancelAnimationFrame(st.current.raf);
        e.currentTarget.setPointerCapture(e.pointerId);
        st.current.start = angle(e.clientX, e.clientY);
        st.current.base = st.current.rot;
      }}
      onPointerMove={(e) => {
        if (!e.buttons) return;
        let d = angle(e.clientX, e.clientY) - st.current.start;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        apply(Math.max(-MAX_ROT, Math.min(MAX_ROT, st.current.base + d)));
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <svg viewBox="0 0 100 100" aria-label="Steering wheel">
        <g ref={g} style={{ transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="43" fill="none" stroke="var(--ink)" strokeWidth="11" />
          <circle cx="50" cy="50" r="43" fill="none" stroke="var(--paper)" strokeWidth="5" />
          <path d="M9 52 L38 56 L50 70 L62 56 L91 52" fill="none" stroke="var(--ink)" strokeWidth="7" strokeLinejoin="round" />
          <circle cx="50" cy="54" r="11" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
          <rect x="47" y="4" width="6" height="9" fill="var(--brake)" />
        </g>
      </svg>
    </div>
  );
}

function SteerPad() {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const set = (clientX: number | null) => {
    const r = track.current!.getBoundingClientRect();
    const v = clientX === null ? 0 : Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / (r.width / 2 - 26)));
    input.steer = Math.sign(v) * Math.pow(Math.abs(v), 1.3);
    if (knob.current) knob.current.style.transform = `translateX(${v * (r.width / 2 - 26)}px)`;
  };
  return (
    <div
      ref={track}
      className="zen-steer zen-touch"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) set(e.clientX); }}
      onPointerUp={() => set(null)}
      onPointerCancel={() => set(null)}
    >
      <div className="zen-steer-line" />
      <div ref={knob} className="zen-steer-knob" />
    </div>
  );
}

function LayoutPicker({ layout, setLayout }: { layout: Layout; setLayout: (l: Layout) => void }) {
  return (
    <>
      <p className="zen-label">Controls</p>
      <div className="zen-seg">
        {LAYOUTS.map((l) => (
          <button key={l.id} data-on={layout === l.id} onClick={() => setLayout(l.id)}>
            <span className="zen-mini">{l.mini}</span>
            {l.label}
          </button>
        ))}
      </div>
    </>
  );
}

function TimePicker({ night, setNight }: { night: boolean; setNight: (n: boolean) => void }) {
  return (
    <>
      <p className="zen-label">Time of day</p>
      <div className="zen-seg">
        <button data-on={!night} onClick={() => setNight(false)}><Sun size={16} />Day</button>
        <button data-on={night} onClick={() => setNight(true)}><Moon size={16} />Night</button>
      </div>
    </>
  );
}

export function HUD({ night, setNight }: { night: boolean; setNight: (n: boolean) => void }) {
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cruise, setCruise] = useState(true);
  const [layout, setLayoutState] = useState<Layout>("wheel-left");

  useEffect(() => {
    const saved = localStorage.getItem("zen-layout") as Layout | null;
    if (saved && LAYOUTS.some((l) => l.id === saved)) setLayoutState(saved);
  }, []);
  const setLayout = (l: Layout) => { setLayoutState(l); localStorage.setItem("zen-layout", l); };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      input.keys[e.key.toLowerCase()] = true;
      if (e.key === "n") setNight(!game.night);
    };
    const up = (e: KeyboardEvent) => { input.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [setNight]);

  useEffect(() => { game.paused = paused; }, [paused]);
  useEffect(() => { game.cruise = cruise; }, [cruise]);

  if (!started) {
    return (
      <div className="zen-overlay">
        <div className="zen-card">
          <h1 className="zen-title">Zen Drive</h1>
          <p className="zen-sub">No timer, no finish line. Just keep driving.</p>
          <TimePicker night={night} setNight={setNight} />
          <LayoutPicker layout={layout} setLayout={setLayout} />
          <button className="zen-start" onClick={() => { game.started = true; setStarted(true); }}>Start driving</button>
          <p className="zen-hint">Keyboard: WASD or arrows, N switches day and night.</p>
        </div>
      </div>
    );
  }

  const pedals = (
    <div className="zen-pedals">
      <Pedal label="Brake" className="zen-brake" onChange={(v) => (input.brake = v)} />
      <Pedal label="Gas" className="zen-gas" onChange={(v) => (input.throttle = v)} />
    </div>
  );

  return (
    <div className="zen-hud">
      <div className="zen-top">
        <div className="zen-panel zen-readout">
          <span ref={(el) => { hudEls.speed = el; }} className="zen-num">0</span><span className="zen-unit">km/h</span>
          <span ref={(el) => { hudEls.dist = el; }} className="zen-num">0.0</span><span className="zen-unit">km</span>
        </div>
        <div className="zen-actions">
          <button className="zen-panel zen-icon" data-on={cruise} aria-label="Auto cruise" onClick={() => setCruise(!cruise)}><Gauge size={18} /></button>
          <button className="zen-panel zen-icon" aria-label="Day or night" onClick={() => setNight(!night)}>{night ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="zen-panel zen-icon" aria-label="Pause" onClick={() => setPaused(!paused)}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
        </div>
      </div>
      {paused && (
        <div className="zen-overlay">
          <div className="zen-card">
            <h2 className="zen-title">Paused</h2>
            <TimePicker night={night} setNight={setNight} />
            <LayoutPicker layout={layout} setLayout={setLayout} />
            <button className="zen-start" onClick={() => setPaused(false)}>Continue</button>
          </div>
        </div>
      )}
      {layout === "slider" ? (
        <div className="zen-controls">
          <Pedal label="Brake" className="zen-brake" onChange={(v) => (input.brake = v)} />
          <SteerPad />
          <Pedal label="Gas" className="zen-gas" onChange={(v) => (input.throttle = v)} />
        </div>
      ) : (
        <div className="zen-controls" data-flip={layout === "wheel-right"}>
          <Wheel />
          {pedals}
        </div>
      )}
    </div>
  );
}
