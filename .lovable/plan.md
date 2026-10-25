# Bug fixes: autopilot, dashcam, NPC behaviour

## Autopilot crashes / getting stuck
- **Damage piling up:** the new crash damage is applied again on every frame the cars keep touching. So a single long scrape can stack into a huge spin and leave the autopilot helpless. Damage will now only count once per new hit.
- **Recovery after a hit:** while control is reduced, the autopilot still steers back toward its lane, just more weakly. It will no longer drift off the road while dazed.
- **Getting stuck behind a wreck or rock:** if the autopilot crawls behind a stopped car or a rock, it now goes around it right away instead of waiting until it gets impatient and rams.

## Dashcam view
- Move the timestamp, speed and REC overlay so it never sits under the gas and brake pedals or the top buttons on a phone screen.
- Hide the overlay on the start and pause screens.
- Adjust the camera position so the hood is clearly visible and the camera is never inside the car body. Limit how far it tilts on big hits so it doesn't get disorienting.

## NPC behaviour
- **Rocks causing traffic jams:** cars that can't steer around a rock currently brake to a full stop and stay there. They will slow to a crawl, steer past the rock once there's room, then speed up again.
- **Jitter while dodging:** the dodge target can flip from side to side between frames. Each car will keep the side it first picked until it is past the rock.
- **Oncoming cars:** a car dodging a rock won't steer into a car coming the other way. If that side is taken, it brakes instead.

## How it gets checked
- Add small tests: a hit counts once, the autopilot regains its lane, rock dodging keeps its side, and a stuck car eventually gets past.
- Run all game tests, then drive in the preview at phone size in Dashcam view to check the overlay and camera.

## Technical details
- `Cars.tsx` player contact: call `applyImpact` only on fresh contact (`n.contactLeft <= 0` before resolving), not just `!wasCrashing`.
- Autopilot steering under control loss: blend `steerIn` toward the lane-keeping command with a minimum share of about 0.4, instead of scaling it down.
- `autodrive.ts`: treat stationary obstacles and rocks as immediate pass targets.
- `chaos.ts`: `dodgeEvent` takes a remembered side (stored on the NPC as `dodgeSide`) and an oncoming-occupancy check. `rockAhead` braking targets a crawl speed (about 4 m/s) instead of 0.
- `styles.css` / `dashcam-overlay.tsx`: use safe-area bottom offsets above the pedal row, and render only when the game has started and isn't paused.
