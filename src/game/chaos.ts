// Player-selectable chaos level plus pure rules for pileups, road rage and road events.
export type Chaos = "zen" | "normal" | "mayhem";
export const CHAOS: { id: Chaos; label: string }[] = [
  { id: "zen", label: "Zen" },
  { id: "normal", label: "Normal" },
  { id: "mayhem", label: "Mayhem" },
];
export type ChaosProfile = { pileup: number; ragePerSec: number; eventGap: number; wrongWayGap: number; power: number };
export function chaosProfile(c: Chaos): ChaosProfile {
  if (c === "zen") return { pileup: 0, ragePerSec: 0, eventGap: Infinity, wrongWayGap: Infinity, power: 0 };
  if (c === "normal") return { pileup: 0.5, ragePerSec: 0.04, eventGap: 14, wrongWayGap: 40, power: 1 };
  return { pileup: 0.9, ragePerSec: 0.12, eventGap: 6, wrongWayGap: 18, power: 1.4 };
}

/** Seconds a road-rage driver hunts the player before giving up. */
export const RAGE_FOR = 12;
/** Only a same-direction car 10–80 m behind the player can turn angry. */
export function canStartRage(behind: number) { return behind > 10 && behind < 80; }
export function stepRage(rageLeft: number, behind: number, crashed: boolean, rand: number, dt: number, p: ChaosProfile) {
  if (crashed) return 0;
  if (rageLeft > 0) return Math.max(0, rageLeft - dt);
  return canStartRage(behind) && rand < 1 - Math.exp(-p.ragePerSec * dt) ? RAGE_FOR : 0;
}
/** Close in fast, then keep bumping: aim slightly faster than the player when near. */
export function rageSpeed(playerSpeed: number, behind: number) {
  return Math.max(0, playerSpeed) + (behind > 6 ? 12 : 3);
}

export type RoadEvent = { kind: "oil" | "rock"; s: number; offset: number; radius: number; hit?: boolean };
/** New events appear 120–200 m ahead; passed ones are dropped. Returns the next spawn timer. */
export function stepRoadEvents(events: RoadEvent[], playerS: number, timer: number, dt: number, p: ChaosProfile, rand: () => number) {
  for (let i = events.length - 1; i >= 0; i--) if ((events[i]?.s ?? 0) < playerS - 40) events.splice(i, 1);
  if (!isFinite(p.eventGap)) { events.length = 0; return 0; }
  let t = timer + dt;
  if (t >= p.eventGap && events.length < 6) {
    t = 0;
    const kind = rand() < 0.55 ? "oil" : "rock";
    events.push({ kind, s: playerS + 120 + rand() * 80, offset: (rand() - 0.5) * 6, radius: kind === "oil" ? 2.6 : 1.3 });
  }
  return t;
}
export function hitsEvent(e: RoadEvent, s: number, offset: number) {
  return Math.abs(s - e.s) < e.radius + 1.6 && Math.abs(offset - e.offset) < e.radius + 0.8;
}

import { ROAD_HALF } from "./road";
/** Skilled drivers spot an event early and steer around it at speed.
 * Returns a safe lateral offset, or null when nothing threatens or it is too late to dodge. */
export function dodgeEvent(events: readonly RoadEvent[], s: number, offset: number, v: number): number | null {
  let best: RoadEvent | null = null;
  for (const e of events) {
    if (e.hit) continue;
    const gap = e.s - s;
    if (gap < 0 || gap > Math.max(30, v * 1.6)) continue;
    if (Math.abs(offset - e.offset) > e.radius + 2.2) continue;
    if (!best || e.s < best.s) best = e;
  }
  if (!best) return null;
  const gap = best.s - s;
  // Too close at this speed: no time to steer clear, so it will hit.
  if (gap < v * 0.45 + 4) return null;
  const limit = ROAD_HALF - 0.7;
  const side = offset >= best.offset ? 1 : -1;
  let target = best.offset + side * (best.radius + 1.8);
  if (Math.abs(target) > limit) target = best.offset - side * (best.radius + 1.8);
  return Math.max(-limit, Math.min(limit, target));
}

/** A flying wreck may knock a driving car into the pileup, harder when the wreck is fast. */
export function pileupSeverity(wreckSpeed: number, p: ChaosProfile) {
  return Math.min(2, Math.max(0.6, wreckSpeed / 10) * p.power);
}
