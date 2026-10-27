import { LANE, ROAD_HALF, roadX } from "./road";

export type RoadCar = { z: number; lane: number; speed: number; same: boolean; laneVelocity?: number; targetLane?: number };
// Forecast actual lateral motion, stopping at the NPC's intended lane rather
// than extrapolating a lane change across the entire road.
export function predictedLane(car: RoadCar, seconds: number) {
  const velocity = car.laneVelocity ?? 0;
  const projected = car.lane + velocity * Math.max(0, Math.min(3, seconds));
  if (car.targetLane === undefined || velocity === 0) return projected;
  return velocity > 0 ? Math.min(projected, Math.max(car.lane, car.targetLane)) : Math.max(projected, Math.min(car.lane, car.targetLane));
}
// true retains the original left-pass state; right passes must retain their side too.
export type Passing = boolean | "right" | "left-shoulder";
export const RIGHT_PASS = ROAD_HALF - 1;
export const RIGHT_PASS_WAIT = 1.5;
export const AUTOPILOT_MIN_SPEED = 3;
/** Early escape at cruising speed, using predicted gaps throughout the crossing. */
export function cruisingDodge(z: number, speed: number, currentLane: number, cars: RoadCar[]) {
  const approach = (c: RoadCar) => c.speed < 1 ? speed : c.same ? speed - c.speed : speed + c.speed;
  const threats = cars.filter((c) => {
    const gap = z - c.z;
    const closing = approach(c);
    return closing > 2 && gap > -4 && gap < Math.max(35, closing * 3.2) &&
      (Math.abs(c.lane - currentLane) < 2.2 || Math.abs(predictedLane(c, Math.max(0, gap / closing)) - currentLane) < 2.2);
  });
  if (!threats.length) return null;
  const candidates = [LANE, RIGHT_PASS, -LANE, -RIGHT_PASS]
    .filter((lane) => Math.abs(lane - currentLane) > 2.2)
    .sort((a, b) => Math.abs(a - currentLane) - Math.abs(b - currentLane));
  for (const target of candidates) {
    const crossingTime = 0.45 + Math.abs(target - currentLane) / 3;
    const clear = cars.every((c) => {
      const gap = z - c.z;
      // The car ahead may occupy our starting lane, but there must be time to leave it.
      if (threats.includes(c) && Math.abs(c.lane - target) >= 2.2 &&
          Math.abs(predictedLane(c, crossingTime) - target) >= 2.2 && gap > 6 + Math.max(0, approach(c)) * crossingTime) return true;
      for (const t of [0, crossingTime * 0.5, crossingTime, crossingTime + 0.8]) {
        const ourLane = currentLane + (target - currentLane) * Math.min(1, t / crossingTime);
        const futureGap = gap - approach(c) * t;
        if (Math.abs(predictedLane(c, t) - ourLane) < 2.2 && futureGap > -8 && futureGap < 10) return false;
      }
      const encounterTime = Math.max(0, gap / Math.max(1, approach(c)));
      if (encounterTime < crossingTime + 1.5 && gap > -8 && Math.abs(predictedLane(c, encounterTime) - target) < 2.2) return false;
      return true;
    });
    if (clear) return { lane: target, passing: target === LANE ? false : target === RIGHT_PASS ? "right" : target === -RIGHT_PASS ? "left-shoulder" : true } as { lane: number; passing: Passing };
  }
  return null;
}
export function planAutodrive(z: number, speed: number, passing: Passing, cars: RoadCar[], blockedFor = 0, dt = 0, currentLane = passing === "right" ? RIGHT_PASS : passing === "left-shoulder" ? -RIGHT_PASS : passing ? -LANE : LANE, maxSpeed = 34) {
  const overlaps = (c: RoadCar, lane: number, seconds = 0) => Math.abs(predictedLane(c, seconds) - lane) < 2.2;
  // A stopped wreck has no oncoming direction, even if it used to travel toward us.
  const stationary = (c: RoadCar) => c.speed < 1;
  const closing = (c: RoadCar) => stationary(c) ? Math.max(0, speed) : c.same ? speed - c.speed : Math.max(0, speed) + c.speed;
  const encounter = (c: RoadCar) => Math.max(0, (z - c.z) / Math.max(1, closing(c)));
  const ahead = cars.filter((c) => (c.same || c.speed < 1) && (overlaps(c, LANE) || overlaps(c, LANE, 1)) && z - c.z > -6 && z - c.z < Math.max(90, speed * 2.5));
  const blocker = ahead.filter((c) => c.speed < maxSpeed - 2).sort((a, b) => (z - a.z) - (z - b.z))[0];
  const blocked = (lane: number) => cars.some((c) => {
    const gap = z - c.z;
    const near = gap > -Math.max(8, (c.speed - speed) * 0.8) && gap < (c.same || stationary(c) ? Math.max(24, closing(c) * 1.2) : Math.max(70, closing(c) * 1.6));
    return near && (overlaps(c, lane) || overlaps(c, lane, Math.min(1.2, encounter(c))));
  });
  const leftBlocked = blocked(-LANE), rightBlocked = blocked(RIGHT_PASS);
  const mergeSafe = !cars.some((c) => {
    if (!overlaps(c, LANE) && !overlaps(c, LANE, 1.2)) return false;
    const gap = z - c.z;
    const aheadGap = c.same || stationary(c) ? 8 + Math.max(0, speed - c.speed) * 0.6 : Math.max(90, (speed + c.speed) * 3);
    const behindGap = 6 + (c.same || stationary(c) ? Math.max(0, c.speed - speed) * 0.8 : 0);
    const futureGap = gap - closing(c) * 1.2;
    return (gap > -behindGap && gap < aheadGap) || (futureGap > -behindGap && futureGap < aheadGap);
  });
  // A stationary car is an obstacle to drive around, not traffic to wait behind.
  const stationaryBlocker = !!blocker && blocker.speed < 1;
  // Patience only runs out while following nearby slow traffic, not on approach.
  const waiting = !passing && blocker && z - blocker.z >= 0 && z - blocker.z <= 40 && leftBlocked;
  const waited = waiting ? Math.min(RIGHT_PASS_WAIT, blockedFor + Math.max(0, dt)) : 0;
  let next: Passing = false;
  if (passing === "left-shoulder") {
    next = mergeSafe ? false : "left-shoulder";
  } else if (passing === "right") {
    // Return on the very first safe frame, not after clearing all distant traffic.
    next = mergeSafe ? false : "right";
  } else if (passing ? Boolean(blocker) || !mergeSafe : Boolean(blocker)) {
    if (!leftBlocked) next = true;
    else if (!rightBlocked && (passing || waited >= RIGHT_PASS_WAIT || stationaryBlocker)) next = "right";
    else if (passing && !mergeSafe) next = true;
  }
  // Direction comes from the NPC's home lane, not its overtaking offset.
  // Spot an oncoming overtaker early enough to steer out, rather than merely
  // braking in its path. Keep the existing right-pass state until merging is safe.
  const threatenedLane = next === "right" ? RIGHT_PASS : next === "left-shoulder" ? -RIGHT_PASS : next ? -LANE : LANE;
  const oncoming = cars.some((c) => !c.same && !stationary(c) && z - c.z > -8 &&
    z - c.z < Math.max(90, (Math.max(0, speed) + c.speed) * 3) &&
    (overlaps(c, currentLane) || overlaps(c, threatenedLane) || overlaps(c, currentLane, encounter(c)) || overlaps(c, threatenedLane, encounter(c))));
  const escapePathClear = (target: number) => !cars.some((c) => {
    const gap = z - c.z;
    const futureLane = predictedLane(c, 0.8);
    const inPath = Math.max(c.lane, futureLane) > Math.min(currentLane, target) - 1.9 && Math.min(c.lane, futureLane) < Math.max(currentLane, target) + 1.9;
    return inPath && gap > -Math.max(10, (c.speed - speed) * 1.0) &&
      gap < (c.same || c.speed < 1 ? 12 : Math.max(25, (Math.max(0, speed) + c.speed) * 0.9));
  });
  if (oncoming) {
    if (currentLane < 0 && mergeSafe && escapePathClear(LANE)) next = false;
    else if (!rightBlocked && escapePathClear(RIGHT_PASS)) next = "right";
    // A stationary car is an obstacle, not a moving head-on encounter.
    // If the shoulder is occupied, use a clear opposite lane to go around it.
    else if (!leftBlocked && escapePathClear(-LANE) && cars.some((c) => !c.same && c.speed < 1 && z - c.z > 10 && overlaps(c, currentLane))) next = true;
  }
  // Reckless but never parked: it always keeps creeping so it cannot get stuck.
  const CREEP = 3;
  // Speed from which we can still brake to the car's speed before reaching a safe gap; creep only with room.
  const follow = (carSpeed: number, gap: number, keep: number) =>
    Math.max(gap > keep + 3 ? CREEP : 0, Math.min(carSpeed + (gap - keep) * 0.7, Math.sqrt(carSpeed * carSpeed + 2 * 7 * Math.max(0, gap - keep))));
  let targetSpeed = maxSpeed;
  if (!next && blocker) targetSpeed = Math.min(targetSpeed, follow(blocker.speed, z - blocker.z, 9));
  const lane = next === "right" ? RIGHT_PASS : next === "left-shoulder" ? -RIGHT_PASS : next ? -LANE : LANE;
  // Brake for hazards in the destination lane and close hazards along the lane-change path.
  for (const c of cars) {
    const gap = z - c.z;
    const inTarget = overlaps(c, lane) || overlaps(c, lane, Math.min(1.2, encounter(c)));
    const futureLane = predictedLane(c, 0.8);
    const inPath = Math.max(c.lane, futureLane) > Math.min(currentLane, lane) - 1.9 && Math.min(c.lane, futureLane) < Math.max(currentLane, lane) + 1.9;
    // The stationary obstacle we are actively driving around must not park us
    // next to it; only its lane matters once we are committed to another one.
    if (c.speed < 1 && next && !inTarget) continue;
    // Accelerate decisively once clear, not while the rear bumper is still
    // following the blocker during a real (non-instantaneous) lane change.
    if (c.same && gap >= 0 && gap < Math.max(22, speed * 0.6) && overlaps(c, currentLane) && Math.abs(lane - currentLane) > 0.5) targetSpeed = Math.min(targetSpeed, follow(c.speed, gap, 5));
    if (gap < 0 || !(inTarget || (inPath && gap < 10))) continue;
    if (c.same || c.speed < 1) targetSpeed = Math.min(targetSpeed, follow(c.speed, gap, 7));
    else if (gap < Math.max(18, (speed + c.speed) * 0.9)) targetSpeed = Math.min(targetSpeed, gap < 25 ? 0 : CREEP);
  }
  // A stop request means the usual lanes have failed: try either roadside
  // before accepting contact. Check the entire crossing, not only its endpoint.
  let escapeLane = lane;
  let pushThrough = false;
  if (targetSpeed < AUTOPILOT_MIN_SPEED) {
    const alternatives = [LANE, RIGHT_PASS, -LANE, -RIGHT_PASS]
      .filter((target) => Math.abs(target - currentLane) > 0.5)
      .sort((a, b) => Math.abs(a - currentLane) - Math.abs(b - currentLane));
    const escape = alternatives.find((target) => !blocked(target) && !cars.some((c) => {
      const gap = z - c.z;
      // At rolling speed, turn away from a stopped bumper with room ahead.
      // Cars alongside and moving traffic still block the full crossing.
      if (stationary(c) && gap >= 4 && overlaps(c, currentLane) && !overlaps(c, target)) return false;
      const futureLane = predictedLane(c, 0.8);
      const inPath = Math.max(c.lane, futureLane) > Math.min(currentLane, target) - 1.9 && Math.min(c.lane, futureLane) < Math.max(currentLane, target) + 1.9;
      return inPath && gap > -Math.max(10, (c.speed - speed)) && gap < (c.same || stationary(c) ? 12 : Math.max(25, (Math.max(0, speed) + c.speed) * 0.9));
    }));
    if (escape !== undefined) {
      escapeLane = escape;
      next = escape === LANE ? false : escape > 0 ? "right" : escape === -RIGHT_PASS ? "left-shoulder" : true;
      // Keep steering room on a last-second escape; accelerate once clear.
      targetSpeed = Math.max(AUTOPILOT_MIN_SPEED, Math.min(maxSpeed, 8));
    } else pushThrough = true;
  }
  return { lane: escapeLane, targetSpeed: Math.max(AUTOPILOT_MIN_SPEED, targetSpeed), passing: next, blockedFor: next ? 0 : waited, pushThrough };
}

/** Steering plans still choose gaps, but traffic must not lower cruising speed. */
export function movingAutopilotSpeed(_trafficSpeed: number, _hazardSpeed: number, _pushThrough: boolean, cruiseSpeed = 34) {
  return cruiseSpeed;
}

/** Back off by rolling slower, not by stopping/reversing into traffic. */
export function movingBumpSpeed(backingOff: boolean, otherSpeed: number) {
  return backingOff ? Math.max(AUTOPILOT_MIN_SPEED, otherSpeed - 3) : Math.max(6, otherSpeed + 5);
}

export function laneOffset(x: number, z: number) { return x - roadX(z); }
// Stuck recovery: after crawling behind traffic for STUCK_AFTER s, back up briefly, then retry a pass.
export const STUCK_AFTER = 2;
export const REVERSE_FOR = 1.4;
export function stepUnstick(stuckFor: number, reverseLeft: number, speed: number, targetSpeed: number, dt: number) {
  if (reverseLeft > 0) {
    const left = Math.max(0, reverseLeft - dt);
    return { stuckFor: 0, reverseLeft: left, reversing: left > 0, retryPass: left === 0 };
  }
  const stuck = speed < 1.5 && targetSpeed < 4 ? stuckFor + dt : 0;
  if (stuck >= STUCK_AFTER) return { stuckFor: 0, reverseLeft: REVERSE_FOR, reversing: true, retryPass: false };
  return { stuckFor: stuck, reverseLeft: 0, reversing: false, retryPass: false };
}

// Impatience ramming: after RAM_AFTER s held up by a car ahead in its lane, autopilot rams it until clear.
export const RAM_AFTER = 3;
type RamCar = { z: number; lane: number; same: boolean; speed?: number };
export function ramTarget(z: number, lat: number, cars: RamCar[]) {
  let best: RamCar | null = null;
  for (const c of cars) {
    const ahead = z - c.z;
    if (!c.same || ahead < 0 || ahead > 30 || Math.abs(c.lane - lat) > 2.5) continue;
    if (!best || c.z > best.z) best = c;
  }
  return best;
}
export function stepImpatience(impatience: number, ramming: boolean, heldUp: boolean, hasTarget: boolean, dt: number) {
  if (!hasTarget) return { impatience: 0, ramming: false };
  if (ramming) return { impatience, ramming: true };
  const next = heldUp ? impatience + dt : Math.max(0, impatience - dt * 0.5);
  return next >= RAM_AFTER ? { impatience: 0, ramming: true } : { impatience: next, ramming: false };
}
// Repeated bumping: charge until contact, back off to a run-up gap, then charge again.
export const BUMP_CONTACT = 5.2;
export const BUMP_RUNUP = 10;
export function stepBump(backingOff: boolean, gap: number) {
  if (backingOff) return gap >= BUMP_RUNUP ? false : true;
  return gap <= BUMP_CONTACT;
}
