<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Game logic lives in src/game: per-frame state is a mutable store (store.ts), road shape is pure math in road.ts; React state only for UI toggles. Why: avoids re-renders every frame.
- Offline: vite-plugin-pwa generateSW writes sw.js into dist/client; register only via src/lib/register-sw.ts (refuses dev/preview/iframe, ?sw=off). Why: avoids stale caches in preview.
- Multiplayer is client-authoritative over Cloud realtime broadcast+presence, one channel per room in src/game/Multiplayer.tsx, 6 Hz send-on-change (4 Hz for larger rosters); received poses use a timestamped interpolation buffer and stale peers are excluded from collisions. Why: smooth rendering without inflating network volume or blocking local driving on latency.
- Multiplayer contact and safe teleport placement use pure footprint math in src/game/multiplayer-math.ts; the local driving loop resolves only its own car. Why: keeps casual bumps immediate and rules independently testable without a game server.
- Radio lives in src/game/radio.ts: built-in stations are generated with Web Audio, live stations are external streams. Why: built-in stations must work offline.
- Autodrive lane decisions, merge clearance, predictive hazard braking and delta-timed right-pass patience use pure road-relative math in src/game/autodrive.ts with the player's actual lane and NPC offsets; manual input resets passing and patience. Why: keeps overtaking safety and immediate safe returns independently testable without changing steering feel.
- NPC signal reactions use pure helpers in src/game/traffic-reaction.ts and delta-timed crash progress from a captured lateral origin; collision shoves use a faster impulse-shaped skid. Why: preserves visible continuity and differentiates impacts from voluntary swerves.
- NPC overtaking uses snapshot-based direction-relative planning and critically damped lateral motion in src/game/npc-driving.ts; actual offsets inform safety, heading follows the motion tangent, and home lanes preserve direction. Why: smooth passes avoid order-dependent decisions and keep braking active until footprints clear.
- NPC pairs resolve oriented-footprint contact and forceful-hit roadside shoves through src/game/npc-collision.ts after movement and before rendering. Why: symmetric separation prevents overlap and contact-driven shoves reuse the existing wreck stopping physics.
- Horn audio is gesture-initialized Web Audio in src/game/signals.ts; horn and headlight flashes use discrete room broadcasts. Why: offline sounds and instant social signals without extra per-frame messages.
