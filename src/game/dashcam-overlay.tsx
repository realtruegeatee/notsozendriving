import { useEffect, useState } from "react";
import { hudEls } from "./store";

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export function DashcamOverlay() {
  const [time, setTime] = useState("");
  useEffect(() => {
    setTime(stamp(new Date()));
    const id = setInterval(() => setTime(stamp(new Date())), 1000);
    return () => { clearInterval(id); hudEls.dash = null; };
  }, []);
  return <div className="zen-dashcam" aria-hidden>
    <div className="zen-dashcam-rec"><i />REC</div>
    <div className="zen-dashcam-row"><span>{time}</span><span ref={(el) => { hudEls.dash = el; }}>000 KM/H</span></div>
  </div>;
}
