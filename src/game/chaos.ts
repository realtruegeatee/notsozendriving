// Player-selectable chaos level plus pure rules for pileups, road rage and road events.
export type Chaos = "zen" | "normal" | "mayhem";
export const CHAOS: { id: Chaos; label: string }[] = [
  { id: "zen", label: "Zen" },
  { id: "normal", label: "Normal" },
  { id: "mayhem", label: "Mayhem" },
];
export type ChaosProfile = { pileup: number; ragePerSec: number; eventGap: number; wrongWayGap: number; power: number };
/** Traffic temperament is independent of the player's chosen driving style. */
export function trafficProfile(c: Chaos) {
  return c === "zen"
    ? { count: 6, calm: true, sameSpeed: 16, oppositeSpeed: 18 }
    : { count: 16, calm: false, sameSpeed: 0, oppositeSpeed: 0 };
}
export function chaosProfile(c: Chaos): ChaosProfile {
  if (c === "zen") return { pileup: 0, ragePerSec: 0, eventGap: Infinity, wrongWayGap: Infinity, power: 0 };
  if (c === "normal") return { pileup: 0.5, ragePerSec: 0.04, eventGap: Infinity, wrongWayGap: 40, power: 1 };
  return { pileup: 0.9, ragePerSec: 0.12, eventGap: Infinity, wrongWayGap: 18, power: 1.4 };
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
export function dodgeEvent(events: readonly RoadEvent[], s: number, offset: number, v: number, kinds: readonly RoadEvent["kind"][] = ["oil", "rock"]): number | null {
  return dodgePlan(events, s, offset, v, kinds)?.target ?? null;
}
/** Like dodgeEvent, but keeps a previously chosen side (no flip-flopping) and skips sides another car occupies. */
export function dodgePlan(events: readonly RoadEvent[], s: number, offset: number, v: number, kinds: readonly RoadEvent["kind"][] = ["oil", "rock"], prefer = 0, blocked: (target: number) => boolean = () => false): { target: number; side: number } | null {
  let best: RoadEvent | null = null;
  for (const e of events) {
    if (e.hit || !kinds.includes(e.kind)) continue;
    const gap = e.s - s;
    if (gap < (prefer ? -e.radius - 3 : 0) || gap > Math.max(65, v * 4)) continue;
    if (!prefer && Math.abs(offset - e.offset) >= e.radius + 1.0) continue;
    if (!best || e.s < best.s) best = e;
  }
  if (!best) return null;
  const gap = best.s - s;
  // Too close at this speed: no time to steer clear, so it will hit.
  const limit = ROAD_HALF - 0.7;
  // Already swerving: hold the line until past. Otherwise, too late to start a dodge.
  if (gap < v * 0.45 + 4) {
    if (prefer === 0) return null;
    const keep = best.offset + Math.sign(prefer) * (best.radius + 1.8);
    if (Math.abs(keep) > limit || blocked(keep)) return null;
    return { target: keep, side: Math.sign(prefer) };
  }
  const first = prefer !== 0 ? Math.sign(prefer) : offset >= best.offset ? 1 : -1;
  for (const side of prefer ? [first] : [first, -first]) {
    const target = best.offset + side * (best.radius + 1.8);
    if (Math.abs(target) > limit || blocked(target)) continue;
    return { target, side };
  }
  return null;
}

export type HazardMemory = { event: RoadEvent; side: number };
/** Keep an escape until the rear bumper clears; slow down if steering room is limited. */
export function autopilotHazardPlan(events: readonly RoadEvent[], s: number, offset: number, v: number, memory: HazardMemory | null, blocked: (target: number) => boolean = () => false) {
  const held = memory && events.includes(memory.event) && !memory.event.hit && s <= memory.event.s + memory.event.radius + 3 ? memory : null;
  const candidates = held ? [held.event] : events.filter((e) => !e.hit && e.s >= s && e.s - s <= Math.max(65, v * 4) && Math.abs(offset - e.offset) < e.radius + 1).sort((a, b) => a.s - b.s);
  const event = candidates[0];
  if (!event) return { memory: null, target: null, speed: Infinity };
  const plan = dodgePlan([event], s, offset, v, ["oil", "rock"], held?.side ?? 0, blocked);
  const gap = Math.max(0, event.s - s - event.radius - 3);
  if (!plan) return { memory: held, target: null, speed: Math.sqrt(2 * 12 * gap) };
  const lateral = Math.abs(plan.target - offset);
  const steeringTime = 0.8 + lateral / 1.8;
  return { memory: { event, side: plan.side }, target: plan.target, speed: lateral < 0.3 ? Infinity : Math.max(3, gap / steeringTime) };
}

/** A big rock in this car's path within stopping range: every driver sees it and brakes. */
export function rockAhead(events: readonly RoadEvent[], s: number, offset: number, v: number) {
  return events.some((e) => e.kind === "rock" && !e.hit && e.s - s > 0 && e.s - s < Math.max(30, v * 2.2) && Math.abs(offset - e.offset) < e.radius + 1);
}

/** A flying wreck may knock a driving car into the pileup, harder when the wreck is fast. */
export function pileupSeverity(wreckSpeed: number, p: ChaosProfile) {
  return Math.min(2, Math.max(0.6, wreckSpeed / 10) * p.power);
}
