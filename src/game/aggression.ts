// Player-selectable autopilot temperament. Pure data so the rules stay testable.
export type Aggression = "calm" | "normal" | "reckless";
export const AGGRESSION: { id: Aggression; label: string }[] = [
  { id: "calm", label: "Calm" },
  { id: "normal", label: "Normal" },
  { id: "reckless", label: "Reckless" },
];
export function aggressionProfile(a: Aggression) {
  if (a === "calm") return { speedFactor: 0.7, signals: false, ramming: false };
  if (a === "normal") return { speedFactor: 0.9, signals: true, ramming: false };
  return { speedFactor: 1, signals: true, ramming: true };
}
