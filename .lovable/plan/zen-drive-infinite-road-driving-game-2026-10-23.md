# Zen Drive — infinite road driving game

A calm, endless driving game. You cruise down a winding road with gentle traffic, switch between day and night, and the car handles smoothly. Built mobile-first (you're on a phone), works on desktop too.

## Experience
- **Start screen**: game title, "Day" / "Night" toggle, Start button. Soft ambient music optional (mute button).
- **Driving**: endless road that gently curves and rolls through low hills, trees, rocks, street lamps, and distant mountains. The road keeps generating ahead and cleans up behind.
- **Traffic**: NPC cars in both lanes — same-direction cars you can overtake, oncoming cars in the other lane. Soft bump on contact (slow down, no crash/game over) to keep it zen.
- **Day / Night**: switchable anytime from a small button.
  - Day: warm sky, soft sun, long shadows, light haze.
  - Night: deep blue sky, stars, glowing street lamps, car headlights and red taillights on all cars.
- **HUD (minimal)**: speed, distance driven, day/night toggle, pause. No timers or scores pushing you.

## Controls
- **Mobile**: hold right side = gas, left side = brake; tilt-free steering via a smooth on-screen steering slider/drag at the bottom (drag left/right). Optional "auto-cruise" toggle so you only steer.
- **Desktop**: WASD / arrow keys.

## Driving feel
- Smooth acceleration curve, gentle top speed, steering that softens at high speed, slight body roll and lean, camera that lags softly behind and widens field of view as you go faster. All motion is frame-rate independent so it feels the same on any phone.
- Car gently auto-centers in its lane when you let go of steering.

## Look
Stylized low-poly, soft pastel palette (not neon). Real low-poly CC0 car models (Kenney/Quaternius car kit) for player and traffic in varied colors; low-poly trees and rocks. Light fog blends the horizon so the infinite road feels endless and calm.

## Technical details
- React Three Fiber + drei, client-only route at `/` (`ssr: false`).
- Road built from recycled segments along a procedural spline (sum-of-sines curvature + elevation); player position tracked as distance-along-road + lateral offset, so the world is infinite without floating-point drift (world recentered periodically).
- Scenery and NPCs pooled and respawned ahead of the player; NPCs move along the same spline with simple lane-following and speed matching.
- Day/night = swap of light rig, sky, fog color, and toggling emissive lights; lamp lights faked with emissive + a few pooled point lights to stay within mobile budget.
- Car models downloaded into `public/models` and validated before use; Suspense inside Canvas.
- Pixel ratio capped, shadows 1024, under ~100 draw calls.
- Verify with screenshots in both modes, at phone size.
