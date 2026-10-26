export type DrivingNpc = { s: number; lane: number; v: number; base: number; crashAge: number; passOffset: number; passing: boolean; offset?: number; aggressive?: boolean };
const lateral = (car: DrivingNpc) => car.offset ?? car.lane + car.passOffset;

/** Mix impatient drivers with slower traffic to create real catches and passes. */
export function npcCruisingSpeed(sameDirection: boolean, aggressive: boolean, random: number) {
  return aggressive ? 28 + random * 8 : sameDirection ? 12 + random * 7 : 17 + random * 6;
}

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
export function planNpcDriving(car: DrivingNpc, cars: readonly DrivingNpc[], desiredSpeed: number, allowPassing = true) {
  const direction = Math.sign(car.lane);
  const followingGap = car.aggressive ? 8 : 12;
  const offset = lateral(car);
  const gap = (other: DrivingNpc) => (other.s - car.s) * direction;
  const homeCars = cars.filter((o) => o !== car && Math.abs(lateral(o) - car.lane) < 2.1);
  const blocker = homeCars.filter((o) => gap(o) > 0 && gap(o) < (car.aggressive ? Math.max(85, car.v * 3) : 60) && o.lane * car.lane > 0 && o.v < desiredSpeed - 1).sort((a, b) => gap(a) - gap(b))[0];
  const passingLane = -car.lane;
  const passClear = !cars.some((o) => o !== car && Math.abs(lateral(o) - passingLane) < 2.1 && gap(o) > -18 && gap(o) < (o.lane * car.lane > 0 ? 55 : Math.max(car.aggressive ? 60 : 90, (car.v + o.v) * (car.aggressive ? 1.7 : 3))));
  const mergeClear = !homeCars.some((o) => gap(o) > -Math.max(8, 5 + (o.v - car.v) * 2) && gap(o) < Math.max(8, 6 + (car.v - o.v) * 2));
  // Only start a pass with room to merge back in front of the blocker, never into a queue.
  const mergeSlot = !!blocker && !homeCars.some((o) => o !== blocker && gap(o) > gap(blocker) - 2 && gap(o) < gap(blocker) + (car.aggressive ? 16 : 22));
  let passing = allowPassing && car.passing;
  if (passing && mergeClear && (!blocker || !passClear)) passing = false;
  else if (allowPassing && !passing && blocker && passClear && mergeSlot) passing = true;
  // Pull out before catching the blocker; accelerate once the actual footprint clears it.
  const passSpeed = car.aggressive ? Math.min(40, desiredSpeed + 4) : desiredSpeed;
  const clearOfBlocker = !blocker || Math.abs(lateral(blocker) - offset) >= 2.1 || gap(blocker) > Math.max(30, car.v * 1.5);
  let speed = passing && clearOfBlocker ? passSpeed : desiredSpeed;
  // Stuck beside traffic with the pass closing: drop back behind it so the merge opens up.
  if (passing && !passClear && !mergeClear && blocker) speed = Math.min(speed, Math.max(2, blocker.v * 0.6));
  const target = passing ? passingLane : car.lane;
  let swerve = false;
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
      // An overtaker coming at us in our lane: dive for the roadside instead of stopping.
      if (!outOfLane) { if (distance < 40) swerve = true; continue; }
      // Heading home keeps a crawl so the lane change can finish instead of freezing in the wrong lane.
      speed = Math.min(speed, Math.max(passing ? 0 : 1.5, (distance - 12) * 0.3));
    }
    else speed = Math.min(speed, Math.max(0, other.v + (distance - followingGap) * 0.6));
  }
  return { passing, passOffset: passing ? -2 * car.lane : 0, speed, swerve };
}