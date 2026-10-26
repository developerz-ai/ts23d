# 09 — Kinds

**A kind is a library of builders a recipe calls, not a class the recipe fills in.** `facade(ctx, {...})` adds parts to the caller's `ctx`; the recipe stays in charge of layout, naming and LOD. `kind: '…'` on `defineAsset` is a free string for metadata. Source: `src/kinds/`.

Status as of 2026-10:

| Kind | Builders | Status |
|---|---|---|
| Building / tower | `facade`, `setbacks` | Shipped |
| | `roof` (hip, gable, pyramid, mansard) | Planned, M1 |
| Vehicle | `axle`, `trackRun`, `whyteAxles`, `propeller` | Shipped |
| | lofted bodies, fuselages, wings | Possible now with `loft`, `sweep`; no dedicated builder yet |
| Vessel | `hull` | Planned, M2 |
| Vegetation | `tree`, `trees` family, `treeReal`; presets `oak`, `pine`, `palm`, `birch`, `willow` | Shipped |
| Creature | `creature` | Planned, M4 |
| Scene | `ctx.use` (core), `heightfield` terrain | Shipped |
| Families | `defineFamily` (core): variants of any kind | Shipped |

## Building / tower

**Masses, then details.** Block the volumes with `box` or `prism`, then wrap them with `facade`.

`facade(ctx, opts)` runs a [split-grammar](#split-grammar) line along each side, per floor. Slots named `win`, `door`, `arch`, `shop` become inset panels; every other symbol stays wall.

| Option | Meaning |
|---|---|
| `prefix` | Part name prefix → `<prefix>_<side>_<floor>_<slot>` |
| `at`, `footprint` | Base centre and `[width X, depth Y]` of the mass it wraps |
| `floors`, `floorHeight` | Storeys, metres per storey |
| `grammar`, `ground?` | The line for every floor; `ground` overrides floor 0 |
| `sides` | Any of `front` (+X), `back`, `left` (+Y), `right` |
| `glass`, `frame?`, `windowRatio?` | Colours; window height as a fraction of the floor (default 0.6) |

`setbacks(ctx, { prefix, tiers, floorHeight, color, grammar, glass, detail })` stacks shrinking masses (Empire State, Chrysler-style). Each tier: `{ footprint, floors }`. Returns the top z for the spire. Pass `detail: ctx.lod < 2`.

### Split grammar

After CGA shape grammar (Müller et al. 2006). One string lays out one strip.

```
"pier:0.9 | {arch:2.5}* | door:3 | pier:~"
```

| Term | Meaning |
|---|---|
| `sym:1.2` | Fixed width, metres |
| `sym:~` / `sym:~2` | Stretch: shares the leftover, by weight (default 1) |
| `{a:1.4 \| b:0.6}*` | Repeat: as many whole copies as fit. Fixed sizes only; one repeat per line |

With no stretch term, repeat copies widen evenly to fill. Fixed terms longer than the strip → `T3D_GRAMMAR_OVERFLOW`. `split(src, length)` returns `{ symbol, start, size }[]`.

## Vehicle

Named parts follow the engine contract: `axle_*` and `wheel_*` spin about local Y; `prop_*` / `rotor_*` spin about their own axis.

| Builder | Adds | Notes |
|---|---|---|
| `axle(ctx, { name, at, radius, gauge, width, color, rps })` | Group `name` (spinning about Y) + `name_wheel_l`, `name_wheel_r` | Segments drop per LOD (24 → 12 → 6) |
| `trackRun(ctx, { side, y, length, wheels, radius, width, color, track })` | `road_wheel_<side>_<i>` (spinning), `track_<side>_top`, `track_<side>_bottom` | Tracked running gear, one side per call |
| `whyteAxles('4-4-0', { leading, driving, trailing, spacing })` | Nothing; returns `{ role, x, radius }[]` | Whyte notation → axle positions along X, leading end at +X |
| `propeller(ctx, { name, at, radius, blades, color, parent? })` | Group spinning about X + hub + blades | |

Domain-native params are the point: a loco recipe says `'2-6-2'`, not twelve wheel coordinates.

## Vessel (planned, M2)

`hull(ctx, { length, beam, draft, freeboard, color })`: lofted sections from naval-architecture params plus sheer and keel curves. Needs `loft` and `sweep`.

## Vegetation

`tree(ctx, { … })`: Weber–Penn botanical skeleton. Recursive branch levels (length, curve, split, taper per level) swept with `sweep`, leaves as cards on the foliage cells (`cutout` surface).

| API | Does |
|---|---|
| `tree(ctx, options)` | One tree into the caller's `ctx` |
| `trees` | A family: `trees.variant({ name, params: { species: 'pine', … } })` |
| `treeReal(params)` | `real` dimensions for the `proportions` gate |
| `SPECIES`: `oak`, `pine`, `palm`, `birch`, `willow` | Presets as data (`TreeParams`) |

The `oak`, `pine` and `palm` recipes are about 18 lines each. Wind is a crown `sway` for now. Planned: per-vertex wind weights; LOD2 impostors as crossed billboards from the foliage cells (today's are crude).

## Creature (planned, M4)

`creature(ctx, { skeleton: 'biped' | 'quadruped' | 'bird', height })`: SDF flesh over a skeleton, meshed with marching cubes (`sdf` primitive). **Stylised, not realistic.** Bones become named parts for posing. Realistic animals and people go through [`/neural`](08-neural-adapters.md).

## Scene

A scene is an asset whose `build` calls `ctx.use(other, { prefix, at, yaw, seed })`. No special kind is needed. Example (a street of varied houses): [02-dsl.md#composition-ctxuse](02-dsl.md#composition-ctxuse). Planned on top: layout helpers (street grids, scatter on a footprint) built on the split grammar.

Terrain for scenes and presentation dioramas: `heightfield({ rect: [x0, y0, x1, y1], cells: [nx, ny], height: (x, y) => z, color, strip? })`. `color` may be a function of `(x, y, z)` (ruts darker, slopes greener); `cells` is the LOD knob.

## Families and emitters

Any kind can be wrapped in a family: `defineFamily({ defaults, build })` → `variant` / `extend` ([02-dsl](02-dsl.md#families-one-build-many-assets)). Vehicles and buildings add `ctx.emitter` nodes for exhaust, steam, chimney smoke and muzzle flash ([02-dsl](02-dsl.md#emitters)).

Adding a kind: [architecture/adding-a-kind.md](../architecture/adding-a-kind.md).
