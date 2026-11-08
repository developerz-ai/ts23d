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
`upper_arm`, `forearm`, `hand_*` (palm, fist, thumb, knuckles), `sword_*` (grip, guard, blade,
pommel), `stand_*`. Joints: `elbow`, `wrist`, `grip` (written to the manifest).

## Open questions
Stylised: the arm is a loft of ellipses, not anatomy. The fist is a ring round the handle so the
`grip` joint can measure its opening; the thumb and knuckles sit on it.
