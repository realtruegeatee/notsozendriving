import { LANE, ROAD_HALF } from "./road";

export type TrafficReaction = "crash" | "accelerate" | "brake";
export type ReactingCar = { s: number; lane: number; crashAge: number; reactionLeft?: number };
export type BlockedCar = ReactingCar & { v: number };
/** Roadside wrecks stay rare; most threatened NPCs speed away, some slow down. */
export const CRASH_CHANCE = 0.12;
export const ACCELERATE_CHANCE = 0.58;
export const BRAKE_CHANCE = 0.3;

export function chooseTrafficReaction(random: number): TrafficReaction {
  return random < CRASH_CHANCE ? "crash" : random < CRASH_CHANCE + ACCELERATE_CHANCE ? "accelerate" : "brake";
}
export function reactionSpeed(base: number, reaction: TrafficReaction | null) {
  if (reaction === "accelerate") return Math.min(32, base + 12);
  if (reaction === "brake") return Math.max(2, base * 0.2);
  return reaction === "crash" ? 0 : base;
}
export function threatenedTraffic(playerS: number, car: ReactingCar) {
  const ahead = car.s - playerS;
  return car.crashAge < 0 && (car.reactionLeft ?? 0) <= 0 && ahead > 4 && ahead < 55;
}
/** A car directly ahead in our lane that we are closing on fast enough to need to slow down. */
export function mustSlowFor(playerS: number, playerLane: number, playerSpeed: number, car: BlockedCar) {
  if (car.crashAge >= 0 || (car.reactionLeft ?? 0) > 0) return false;
  const ahead = car.s - playerS;
  if (ahead <= 2 || ahead > 45) return false;
  if (Math.abs(car.lane - playerLane) > LANE * 0.7) return false;
  const closing = playerSpeed - car.v;
  return closing > 0.5 && ahead / closing < 6;
}
export function shouldAutopilotSignal(auto: boolean, speed: number, cooldown: number, playerS: number, playerLane: number, cars: BlockedCar[]) {
  return auto && speed > 4 && cooldown <= 0 && cars.some((car) => mustSlowFor(playerS, playerLane, speed, car));
}

/** A short skid into the ditch, then a stationary, tilted roadside wreck. */
export function roadsideCrash(age: number, lane: number) {
  const t = Math.max(0, Math.min(1, age / 1.3));
  const ease = t * t * (3 - 2 * t);
  const side = Math.sign(lane) || 1;
  return {
    offset: lane + (side * (ROAD_HALF + 3.5) - lane) * ease,
    yaw: -side * Math.sin(t * Math.PI / 2) * 0.95,
    roll: side * (Math.sin(t * Math.PI) * 0.24 + ease * 0.2),
    bounce: Math.max(0, Math.sin((age - 0.8) * 16)) * Math.exp(-Math.max(0, age - 0.8) * 5) * (age > 0.8 ? 0.16 : 0),
  };
}