import { useEffect, useRef, useState } from "react";
import { Moon, Pause, Play, Sun, Gauge } from "lucide-react";
import { game, hudEls, input } from "./store";

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

function SteerPad() {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const set = (clientX: number | null) => {
    const el = track.current!;
    const r = el.getBoundingClientRect();
    const v = clientX === null ? 0 : Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / (r.width / 2 - 28)));
    input.steer = Math.sign(v) * Math.pow(Math.abs(v), 1.3);
    if (knob.current) knob.current.style.transform = `translateX(${v * (r.width / 2 - 28)}px)`;
  };
  return (
    <div
      ref={track}
      className="zen-steer"
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

export function HUD({ night, setNight }: { night: boolean; setNight: (n: boolean) => void }) {
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cruise, setCruise] = useState(true);

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
          <p className="zen-kicker">an endless road</p>
          <h1 className="zen-title">Zen Drive</h1>
          <p className="zen-sub">No timer. No finish line. Just the road.</p>
          <div className="zen-toggle">
            <button data-on={!night} onClick={() => setNight(false)}><Sun size={16} /> Day</button>
            <button data-on={night} onClick={() => setNight(true)}><Moon size={16} /> Night</button>
          </div>
          <button className="zen-start" onClick={() => { game.started = true; setStarted(true); }}>Start driving</button>
          <p className="zen-hint">Phone: drag the bar to steer · Keyboard: WASD / arrows · N for night</p>
        </div>
      </div>
    );
  }

  return (
    <div className="zen-hud">
      <div className="zen-top">
        <div className="zen-glass zen-readout">
          <span ref={(el) => { hudEls.speed = el; }} className="zen-num">0</span><span className="zen-unit">km/h</span>
          <span className="zen-dot" />
          <span ref={(el) => { hudEls.dist = el; }} className="zen-num zen-num-sm">0.0</span><span className="zen-unit">km</span>
        </div>
        <div className="zen-actions">
          <button className="zen-glass zen-icon" data-on={cruise} aria-label="Auto cruise" onClick={() => setCruise(!cruise)}><Gauge size={18} /></button>
          <button className="zen-glass zen-icon" aria-label="Day or night" onClick={() => setNight(!night)}>{night ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="zen-glass zen-icon" aria-label="Pause" onClick={() => setPaused(!paused)}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
        </div>
      </div>
      {paused && (
        <div className="zen-overlay"><div className="zen-card"><h2 className="zen-title">Breathe</h2><button className="zen-start" onClick={() => setPaused(false)}>Continue</button></div></div>
      )}
      <div className="zen-controls">
        <Pedal label="Brake" className="zen-brake" onChange={(v) => (input.brake = v)} />
        <SteerPad />
        <Pedal label="Gas" className="zen-gas" onChange={(v) => (input.throttle = v)} />
      </div>
    </div>
  );
}
