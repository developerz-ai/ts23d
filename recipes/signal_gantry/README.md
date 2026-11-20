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
Each arm's spectacle carries a spindle turning in `bearing_<track>_<arm>` (clamp band + bored boss
on the mast, LOD0/1): `connect: { as: 'hinge' }` to the bearing, and the arm lists the bearing in
`clearOf` (the spindle runs in its bore). LOD2 drops the bearing; the hub bears on the mast face.

## Modelling notes (2026-11 quality passes)
- Paint: century-old black weathered to a dark charcoal (#4f5254), so the soot reads on it.
- Wear (`wear.ts`): up-facing faces sun-faded toward a dusty grey and side faces to a mid charcoal
  (black on black never read), rust breaking through in patches (worst on up faces and low down),
  soot over each track from the knee braces up through the girder's lower metre, thinning to the
  deck (1.3 m either side of the track centre, clean steel between the tracks) and black soot plates on
  the plank soffit over each track, a pale worn tread path down the middle of the walkway, rust
  bleeds down the left post's outer corner angle, moss and splash on the footings. The walkway
  timber and galvanised rail take no paint wear.
- Detail: up-and-down rods from each mechanism case, cranks, a rod run along the walkway, then
  galvanised 1 in pipe rods down the front of the right post's outer face to a crank on the
  footing; riveted gusset plates at the girder's front nodes; galvanised hand rail; the ladder
  stands a quarter metre off the right post on stand-off brackets, its stiles to the ground;
  square-bar rungs. LOD2 posts are open frames (corner angles, battens, cap).
- Hero: a fixed low, close front-left view looking up (`hero.eye`/`target`): the girder's front
  lattice and lower chord with their soot, the knee braces, ladder and rods fill the frame.
- The static steel already merges into one draw; the remaining draws are the moving arm pivots
  (one each) and the lamp glow, which cannot merge.
- Triangles: 8.98k / 3.87k / 752 (two tracks) and 12.3k / 5.35k / 1.24k (four tracks). Bearing bosses and clamp bands keep only their visible faces (root face
  and bore are inside the pipe and round the spindle), gusset plates drop the face against the
  chord, LOD2 posts drop the 4 cm base plate, the foot batten and the cap's underside.
- Lamp glow: strength 1.5, a paraffin lamp lit warm behind the spectacle, not a white bloom.

Budget why: a lineside signal bridge 13 m tall spanning two or four tracks (up to 18 m wide) on two box-lattice posts and a lattice girder, with one pivoted arm pair per track; the 5k generic prop band is for a crate-sized object, and an open lattice cannot fold into a few hundred triangles without turning into solid slabs.

## Open questions
- Arms rest horizontal (stop) and drop one way to 60° (clear) with `oneWay` sway; the 30° approach
  position of three-position signals is passed through, not held.
- Girder depth and post section are photo estimates; no measured drawing was found online.
