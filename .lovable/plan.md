# Dashcam mode + realistic autopilot crash damage

## What you get
- **A third camera: Dashcam.** The view button cycles through Chase, First person and Dashcam (the V key does the same). Your choice is remembered.
- **A real dashcam look:** a wide fisheye-style lens mounted low behind the windshield with the hood visible, a running date and time stamp, current speed, a blinking REC dot, slight grain and vignette, and a little camera wobble on bumpy roads.
- **Crashes affect the autopilot too:** a hard hit makes the autopilot car spin, skid and slow down based on how hard and at what angle it was hit. For a few seconds it can't steer properly. Then it straightens out and drives on. Light bumps only nudge it.
- **Hit cars react realistically:** the impact force is split by speed, angle and car weight. A truck barely moves, a hatchback gets thrown. Side hits spin a car, rear hits push it forward, and head-on hits stop both cars hard.

## Technical details
- `store.ts`: `view` becomes `"chase" | "cockpit" | "dashcam"`. HUD toggle and `localStorage` cycle through all three.
- New `src/game/dashcam-overlay.tsx`: a CSS/DOM overlay with the timestamp, speed, REC dot, grain and vignette. It uses design tokens and only renders in dashcam view. Speed is written through `hudEls` so React doesn't re-render every frame.
- `Cars.tsx` camera: in dashcam view, set a low mount position, FOV around 95, mild barrel distortion via the post-processing vignette and a small FOV pulse on impacts, plus road-roughness wobble.
- New pure module `src/game/impact.ts`: computes a momentum-based impulse from relative velocity, contact normal and mass per car type, and returns linear and spin impulses for both cars. NPC crash motion uses it instead of the fixed severity numbers.
- New player damage state (`game.impact`: lateral velocity, spin, control loss timer), applied by substepped physics in the driving loop. While control loss is above a threshold, autopilot steering and throttle are scaled down. When it decays, autopilot resumes. This replaces the current 25% push-damping for hard hits only.
- Tests in `impact.test.ts`: heavier cars move less, side hits spin more than rear hits, momentum is conserved roughly, the autopilot regains control after decay, and stepping is frame-rate independent.
- Update `AGENTS.md` with the new impact module rule.
