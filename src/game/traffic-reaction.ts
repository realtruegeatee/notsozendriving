import { ROAD_HALF } from "./road";

export type TrafficReaction = "crash" | "accelerate" | "brake";
export type ReactingCar = { s: number; lane: number; crashAge: number; reactionLeft?: number };
export function chooseTrafficReaction(random: number): TrafficReaction {
  return random < 1 / 3 ? "crash" : random < 2 / 3 ? "accelerate" : "brake";
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
export function shouldAutopilotSignal(auto: boolean, speed: number, cooldown: number, playerS: number, cars: ReactingCar[]) {
  return auto && speed > 4 && cooldown <= 0 && cars.some((car) => threatenedTraffic(playerS, car));
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