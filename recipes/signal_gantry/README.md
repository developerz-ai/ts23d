# Semaphore signal bridge — US lattice type, c. 1905–1915 (`signal_gantry`, `signal_gantry_4`)

## Identity
A riveted lattice signal bridge spanning the main tracks, carrying one pipe mast per track with
lower-quadrant semaphore arms (Union Switch & Signal Style B era, from c. 1905). `signal_gantry`
spans two tracks; `signal_gantry_4` spans four, as in the 1909 photo below. Signature features:
box-lattice posts on concrete footings, a lattice girder with knee braces at the corners, a plank
walkway with a hand rail, slender masts with ball finials, red blades pointing right, spectacles
with red/green roundels in front of oil lamps.

## Specs
| Dimension | Value | Source |
|---|---|---|
| vertical clearance under the bridge | 22 ft (6.706 m) min. over top of rail | Pennsylvania Code §33.41 and other state codes, https://regulations.justia.com/states/pennsylvania/title-52/part-i/subpart-b/chapter-33/subchapter-b/safety-bridges-tunnels-trestles-and-switches/section-33-41 |
| track centres | 13 ft (3.962 m), the common US double-track spacing | https://en.wikipedia.org/wiki/Track_spacing |
| post to adjacent track centre | ≥ 8 ft 6 in (2.591 m) for signal posts | Illinois Admin. Code 92 §1500 (side clearance of semaphore posts), search summary; ilga.gov blocks fetchers |
| blade length | 4–5 ft; 5 ft (1.524 m) used | https://www.railroadsignals.us/signals/sem/ ; GWR 5 ft arms, https://en.wikipedia.org/wiki/Railway_semaphore_signal |
| lower-quadrant positions | 0° stop, 30° approach, 60° clear (down) | https://www.railroadsignals.us/signals/sem/ |
| mast base below first arm on a bridge | ≈ 3 ft | same (Picture 57) |
| girder depth, post section, walkway | 1.5 m, 0.6 × 0.45 m, 1.0 m | ESTIMATE, scaled from the 1909 photo against the 13 ft track centres |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| front (driver's view), 4 tracks | https://commons.wikimedia.org/wiki/File:Signal_bridge_-_Discs_%26_semaphores_1909.jpg | lattice posts, knee braces, masts with blades right of the mast |
| US&S Style B (museum) | https://www.irm.org/?p=19319 | lower-quadrant arm and spectacle |
| detail, semaphore anatomy | https://www.railroadsignals.us/signals/sem/ | blade, roundels, spectacle, lamp, mechanism |

## Parts the engine needs
`arm_<track>_home`, `arm_<track>_distant` (pivots, one-way `sway` about −X: the blade drops 0–60° and returns) ·
`lamp_*_lens` (glow) · sockets `lamp_*_light` (light) · `post_l`, `post_r`, `girder`, `mast_*`.

## Open questions
- Arms rest horizontal (stop) and drop one way to 60° (clear) with `oneWay` sway; the 30° approach
  position of three-position signals is passed through, not held.
- Girder depth and post section are photo estimates; no measured drawing was found online.
