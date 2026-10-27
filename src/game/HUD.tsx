import { AGGRESSION, type Aggression } from "./aggression";
import { CHAOS } from "./chaos";
import type { Chaos } from "./chaos";
import { useEffect, useRef, useState } from "react";
import { Eye, Moon, Pause, Play, Sun, Gauge, Megaphone, Lamp, MonitorDown, Video } from "lucide-react";
import { DashcamOverlay } from "./dashcam-overlay";
import { WorldBanner } from "./WorldBanner";
import windowsAsset from "../assets/zen-drive-windows.asset.json";
import linuxAsset from "../assets/zen-drive-linux.asset.json";
import { Button } from "@/components/ui/button";
import { flashLights, horn, initSignals } from "./signals";
import { OnlinePicker, PlayersChip, RadioButton, newCode } from "./Lobby";
import type { RoadMode } from "./Lobby";
import { WORLD_CHOICES, warpToWorld } from "./worlds";
import { CARS, game, hudEls, input } from "./store";
import type { CarId } from "./store";
import { RecordingButton } from "./RecordingButton";

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

function AggroPicker() {
  const [aggro, setAggro] = useState<Aggression>("reckless");
  useEffect(() => {
    const saved = localStorage.getItem("zen-aggro") as Aggression | null;
    if (saved && AGGRESSION.some((a) => a.id === saved)) { setAggro(saved); game.aggro = saved; }
  }, []);
  const pick = (a: Aggression) => { setAggro(a); game.aggro = a; localStorage.setItem("zen-aggro", a); };
  return (
    <>
      <p className="zen-label">Autopilot</p>
      <div className="zen-seg">
        {AGGRESSION.map((a) => (
          <button key={a.id} data-on={aggro === a.id} onClick={() => pick(a.id)}>{a.label}</button>
        ))}
      </div>
      <ChaosPicker />
    </>
  );
}

function ChaosPicker() {
  const [chaos, setChaos] = useState<Chaos>("normal");
  useEffect(() => {
    const saved = localStorage.getItem("zen-chaos") as Chaos | null;
    if (saved && CHAOS.some((c) => c.id === saved)) { setChaos(saved); game.chaos = saved; }
  }, []);
  const pick = (c: Chaos) => { setChaos(c); game.chaos = c; localStorage.setItem("zen-chaos", c); };
  return (
    <>
      <p className="zen-label">Chaos</p>
      <div className="zen-seg">
        {CHAOS.map((c) => (
          <button key={c.id} data-on={chaos === c.id} onClick={() => pick(c.id)}>{c.label}</button>
        ))}
      </div>
    </>
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

function CarPicker({ car, setCar }: { car: CarId; setCar: (c: CarId) => void }) {
  return (
    <>
      <p className="zen-label">Your car</p>
      <div className="zen-seg zen-cars">
        {CARS.map((c) => (
          <button key={c.id} data-on={car === c.id} onClick={() => setCar(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
    </>
  );
}

function WorldPicker() {
  return (
    <>
      <p className="zen-label">Worlds</p>
      <div className="zen-seg zen-worlds">
        {WORLD_CHOICES.map((w) => (
          <button key={w.id} aria-label={`Warp to ${w.label}`} onClick={() => warpToWorld(w.id)}>{w.label}</button>
        ))}
      </div>
    </>
  );
}

function DesktopPicker() {
  return (
    <>
      <p className="zen-label">Desktop app</p>
      <div className="zen-seg">
        <a href={windowsAsset.url} download="zen-drive-windows.zip"><MonitorDown size={16} />Windows</a>
        <a href={linuxAsset.url} download="zen-drive-linux.tar.gz"><MonitorDown size={16} />Linux</a>
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

type View = "chase" | "cockpit" | "dashcam";
const VIEWS: View[] = ["chase", "cockpit", "dashcam"];
const VIEW_LABEL: Record<View, string> = { chase: "Chase", cockpit: "First person", dashcam: "Dashcam" };
const nextView = (v: View) => VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length]!;

export function HUD({ night, setNight, car, setCar, room, onJoin }: {
  night: boolean; setNight: (n: boolean) => void; car: CarId; setCar: (c: CarId) => void;
  room: string | null; onJoin: (room: string | null, name: string) => void;
}) {
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cruise, setCruise] = useState(true);
  const [layout, setLayoutState] = useState<Layout>("wheel-left");
  const [view, setView] = useState<View>("chase");
  const [mode, setMode] = useState<RoadMode>("solo");
  const [name, setName] = useState("");
  const [code, setCode] = useState(newCode);

  useEffect(() => {
    const saved = localStorage.getItem("zen-layout") as Layout | null;
    if (saved && LAYOUTS.some((l) => l.id === saved)) setLayoutState(saved);
    const sv = localStorage.getItem("zen-view") as View | null; if (sv && VIEWS.includes(sv)) setView(sv);
    setName(localStorage.getItem("zen-name") || `Driver${Math.floor(Math.random() * 900 + 100)}`);
    const r = new URLSearchParams(location.search).get("room");
    if (r) { setMode("private"); setCode(r.toUpperCase().slice(0, 6)); }
  }, []);
  const setLayout = (l: Layout) => { setLayoutState(l); localStorage.setItem("zen-layout", l); };
  const pickCar = (c: CarId) => { setCar(c); localStorage.setItem("zen-car", c); };
  useEffect(() => { game.view = view; localStorage.setItem("zen-view", view); }, [view]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      input.keys[e.key.toLowerCase()] = true;
      if (e.key === "n") setNight(!game.night);
      if (e.key === "v") setView(nextView);
      if (!e.repeat && e.code === "KeyX") horn();
      if (!e.repeat && e.code === "KeyT") flashLights();
    };
    const up = (e: KeyboardEvent) => { input.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [setNight]);

  useEffect(() => { game.paused = paused; }, [paused]);
  useEffect(() => { game.cruise = cruise; }, [cruise]);

  const start = () => {
    initSignals();
    const n = name.trim().slice(0, 16) || "Driver";
    localStorage.setItem("zen-name", n);
    const r = mode === "solo" ? null : mode === "public" ? "PUBLIC" : (code || newCode());
    if (r && r !== "PUBLIC") { const u = new URL(location.href); u.searchParams.set("room", r); history.replaceState(null, "", u); }
    onJoin(r, n);
    game.started = true; setStarted(true);
  };

  if (!started) {
    return (
      <div className="zen-overlay">
        <div className="zen-card zen-scroll">
          <h1 className="zen-title">Zen Drive</h1>
          <p className="zen-sub">One road, many worlds. No timer, no finish line. Just keep driving.</p>
          <OnlinePicker mode={mode} setMode={setMode} name={name} setName={setName} code={code} setCode={setCode} />
          <TimePicker night={night} setNight={setNight} />
          <CarPicker car={car} setCar={pickCar} />
          <LayoutPicker layout={layout} setLayout={setLayout} />
          <AggroPicker />
          <WorldPicker />
          <DesktopPicker />
          <button className="zen-start" onClick={start}>Start driving</button>
          <p className="zen-hint">Keyboard: WASD or arrows, N day/night, V camera view, X horn, T flash.</p>
        </div>
      </div>
    );
  }

  const signals = (
    <div className="zen-signals">
      <Button variant="ghost" size="icon" className="zen-panel zen-icon" aria-label="Flash headlights" title="Flash headlights (T)" onClick={flashLights}><Lamp size={18} /></Button>
      <Button variant="ghost" size="icon" className="zen-panel zen-icon" aria-label="Horn" title="Horn (X)" onClick={horn}><Megaphone size={18} /></Button>
    </div>
  );
  const pedals = (
    <div className="zen-pedals">
      {signals}
      <Pedal label="Brake" className="zen-brake" onChange={(v) => (input.brake = v)} />
      <Pedal label="Gas" className="zen-gas" onChange={(v) => (input.throttle = v)} />
    </div>
  );

  return (
    <div className="zen-hud">
      <div className="zen-top">
        <div className="zen-left">
          <div className="zen-panel zen-readout">
            <span ref={(el) => { hudEls.speed = el; }} className="zen-num">0</span><span className="zen-unit">km/h</span>
            <span ref={(el) => { hudEls.dist = el; }} className="zen-num">0.0</span><span className="zen-unit">km</span>
          </div>
          <WorldBanner />
          {room && <PlayersChip room={room} />}
        </div>
        <div className="zen-actions">
          {view === "dashcam" && !paused && <DashcamOverlay />}
          <RecordingButton />
          <RadioButton />
          <button className="zen-panel zen-icon" data-on={view !== "chase"} aria-label={`Camera: ${VIEW_LABEL[view]}`} title={`Camera: ${VIEW_LABEL[view]} (V)`} onClick={() => setView(nextView)}>{view === "dashcam" ? <Video size={18} /> : <Eye size={18} />}</button>
          <button className="zen-panel zen-icon" data-on={cruise} aria-label="Autodrive" title="Autodrive" onClick={() => setCruise(!cruise)}><Gauge size={18} /></button>
          <button className="zen-panel zen-icon" aria-label="Day or night" onClick={() => setNight(!night)}>{night ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="zen-panel zen-icon" aria-label="Pause" onClick={() => setPaused(!paused)}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
        </div>
      </div>
      {paused && (
        <div className="zen-overlay">
          <div className="zen-card">
            <h2 className="zen-title">Paused</h2>
            <TimePicker night={night} setNight={setNight} />
            <CarPicker car={car} setCar={pickCar} />
          <LayoutPicker layout={layout} setLayout={setLayout} />
          <AggroPicker />
          <WorldPicker />
          <button className="zen-start" onClick={() => setPaused(false)}>Continue</button>
          </div>
        </div>
      )}
      {layout === "slider" ? (
        <div className="zen-controls">
          <Pedal label="Brake" className="zen-brake" onChange={(v) => (input.brake = v)} />
          <SteerPad />
          {signals}
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
