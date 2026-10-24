# More Chaos

## What you get
1. **Chain-reaction pileups** - cars sent flying by a crash can hit other NPC cars and launch them too, so one hit can start a pileup. Only happens where you can see it.
2. **Road-rage NPCs** - now and then an NPC turns angry (marked with flashing red lights). It speeds up behind you, honks, flashes, tailgates and bumps you, then gives up after a while or if it crashes.
3. **Random road events** that happen ahead of you every so often:
   - Oil slick: a dark patch where cars that drive over it skid and spin (you included, more gently).
   - Falling rocks: boulders roll onto the road and cars that hit them crash.
   - Wrong-way driver: a car comes down your lane head-on, honking.
4. **Chaos level picker** (Zen / Normal / Mayhem) on the start and pause screens, saved like the other settings. Zen turns all of this off, and Mayhem makes it happen more often and hit harder.

## Technical details
- New `src/game/chaos.ts`: pure profile per level (pileup chance, rage rate, event intervals), read through the game store. It follows the same pattern as aggression.ts.
- Pileups: in `npc-collision.ts`, airborne/launched wrecks keep their collision checks and pass a scaled impulse to the car they hit, which reuses the impact physics in `crash-physics.ts`. Visibility band gating stays in place.
- Road rage: a new mode in `npc-driving.ts` that targets the player's lane and gap, uses horn/flash through `signals.ts`, and has a timed exit.
- Events: new `src/game/road-events.ts` (pure spawn/expiry and hit tests over road distance), drawn in a small `RoadEvents.tsx` and read by Cars.tsx for skids and crashes. A wrong-way driver is an NPC whose lane is flipped.
- Tests for each helper: level profiles, pileup impulse transfer, rage start and stop, and event hit tests. Update AGENTS.md and roadmap.md.
