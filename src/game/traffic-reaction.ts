import { LANE, ROAD_HALF } from "./road";

export type TrafficReaction = "crash" | "accelerate" | "brake";
export type ReactingCar = { s: number; lane: number; crashAge: number; reactionLeft?: number };
export type BlockedCar = ReactingCar & { v: number };
/** Roadside wrecks stay rare; most threatened NPCs speed away, some slow down. */
export const CRASH_CHANCE = 0.12;
export const ACCELERATE_CHANCE = 0.58;
export const BRAKE_CHANCE = 0.3;
/** While a car is still in the way, blare again this often instead of a single polite toot. */
export const SIGNAL_GAP = 0.8;

export function chooseTrafficReaction(random: number): TrafficReaction {
  return random < CRASH_CHANCE ? "crash" : random < CRASH_CHANCE + ACCELERATE_CHANCE ? "accelerate" : "brake";
}
export function reactionSpeed(base: number, reaction: TrafficReaction | null) {
  if (reaction === "accelerate") return Math.min(32, base + 12);
  if (reaction === "brake") return Math.max(2, base * 0.2);
  return reaction === "crash" ? 0 : base;
}
/** A crashing car always rolls to a stop, even when its reaction flag was cleared (e.g. run-off victims). */
export function npcTargetSpeed(base: number, reaction: TrafficReaction | null, crashing: boolean) {
  return crashing ? 0 : reactionSpeed(base, reaction);
}
export function threatenedTraffic(playerS: number, car: ReactingCar) {
  const ahead = car.s - playerS;
  return car.crashAge < 0 && (car.reactionLeft ?? 0) <= 0 && ahead > 4 && ahead < 55;
}
/** A car directly ahead in our lane that we are closing on fast enough to need to slow down. */
export function mustSlowFor(playerS: number, playerLane: number, playerSpeed: number, car: BlockedCar) {
  if (car.crashAge >= 0) return false;
  const ahead = car.s - playerS;
  if (ahead <= 2 || ahead > 45) return false;
  if (Math.abs(car.lane - playerLane) > LANE * 0.7) return false;
  const closing = playerSpeed - car.v;
  return closing > 0.5 && ahead / closing < 6;
}
export function shouldAutopilotSignal(auto: boolean, speed: number, cooldown: number, playerS: number, playerLane: number, cars: BlockedCar[]) {
  return auto && speed > 4 && cooldown <= 0 && cars.some((car) => mustSlowFor(playerS, playerLane, speed, car));
}

export type Aggressor = BlockedCar & { reaction: TrafficReaction | null };
/** How close, and how fast closing, counts as a road-rage shove into the ditch. */
export const RUNOFF_RANGE = 22;
export const RUNOFF_TTC = 4.5;
/** A car that has stamped on the gas can push a slower car in its lane off the street. */
export function runsIntoRoadside(aggressor: Aggressor, victim: Aggressor) {
  if (aggressor.reaction !== "accelerate" || aggressor.crashAge >= 0 || victim.crashAge >= 0) return false;
  const ahead = victim.s - aggressor.s;
  if (ahead <= 2 || ahead > RUNOFF_RANGE) return false;
  if (Math.abs(victim.lane - aggressor.lane) > LANE * 0.7) return false;
  const closing = aggressor.v - victim.v;
  return closing > 1 && ahead / closing < RUNOFF_TTC;
}
/** The nearest car the aggressor is actually bearing down on. */
export function pickRunoffVictim(aggressor: Aggressor, cars: readonly Aggressor[]): Aggressor | null {
  if (aggressor.reaction !== "accelerate") return null;
  let best: Aggressor | null = null;
  for (const car of cars) if (car !== aggressor && runsIntoRoadside(aggressor, car) && (!best || car.s < best.s)) best = car;
  return best;
}

/** A short skid into the ditch, then a stationary, tilted roadside wreck. */
export function roadsideCrash(age: number, lane: number, origin = lane, shove = 0) {
  const t = Math.max(0, Math.min(1, age / (shove ? 0.85 : 1.3)));
  const ease = shove ? 1 - Math.pow(1 - t, 3) : t * t * (3 - 2 * t);
  const side = Math.sign(lane) || 1;
  return {
    offset: origin + (side * (ROAD_HALF + 3.5) - origin) * ease,
    yaw: -side * (Math.sin(t * Math.PI / 2) * 0.95 + shove * Math.sin(t * Math.PI) * 0.35),
    roll: side * (Math.sin(t * Math.PI) * (shove ? 0.48 : 0.24) + ease * 0.2),
    bounce: (shove ? Math.sin(t * Math.PI) * 0.25 : 0) + Math.max(0, Math.sin((age - 0.8) * 16)) * Math.exp(-Math.max(0, age - 0.8) * 5) * (age > 0.8 ? 0.16 : 0),
  };
}