export type DrivingNpc = { s: number; lane: number; v: number; base: number; crashAge: number; passOffset: number; passing: boolean; offset?: number };
const lateral = (car: DrivingNpc) => car.offset ?? car.lane + car.passOffset;

/** Critically damped steering: continuous velocity, with no parked sideways sliding. */
export function stepNpcLane(offset: number, velocity: number, target: number, speed: number, rawDelta: number) {
  const dt = Math.max(0, Math.min(rawDelta, 0.05));
  if (!dt || speed < 0.1) return { offset, velocity: speed < 0.1 ? 0 : velocity };
  const stiffness = 3;
  const error = offset - target;
  const c = velocity + stiffness * error;
  const decay = Math.exp(-stiffness * dt);
  const next = target + (error + c * dt) * decay;
  const limit = Math.min(2.8, speed * 0.2);
  const movement = Math.max(-limit * dt, Math.min(limit * dt, next - offset));
  return { offset: offset + movement, velocity: Math.max(-limit, Math.min(limit, (velocity - stiffness * c * dt) * decay)) };
}

/** Lane changes keep the original lane as the travel direction. */
export function planNpcDriving(car: DrivingNpc, cars: readonly DrivingNpc[], desiredSpeed: number) {
  const direction = Math.sign(car.lane);
  const offset = lateral(car);
  const gap = (other: DrivingNpc) => (other.s - car.s) * direction;
  const homeCars = cars.filter((o) => o !== car && Math.abs(lateral(o) - car.lane) < 2.1);
  const blocker = homeCars.filter((o) => gap(o) > 0 && gap(o) < 45 && o.lane * car.lane > 0 && o.v < desiredSpeed - 1.5).sort((a, b) => gap(a) - gap(b))[0];
  const passingLane = -car.lane;
  const passClear = !cars.some((o) => o !== car && Math.abs(lateral(o) - passingLane) < 2.1 && gap(o) > -18 && gap(o) < (o.lane * car.lane > 0 ? 55 : Math.max(90, (car.v + o.v) * 3)));
  const mergeClear = !homeCars.some((o) => gap(o) > -Math.max(8, 5 + (o.v - car.v) * 2) && gap(o) < Math.max(18, 6 + (car.v - o.v) * 2));
  // Only start a pass with room to merge back in front of the blocker, never into a queue.
  const mergeSlot = !!blocker && !homeCars.some((o) => o !== blocker && gap(o) > gap(blocker) - 2 && gap(o) < gap(blocker) + 22);
  let passing = car.passing;
  if (passing && mergeClear && (!blocker || !passClear)) passing = false;
  else if (!passing && blocker && passClear && mergeSlot) passing = true;
  let speed = desiredSpeed;
  // Stuck beside traffic with the pass closing: drop back behind it so the merge opens up.
  if (passing && !passClear && !mergeClear && blocker) speed = Math.min(speed, blocker.v * 0.6);
  const target = passing ? passingLane : car.lane;
  for (const other of cars) {
    if (other === car) continue;
    const distance = gap(other);
    if (distance <= 0 || distance > (other.lane * car.lane < 0 ? Math.max(90, (car.v + other.v) * 3) : 45)) continue;
    const otherOffset = lateral(other);
    // Keep braking for the current lane until the car's footprint has moved clear.
    if (Math.abs(otherOffset - target) > 2.1 && Math.abs(otherOffset - offset) > 2.1) continue;
    // The car out of its home lane yields fully; the other eases off and only stops when very close.
    if (other.lane * car.lane < 0) {
      const outOfLane = passing || Math.abs(offset - car.lane) > 0.5;
      const floor = outOfLane || distance < 25 ? 0 : desiredSpeed * 0.6;
      speed = Math.min(speed, Math.max(floor, (distance - 12) * 0.3));
    }
    else speed = Math.min(speed, Math.max(0, other.v + (distance - 12) * 0.6));
  }
  return { passing, passOffset: passing ? -2 * car.lane : 0, speed };
}