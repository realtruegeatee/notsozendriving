import { useEffect, useState } from "react";
import { Radio as RadioIcon, Users, X } from "lucide-react";
import { STATIONS, radio } from "./radio";
import { net } from "./store";

export type RoadMode = "solo" | "public" | "private";
export const newCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export function OnlinePicker(p: {
  mode: RoadMode; setMode: (m: RoadMode) => void; name: string; setName: (n: string) => void; code: string; setCode: (c: string) => void;
}) {
  return (
    <>
      <p className="zen-label">Road</p>
      <div className="zen-seg">
        <button data-on={p.mode === "solo"} onClick={() => p.setMode("solo")}>Solo</button>
        <button data-on={p.mode === "public"} onClick={() => p.setMode("public")}>Open road</button>
        <button data-on={p.mode === "private"} onClick={() => p.setMode("private")}>With friends</button>
      </div>
      {p.mode !== "solo" && (
        <div className="zen-row">
          <input className="zen-input" aria-label="Nickname" placeholder="Nickname" maxLength={16} value={p.name} onChange={(e) => p.setName(e.target.value)} />
          {p.mode === "private" && (
            <>
              <input className="zen-input zen-code" aria-label="Room code" maxLength={6} value={p.code} onChange={(e) => p.setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
              <button className="zen-small" onClick={() => p.setCode(newCode())}>New</button>
            </>
          )}
        </div>
      )}
      {p.mode === "private" && <p className="zen-hint">Share code <b>{p.code}</b> with friends so they join your road.</p>}
    </>
  );
}

export function PlayersChip({ room }: { room: string }) {
  const [, force] = useState(0);
  useEffect(() => { net.onRoster = () => force((n) => n + 1); return () => { net.onRoster = null; }; }, []);
  const [open, setOpen] = useState(false);
  return (
    <div className="zen-chipwrap">
      <button className="zen-panel zen-chip" onClick={() => setOpen(!open)} aria-label="Players">
        <Users size={15} /> {net.roster.length || 1}
        <span className="zen-dot" data-s={net.status} />
        {room !== "PUBLIC" && <span className="zen-unit" style={{ margin: 0 }}>{room}</span>}
      </button>
      {open && (
        <div className="zen-panel zen-pop">
          <p className="zen-label" style={{ marginTop: 0 }}>{room === "PUBLIC" ? "Open road" : `Room ${room}`}</p>
          {net.status !== "online" && <p className="zen-hint">Connecting…</p>}
          {net.roster.map((n, i) => <p key={i} className="zen-player">{n}</p>)}
        </div>
      )}
    </div>
  );
}

export function RadioButton() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); radio.listeners.add(l); return () => { radio.listeners.delete(l); }; }, []);
  const cur = radio.current;
  return (
    <>
      <button className="zen-panel zen-icon" data-on={!!cur} aria-label="Radio" onClick={() => setOpen(!open)}><RadioIcon size={18} /></button>
      {open && (
        <div className="zen-panel zen-radio">
          <div className="zen-radio-head">
            <p className="zen-label" style={{ margin: 0 }}>Radio</p>
            <button aria-label="Close radio" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <p className="zen-now">{cur ? cur.name : "Off"}{radio.status === "loading" && " · tuning…"}{radio.status === "error" && " · no signal"}</p>
          {(["built-in", "live"] as const).map((k) => (
            <div key={k}>
              <p className="zen-label">{k === "built-in" ? "In the car (works offline)" : "Live stations"}</p>
              {STATIONS.filter((s) => s.kind === k).map((s) => (
                <button key={s.id} className="zen-station" data-on={cur?.id === s.id} onClick={() => (cur?.id === s.id ? radio.stop() : radio.play(s))}>
                  <b>{s.name}</b><span>{s.tag}</span>
                </button>
              ))}
            </div>
          ))}
          <label className="zen-vol">Volume
            <input type="range" min={0} max={1} step={0.05} value={radio.volume} onChange={(e) => radio.setVolume(Number(e.target.value))} />
          </label>
          {cur && <button className="zen-small" style={{ width: "100%", marginTop: 8 }} onClick={() => radio.stop()}>Turn off</button>}
        </div>
      )}
    </>
  );
}
