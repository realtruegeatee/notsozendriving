// Shared mutable game state (read/written every frame, never drives React renders).
export const game = {
  started: false,
  paused: false,
  night: false,
  cruise: true,
  x: 0,
  z: 0,
  y: 0,
  yaw: 0,
  speed: 0,
  distance: 0,
  shake: 0,
  view: "chase" as "chase" | "cockpit",
};

// Multiplayer connection info shown in the HUD.
export const net = {
  id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()),
  status: "offline" as "offline" | "connecting" | "online",
  roster: [] as string[],
  onRoster: null as null | (() => void),
};

// Player-selectable cars (files in public/models).
export const CARS = [
  { id: "sedan-sports", label: "Sport" },
  { id: "sedan", label: "Sedan" },
  { id: "hatchback-sports", label: "Hatch" },
  { id: "suv", label: "SUV" },
  { id: "taxi", label: "Taxi" },
  { id: "van", label: "Van" },
  { id: "truck", label: "Truck" },
] as const;
export type CarId = (typeof CARS)[number]["id"];

export const input = {
  throttle: 0,
  brake: 0,
  steer: 0,
  keys: {} as Record<string, boolean>,
};

export const hudEls: { speed: HTMLElement | null; dist: HTMLElement | null } = {
  speed: null,
  dist: null,
};

// Driving feel — tune these, not the model.
export const FEEL = {
  ACCEL: 9,
  BRAKE: 18,
  DRAG: 0.06,
  MAX: 34,
  CRUISE: 22,
  TURN: 1.3,
  ASSIST: 1.6,
};
