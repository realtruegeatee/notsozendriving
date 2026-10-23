import { LANE } from "./road";

export type DrivingNpc = { s: number; lane: number; v: number; base: number; crashAge: number; passOffset: number; passing: boolean };
/** Lane changes keep the original lane as the travel direction. */
export function planNpcDriving(car: DrivingNpc, cars: readonly DrivingNpc[], desiredSpeed: number) {
  const direction = Math.sign(car.lane);
  const offset = car.lane + car.passOffset;
  const gap = (other: DrivingNpc) => (other.s - car.s) * direction;
  const homeCars = cars.filter((o) => o !== car && o.crashAge < 0 && Math.abs(o.lane + o.passOffset - car.lane) < 1.9);
  const blocker = homeCars.filter((o) => gap(o) > 0 && gap(o) < 45 && o.lane * car.lane > 0 && o.v < desiredSpeed - 1.5).sort((a, b) => gap(a) - gap(b))[0];
  const passingLane = -car.lane;
  const passClear = !cars.some((o) => o !== car && Math.abs(o.lane + o.passOffset - passingLane) < 2.1 && gap(o) > -18 && gap(o) < (o.lane * car.lane > 0 ? 55 : Math.max(90, (car.v + o.v) * 3)));
  const mergeClear = !homeCars.some((o) => gap(o) > -8 && gap(o) < 18);
  let passing = car.passing;
  if (passing && mergeClear && !blocker) passing = false;
  else if (!passing && blocker && passClear) passing = true;
  let speed = desiredSpeed;
  const target = passing ? passingLane : car.lane;
  for (const other of cars) {
    if (other === car) continue;
    const distance = gap(other);
    if (distance <= 0 || distance > 45) continue;
    const otherOffset = other.lane + other.passOffset;
    if (Math.abs(otherOffset - target) > 2.1 && !(distance < 10 && Math.abs(otherOffset - offset) < 1.9)) continue;
    if (other.lane * car.lane < 0) speed = Math.min(speed, Math.max(0, (distance - 12) * 0.3));
    else speed = Math.min(speed, Math.max(0, other.v + (distance - 12) * 0.6));
  }
  return { passing, passOffset: passing ? -2 * car.lane : 0, speed };
}