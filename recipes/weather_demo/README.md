# Weathering demo — four objects, new beside weathered

## Identity
A teaching asset for `weather()` (src/passes/weather.ts, docs/idea/18-weathering.md), not a scene:
four everyday objects, each built twice from the same function, the right-hand copy aged by
`weather(ctx, meshes, { seed, age, effects })`. What makes it read as weather, not noise: rust streaks
run *down* from the hinge bolts and the anchors, dust and bleach sit on tops, moss grows low on the
shaded side, mud splashes the bottom band, chips sit on convex edges, the handle is polished, dents
land on flat panels and the crate boards sag. Every effect's measured coverage is in
`out/weather_demo/manifest.json` → `weather`, and QA `weather` holds it to the declared %.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| steel door leaf (36 × 80 in) | 0.91 × 2.03 | WBDG door guide — standard 3'0" × 6'8" hollow metal door |
| door leaf thickness (1¾ in) | 0.045 | WBDG / SDI-100 hollow metal doors |
| 55 US gal drum, diameter × height | 0.572 × 0.851 | https://en.wikipedia.org/wiki/Drum_(container) |
| drum rolling hoops | 2, at ⅓ and ⅔ height | same |
| crate (generic shipping crate) | 0.8 × 0.8 × 0.62 | chosen: a Euro-pallet-width (0.8 m) crate |
| precast concrete block | 0.6 × 0.8 × 0.6 | chosen: a common interlocking/ballast block size class |

Sources:
- https://en.wikipedia.org/wiki/Drum_(container) — 55 gal drum dimensions
- https://www.wbdg.org/guides-specifications/building-envelope-design-guide/fenestration-systems/doors — door sizes

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| rust streaks under bolts | https://commons.wikimedia.org/wiki/Category:Rust_stains | streaks start under the fastener, run straight down, fade |
| moss on concrete | https://commons.wikimedia.org/wiki/Category:Moss_on_concrete | low, shaded side, near the ground |
| rusty drums | https://commons.wikimedia.org/wiki/Category:Oil_drums | rust starts at chimes and hoops |

## Parts the engine needs
`<object>_slab` (labelled plinth), `<object>_new_*` and `<object>_old_*` (door: leaf, frame, hinges,
handle · crate: crate, core (hidden inner box, not weathered) · block: block, anchors (lifting
anchors and form-tie plugs) · drum: shell, bungs).

## Budget
Budget why: a teaching board of eight objects (four new/weathered pairs on slabs), not one game prop; each weathered copy needs a vertex grid for its colour.

Weathering lives in vertex colour, so each weathered mesh is tessellated, with the resolution set per
object and per LOD: the door leaf (where streaks run) at 0.1 m, the frame at 0.3 m, the crate boards at
0.15 m, the block and drum at 0.1 m (LOD0). The crate's hidden inner core stays out of the pass. LOD2
keeps a coarse weathered grid (0.4–0.9 m) so the new / weathered difference survives at distance and
drops the labels, chimes, nails, corner irons, tie plugs and hinge bolts. About 21k / 6.5k / 2k
triangles (was 95k / 22k / 3.8k).
