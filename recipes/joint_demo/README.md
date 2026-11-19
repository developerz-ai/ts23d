# Joint demo — an arm on a stand, holding an arming sword

## Identity
A teaching asset for `ctx.joint` and the `joints` QA gate, not a character: a right arm held out
forward on a display stand, fist closed round an upright arming sword. Built from separate module
files the way a big character is (`arm.ts`, `hand.ts`, `sword.ts`, wired in `joint_demo.ts`), with
the three connections declared as joints — **elbow** (flush), **wrist** (flush) and **grip** (the
fist round the handle). Swap in a hand twice the size and the build fails with
`T3D_JOINT_MISMATCH`, naming both sizes and the scale fix (`joint_demo.test.ts`).

## Specs (adult male, 50th percentile; arming sword)
| Dimension | Value (m) | Source |
|---|---|---|
| forearm length, elbow → wrist | 0.26 | NASA MSIS anthropometry, forearm-hand length 0.47 m − hand 0.19 m |
| wrist breadth × depth | 0.064 × 0.044 | NASA MSIS (wrist breadth 6.0–6.6 cm) |
| hand breadth at the knuckles | 0.084 | NASA MSIS (hand breadth 8.4–9.0 cm) |
| grip diameter | 0.032 | Arming sword: grips 3–3.5 cm across; a power grip closes on 3–5 cm |
| grip length | 0.14 | One-handed arming sword: a hand's breadth plus room (12–15 cm) |
| blade length | 0.76 | Arming sword blades: 0.70–0.80 m |
| guard span | 0.18 | Cruciform guard, 16–20 cm |

Sources:
- https://msis.jsc.nasa.gov/sections/section03.htm — NASA-STD-3000 Man-Systems Integration Standards, vol. I §3 anthropometry
- https://en.wikipedia.org/wiki/Arming_sword — arming sword proportions

## Parts the engine needs
`shoulder`, `upper_arm`, `forearm`, `hand_palm`, `hand_fingers`, `hand_thumb` (LOD0/1),
`sword_*` (grip, guard, blade, pommel), `stand_base`, `stand_post`. Joints: `elbow`, `wrist`,
`grip` (written to the manifest).

## Build
- **Arm** (`arm.ts`): shaped rings, not plain ellipses: a deltoid cap sawn off flat (a study
  cast's cut, dark red), biceps over triceps, the arm narrowing above the elbow, the olecranon and
  both epicondyles on the shared elbow ring, brachioradialis and the flexor belly, a taper to the
  wrist with the ulna's knob short of it. Far LOD: the forearm keeps a belly ring, so it still
  tapers.
- **Hand** (`hand.ts`): a hammer grip, thumb side up. The palm squares from the wrist section to
  the knuckle line; four fingers each roll round the handle (knuckle, two joints, tucked tip); the
  thumb lies over them with its nail. The palm is tangent to the handle, which is what `grip`
  measures; far LOD: one finger slab.
- **Sword** (`sword.ts`): the flat faces the side view, the edge leads the knuckles. Blade 5 cm at
  the shoulders tapering to 3.3 cm, bevels, a fuller over 70 % of the length, a curved point;
  forged cross with flared quillons (span along X, in the blade's plane); cord-bound leather grip;
  scent-stopper pommel with a peen block.
- **Materials**: skin on the shared `face_skin` strip (`recipes/_lib/face/skin-strip.ts`), blade on
  `chrome`, cross and pommel on `brass`, grip on `leather`, stand on `iron`.
- **Wear** (one story: a working sword arm on a workshop stand): sun on the back of the arm, a
  paler inner side, red dry elbow and knuckles, grime thickest at the hand and between the fingers;
  seven thumbnail-sized nicks (4–8 mm deep) along the edges, grey clouds of old polish, rust
  specks in the fuller and against the cross; tarnished brass rubbed bright at the quillon ends
  and the pommel's belly; a grip sweat-dark where the fist holds it, its cord turns rubbed paler;
  the stand's post chipped to bare steel and rusting from the floor, its plate under an even film
  of dust with rust at the bolts (`weather()`, coverage in the manifest; the plate's top takes no
  chips or scratches: on its 10 cm grid each one bares a whole triangle).
- **Hero view**: a fixed camera from the arm's side (`hero` in `joint_demo.ts`).

## Open questions
Stylised: no veins, tendons or finger nails beyond the thumb's. The palm is a loft, so the
knuckle line is soft.
