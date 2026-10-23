import { useEffect, useRef, useState } from "react";
import { Circle, Download, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameplayRecording } from "./recording";

export function RecordingButton() {
  const [, refresh] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useRef<GameplayRecording | null>(null);
  if (!session.current) session.current = new GameplayRecording(() => refresh((v) => v + 1));
  useEffect(() => () => session.current?.discard(), []);
  const recording = session.current;
  const active = recording.status === "recording";
  const ready = recording.status === "ready";
  const label = ready ? "Download recording" : active ? "Stop recording" : "Record gameplay";
  const click = async () => {
    setError("");
    try {
      if (ready) { setBusy(true); await recording.download(); }
      else if (active) recording.stop();
      else {
        const canvas = document.querySelector("canvas");
        if (!canvas) throw new Error("Wait for the road to load.");
        recording.start(canvas);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't download the recording. Try again."); }
    finally { setBusy(false); }
  };
  return <div className="zen-recording">
    <Button variant="ghost" size="icon" className="zen-panel zen-icon" data-recording={active} aria-label={label} title={label} disabled={busy || recording.status === "stopping"} onClick={click}>
      {ready ? <Download size={18} /> : active ? <Square size={16} fill="currentColor" /> : <Circle size={18} />}
    </Button>
    {ready && <Button variant="ghost" size="icon" className="zen-panel zen-icon" aria-label="Discard recording" title="Discard recording" disabled={busy} onClick={() => recording.discard()}><Trash2 size={16} /></Button>}
    {active && <span className="zen-recording-label" role="status">REC</span>}
    {error && <div className="zen-panel zen-recording-error" role="alert">{error}</div>}
  </div>;
}