# Sci-fi cargo container, 20 ft (`cargo_container_scifi`)

## Identity
An **original** futuristic skin on the **real** ISO 668 1CC envelope. Because the envelope is
real, the container stacks, twist-locks and loads like any 20 ft box, while reading as sci-fi
cargo. Signature features: an off-white chamfered frame; deep-teal armoured bays (six per side)
instead of corrugation, with vents and bolt rows; an orange accent band; a glowing green status
strip over the doors; a keypad; lock bars with cams; ISO corner castings at all eight corners.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| external length | 6.058 | https://en.wikipedia.org/wiki/ISO_668 · https://www.kscranegroup.com/posts/shipping-container-dimensions-types-and-corner-casting-guide/ |
| external width | 2.438 | same |
| external height | 2.591 (8 ft 6 in) | same |
| corner casting L × W × H | 0.178 × 0.162 × 0.118 | https://marine.albertjagger.co.uk/our-products/cargo-control/corner-castings/iso-corner-casting-top-left-fitment |
| casting centres across | 2.276 (= 2.438 − 0.162) | derived from the two rows above |
| door opening (ISO, typical) | ≈ 2.34 × 2.28 | modelled 2.11 × 2.26 between the posts (sill 0.182 → header 2.441 m) |

## Shape language
- **Big:** frame (four posts plus side and end rails) and the thin shell plates inside it. The
  shell is hollow, so the ajar doors show cargo crates inside.
- **Medium:** six armour bays per side (two raised panels each), seven roof ribs, a service panel
  on the blind end, door leaves with raised panels.
- **Small (LOD0):** vent slats on every other bay, bolts, lock-bar cams and handles, hazard
  bands, casting apertures, forklift pockets.

## Palette (sRGB)
Shell `#2f5c63` / `#244a50` · frame `#c9c8bf` · castings `#3a3d40` · accent `#d0661e` ·
hazard `#d9a421` + `#17181a` · status glow `#5dffb0`.

## Parts the engine needs
| Name | What | Motion |
|---|---|---|
| `container` | root group (yaw π, so the door end faces +X) | — |
| `door_l`, `door_r` | leaves, hinge axis just outside the rear posts | rest closed; one-way sway 90° outward (axis ∓Z); real ISO doors swing 270°, so the engine drives the full swing |
| `keypad` | child of `door_r` | glow |
| `status_light` | strip over the doors | glow; socket `status_lamp` (point light) |
| `casting_0…7` | ISO 1161 castings | sockets `twistlock_0…3` on the top four (`attach`, +Z) |
| `frame`, `body`, `hinge_l/_r`, `cargo` | static, AO-baked | — |

## Markings
ISO 6346-style ID for an invented owner code: `AXSU` / `204118 1` / `22G1` (the check digit 1 is
computed by the ISO 6346 rule), stencilled on the bay next to the doors on both sides and between
the lock bars of the right-hand leaf. Built with `text`.

## Open questions
- `clearOf` lists only the hinge pins (a real interlock); the clashes gate sweeps the real 0–90°
  sector and the recipe's `doorArc` check keeps the swing outward.
- Closed leaves fill the rear opening as on a real ISO box: sill (bottom end rail) to header (top
  end rail), between the corner posts (3 mm hinge-side clearance, 4 mm centre seam), outer face
  flush with the frame's rear face. The hinge axis sits 3.5 cm behind that face, so the leaves
  swing out clear of the posts; lock bars and hinge strips stand proud (overall length 6.13 m vs
  ISO 6.058 m; the `frame` measures hold the ISO numbers). The `gaps` QA gate keeps it closed.
- The crates inside are visible only with the doors open.
