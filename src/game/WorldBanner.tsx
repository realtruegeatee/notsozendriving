import { useEffect, useState } from "react";
import { game } from "./store";
import { worldAt } from "./worlds";

/** Announces each new world as the road crosses into it. */
export function WorldBanner() {
  const [w, setW] = useState(() => worldAt(-game.z));
  const [show, setShow] = useState(true);
  useEffect(() => {
    let hide = setTimeout(() => setShow(false), 3200);
    const id = setInterval(() => {
      const next = worldAt(-game.z);
      setW((cur) => {
        if (cur.number === next.number) return cur;
        clearTimeout(hide); setShow(true); hide = setTimeout(() => setShow(false), 3200);
        return next;
      });
    }, 300);
    return () => { clearInterval(id); clearTimeout(hide); };
  }, []);
  return (
    <>
      <div className="zen-panel zen-world-chip">{w.label}</div>
      {show && (
        <div className="zen-world-banner" key={w.number}>
          <span className="zen-world-num">{w.label}</span>
          <span className="zen-world-name">{w.name}</span>
        </div>
      )}
    </>
  );
}
