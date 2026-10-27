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
- Autodrive steering uses pure road-relative math in src/game/autodrive.ts; cruise speed ignores traffic/hazard slowdowns, and Cars.tsx disables autopilot braking and shoulder drag. Why: maintain speed through passes and blockages; manual braking and impact physics stay independent.
- Car GLBs embed their paint atlas. Why: cached/offline models retain colors without a second texture download.
- NPC signal reactions use pure helpers in src/game/traffic-reaction.ts; avoidance steering and impact momentum are separate substepped modes in src/game/crash-physics.ts, with direction-relative yaw shared by rendering and contact. Why: evasive exits follow their heading while real impacts retain skids, and both stop naturally independent of frame rate.
- Gameplay capture uses canvas MediaRecorder and a single transient in-memory session in src/game/recording.ts, cleared on download/discard/unmount. Why: clips never reach storage or the network, and capture does not require screen-sharing permission.
- NPC overtaking and cruising profiles use snapshot-based direction-relative planning and critically damped lateral motion in src/game/npc-driving.ts; actual offsets inform safety, heading follows the motion tangent, and home lanes preserve direction. Why: testable aggressive profiles create passing encounters without order-dependent decisions or changing player safety.
- NPC pairs and player-to-NPC contacts use oriented-footprint math in src/game/npc-collision.ts after movement and before rendering; pair impacts select one wreck and give the survivor a timed home-lane recovery, while autopilot rear-to-front contacts start steering-led avoidance. Why: real contact gates reactions and separation prevents overlap without permanently wrecking both drivers.
- Horn audio is gesture-initialized Web Audio in src/game/signals.ts; horn and headlight flashes use discrete room broadcasts. Why: offline sounds and instant social signals without extra per-frame messages.
- Local horn and flash actions advance a traffic signal revision consumed by the driving loop; panic has a separate speed profile from spontaneous acceleration/braking. Why: manual and autopilot signals share NPC reactions without altering unrelated traffic moods.
- Signal-induced loss of control uses a dedicated pure motion helper in traffic-reaction.ts. Why: stronger panic impulses do not alter ordinary avoidance or impact launches.
- Scenery biomes ("worlds") are pure functions; per-world sky, fog and weather looks live in src/game/worlds.ts; biome math lives in src/game/road.ts and drive terrain height, colors and instancing in World.tsx. Why: deterministic, chunk-independent and testable.
- The car's top-speed ceiling and its engine power curve are pure functions of distance in src/game/speed.ts, used by both the driving loop and the autopilot planner. Why: drag alone would settle the car below a raised ceiling, so the curve must stay testable and shared instead of tuned inside the frame loop.
- Autopilot temperament (speed share, signals, ramming) is a pure profile in src/game/aggression.ts read via game.aggro. Why: one testable switch instead of scattered conditionals.
- Chaos and traffic temperament use pure profiles in src/game/chaos.ts read via game.chaos; Cars.tsx applies an active NPC subset and suppresses calm-mode mood swings, signal panic and reckless passing. Autopilot hazard plans retain an event-specific escape until rear clearance, check traffic and limit speed for steering room. Why: Zen stays calm and hazard steering cannot reset mid-obstacle or override traffic safety.
- Player and NPC impact response (mass split, spin, autopilot control loss) is pure momentum math in src/game/impact.ts; Cars.tsx only applies it. Why: realistic crash damage stays testable and frame-rate independent.
