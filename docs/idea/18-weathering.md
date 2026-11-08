# Weathering: random, where, how, and the %

A new object is the exception. A door that has hung outside for twenty years has rust running
*down* from its hinge bolts, chalky paint, chipped edges, a polished handle, mud splashed along the
bottom and a dent where a trolley hit it. `weather()` puts that wear where physics would, from the
geometry the recipe already built, and measures how much it put there. Four controls:

| Control | What it means | How it works |
|---|---|---|
| **random** | `seed` | hashed-lattice value noise in world space; no `Math.random`, same bytes every run, the same patches at LOD0 and LOD1 |
| **where** | `where: 'shaded & wet'` | selector expressions over geometry (below) |
| **how** | `chips`, `rust` (+`streaks`), `dust`, `moss`, `mud`, `bleach`, `scratches`; `dents`, `sag`, `warp` | vertex colour moves toward the effect's look; shape effects deform LOD0/1 |
| **%** | `amount: 0.15` | exactly that fraction of the eligible *area* is covered, measured, reported, gated |

## The API

```ts
import { weather } from '@developerz.ai/ts23d';

// ctx form: named meshes in one space (a door, its frame, its hinges, its handle)
const m = weather(ctx, { leaf, frame, hinges, handle }, {
  name: 'door', seed: 11, age: 0.8, climate: 'wet',
  fasteners: [{ at: [0.03, -0.41, 0.28], radius: 0.012 }],   // or part globs: ['bolt_*']
  touched: ['handle'],
  effects: {
    chips: { where: 'convex-edges', amount: 0.15 },
    rust: { where: 'below-fasteners | fasteners', amount: 0.3, streaks: true },
    dust: { where: 'up-facing', amount: 0.3 },
    dents: { where: 'exposed-panels', count: [2, 5], depth: 0.01 },
    moss: { where: 'shaded & wet & !down-facing', amount: 0.1 },
    scratches: { where: 'touched', amount: 0.05 },
    mud: { where: 'ground-near', amount: 0.2 },
    bleach: { where: 'up-facing | sunlit', amount: 0.2 },
    sag: { where: 'long-spans', max: 0.005 },
  },
});
ctx.part('door_leaf', m.leaf);

// mesh form: one mesh, returns the measurements
const { mesh, coverage } = weather(crate, { seed: 3, age: 0.5, climate: 'dry' });
```

`age` (0 new … 1 decades outdoors) scales an effect's amount when the recipe leaves it out;
`climate` adds the climate's typical effects under the explicit ones (dry: dust, bleach, chips,
scratches · wet: streaked rust, moss, mud, chips · coastal: streaked rust, bleach, chips, salt ·
snow: streaked rust, mud, chips, bleach · desert: dust, bleach, chips, sand). `under` is what chips
reveal (bare steel by default; raw wood or aggregate for others). `imperfect(mesh, { dents, sag,
warp })` is the deformation half on its own.

## Where: selectors from geometry

| Selector | Reads |
|---|---|
| `up-facing` · `down-facing` · `side-facing` | vertex normal Z |
| `convex-edges` · `cavities` | signed convexity of the welded surface (neighbours' slope against the averaged normal), edges grown one vertex ring |
| `ground-near` | height above `ground` (default: the target's lowest point) within `groundBand` (0.35 m) |
| `shaded` · `sunlit` | exposure = ½ sky visibility (12 fixed cosine rays, the ground blocks below the horizon) + ½ direct sun (n·sun, shadow ray). Default sun from the back-left, high; set `sun` |
| `wet` | low (a wider band in wet climates), creases, tops |
| `fasteners` · `below-fasteners` | declared spots / part globs; the strip just beneath each |
| `touched` | declared spots / part globs (handles, steps) |
| `long-spans` | slender horizontal pieces ≥ 0.6 m (planks, beams, rails) |
| `exposed-panels` | planar patches (≈15° normal buckets) larger than (2 × dent radius)², not facing down |

Combine with `&` (min), `|` (max), `!` (1 − x) and parentheses. A vertex is eligible at weight ≥ 0.5.

## How: effects

Colour effects are laid down in a fixed order — bleach, chips, scratches, rust, moss, mud, dust —
each moving the vertex colour toward its look by `strength` with a little seeded variation. Each is
*scored*: noise plus what makes physical sense (the sharpest edges chip first, the lowest surfaces
get muddy first, moss favours low ground). **Rust streaks** follow gravity: from every rusted vertex
a path steps to the steepest-falling neighbour (with a seeded meander), never sideways or up; where
it runs off an edge (a bolt head, a hinge plate) it drips straight down onto the first surface within
10 cm and keeps running there, fading over `streakLength`.

Dents are smooth radial pushes (cos² falloff) into exposed panels, placed in each panel's own plane
by a seeded stream that never reads the tessellation, so LOD0 and LOD1 dent the same spots. Sag is
a parabola along each long span, ∝ length², capped at `max`; warp is a seeded sideways bow. Welded
vertices move together (no cracks) and get fresh normals so the dent catches light. LOD2 never
deforms: the far silhouette stays clean.

Vertex colour needs vertices: `resolution` (default `[0.04, 0.1, 0]` m per LOD) tessellates the
weathered meshes by red-green refinement — every edge longer than the limit splits at its midpoint,
decided by length alone, so co-located hard edges split identically and never crack. This is the
cost knob: `weather_demo` (four weathered objects at 5 cm) is ~95k triangles at LOD0, ~22k at LOD1. LOD2 keeps the plain
mesh; its corners carry the same masks.

## The %

Every eligible vertex carries its area (a third of each incident triangle). Vertices are taken
best score first until their area reaches `amount` × eligible area; the last one partially. The
pass then measures the covered fraction independently and reports, per target and effect:

```json
"weather": { "chips": { "target": 0.31, "actual": 0.31, "eligible": "convex-edges", "area": 6.68,
  "by": { "door_old": { "target": 0.35, "actual": 0.35, "area": 1.45 } } } }
```

(`manifest.json`, LOD0; shape effects report depth / max as `target` and the measured displacement
as `actual`, dents also `count`.) Because coverage is exact by construction, a miss means a geometry
or selector problem, which is what the gate is for.

## QA `weather`

Runs when a recipe weathered something (default gate, every LOD):

| Code | Fails when | Fix |
|---|---|---|
| `T3D_WEATHER_COVERAGE` | \|actual − amount\| > tolerance (0.02) | more tessellation, or a wider `where` |
| `T3D_WEATHER_NO_SURFACE` | an effect found nothing eligible (shape effects: LOD0/1) | check the selector / fasteners / panel size |
| `T3D_WEATHER_MISPLACED` | > 0.5% of an effect sits where physics forbids: dust or bleach facing down, moss on a dry underside above the ground band, mud higher than max(1 m, 3 × band) | restrict `where` |
| `T3D_WEATHER_STREAK_UP` | any streak segment rises | a pass bug — report it |
| `T3D_WEATHER_SHAPE` | dent deeper / sag or warp past its max, dent count outside its range, any deformation at LOD2 | lower it or declare it |

The plausibility numbers are measured by the pass while it paints (it knows which vertices it
touched) and judged by the gate; the tests prove the pass reports honestly (dust only on up-faces,
streaks only descend, coverage within ±2%, determinism, dents only at LOD0/1).

## Not yet

Cracks, water stains under sills as their own effect, a `_WEAR` vertex attribute for engine
shaders, texture-space (not vertex) masks for crisp chips on low-poly meshes, bent fenders and cloth
wrinkles (roadmap "Realism").
