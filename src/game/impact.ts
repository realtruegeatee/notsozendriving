// Momentum-based impact response shared by the player (incl. autopilot) and hit NPCs.
export const MASS: Record<string, number> = {
  "sedan-sports": 1.3, sedan: 1.4, "hatchback-sports": 1.1, suv: 2, taxi: 1.4, van: 2.2, truck: 3.2,
};
export const NPC_MASS = 1.4;
export const massOf = (id: string) => MASS[id] ?? NPC_MASS;

export type ImpactResult = {
  /** Speed (m/s) the player loses along the road. */
  playerSpeedLoss: number;
  /** Sideways velocity and yaw spin kicked into the player. */
  playerLateral: number; playerSpin: number;
  /** Seconds of reduced control for the player. */
  controlLoss: number;
  /** Multiplier for how hard the hit car gets thrown (1 = baseline). */
  npcThrow: number;
};

/**
 * closing: relative speed in m/s. sideways: 0 = straight rear/front hit, 1 = pure side hit.
 * side: which way the player gets pushed (-1/1). Momentum is split by mass.
 */
export function computeImpact(closing: number, sideways: number, playerMass: number, npcMass: number, side: number): ImpactResult {
  const v = Math.max(0, closing), s = Math.max(0, Math.min(1, sideways));
  const total = playerMass + npcMass;
  const playerShare = npcMass / total; // fraction of the velocity change the player absorbs
  const dv = v * playerShare * 2 * 0.6; // inelastic-ish collision, restitution ~0.2
  const dir = Math.sign(side) || 1;
  const hard = Math.max(0, v - 4);
  return {
    playerSpeedLoss: dv * (1 - s * 0.5),
    playerLateral: dir * dv * (0.25 + s * 0.6),
    playerSpin: -dir * Math.min(2.5, hard * playerShare * (0.04 + s * 0.12)),
    controlLoss: hard < 2 ? 0 : Math.min(3, hard * playerShare * 0.12 * (0.6 + s)),
    npcThrow: Math.max(0.5, Math.min(2.2, (playerMass / total) * 2)),
  };
}

export type PlayerImpact = { lateral: number; spin: number; control: number };
export const createPlayerImpact = (): PlayerImpact => ({ lateral: 0, spin: 0, control: 0 });

export function applyImpact(state: PlayerImpact, r: ImpactResult) {
  state.lateral += r.playerLateral;
  state.spin += r.playerSpin;
  state.control = Math.max(state.control, r.controlLoss);
}

/** Substepped decay: tyres scrub the slide, the spin damps, control returns. Returns sideways distance moved. */
export function stepPlayerImpact(state: PlayerImpact, dt: number) {
  let moved = 0, turned = 0;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const old = state.lateral;
    state.lateral *= Math.exp(-3 * h);
    moved += (old + state.lateral) * 0.5 * h;
    const oldSpin = state.spin;
    state.spin *= Math.exp(-2.2 * h);
    turned += (oldSpin + state.spin) * 0.5 * h;
    state.control = Math.max(0, state.control - h);
  }
  if (Math.abs(state.lateral) < 0.01) state.lateral = 0;
  if (Math.abs(state.spin) < 0.001) state.spin = 0;
  return { moved, turned };
}

/** 1 = full control, lower = steering and throttle partially lost. */
export const controlFactor = (state: PlayerImpact) => 1 - Math.min(0.85, state.control * 0.45);
