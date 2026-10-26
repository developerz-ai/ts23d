# 02 — The DSL

**An asset is a named export: `defineAsset({ …, build(ctx) })`.** `build` is a plain TypeScript function. It adds named parts to `ctx`; the compiler runs it once per LOD.

## Layers

**Every layer is plain TypeScript. You extend the DSL by writing functions; there is no plugin API to learn.**

| Layer | Shape | Example |
|---|---|---|
| Primitive | `(options) => Mesh` | `box`, `lathe`, `prism`, `beam`, `planar`, `sweep`, `loft`, `heightfield` |
| Component | `(ctx, params) => void`: adds named parts | your `bogie(ctx, …)`, `chimney(ctx, …)` |
| Kind | A library of components | `facade`, `setbacks`, `axle`, `trackRun` |
| Family | `defineFamily({ defaults, build(ctx, p) })` | `t34` with `turret: '1941' \| '1943'` |
| Asset | `defineAsset(…)` or `family.variant(…)` | `t34_1943` |
| Scene | An asset that calls `ctx.use(other, …)` | a street, a rail yard |

## Primitives (shipped)

| Primitive | Key options | For |
|---|---|---|
| `box` | `size`, `at`, `strip`, `omit` | Hulls, walls, crates |
| `lathe` / `cylinder` | `profile` or `radius`+`length`, `segments`, `axis` | Wheels, boilers, domes |
| `prism` | `profile`, `depth`, `plane: 'xy'\|'xz'\|'yz'` | Sloped armour, gables, fins |
| `beam` | `from`, `to`, `width`, `segments?`, `up?`, `caps?` | Girders, rods, rails |
| `planar` | `points`, `doubleSided?` | Plates, decks, signs |
| `sweep` | `section` (polygon or `{ radius, segments }`), `path`, `scale?` (taper), `twist?`, `caps?` | Branches, pipes, handrails, cables. Parallel-transport frames; triangles = 2·S·(P−1) + S per cap |
| `loft` | `rings` (Vec3 rings), `capStart?`, `capEnd?`, `uv?` | Trunks, fuselages, bottles. `ringXY(centre, rx, ry, …)` builds a ring, with wobble |
| `heightfield` | `rect`, `cells`, `height(x, y)`, `color` | Terrain, dioramas |

Planned: `tiled`, `cell`, `sdf`, a `lattice` truss.

## Why TypeScript, not JSON

| Need | JSON recipe | TS recipe |
|---|---|---|
| 12 windows per floor, 9 floors | Spell out 108 entries, or invent a repeat syntax | `for` loop |
| Reuse a wheel across 8 vehicles | Invent `$ref` / templating | Import a function |
| Vary 10 houses on a street | Invent a variant system | `ctx.use(house, { seed })` |
| Catch `colr: …` before build | Schema validator, if anyone wrote one | `tsc` red squiggle |
| Agent fluency | Must learn your schema | Already writes TS all day |

Full reasoning and rejected options: [ADR 002](../decisions/002-typescript-not-json.md).

## Anatomy

```ts
import { box, cylinder, defineAsset, hex } from '@developerz-ai/ts23d';

export const lamp_post = defineAsset({
  name: 'lamp_post',            // snake_case; becomes the GLB name and root node
  kind: 'prop',                 // free string; kinds are libraries, not a closed enum
  description: 'cast-iron street lamp',
  sources: ['https://example.org/lamp-drawing.pdf'],
  real: { length: 0.4, width: 0.4, height: 3.5 },  // proportions gate: LOD0 within ±5%
  tags: ['street', 'victorian'],
  budget: { triangles: [800, 300, 60] },   // per LOD; QA fails above
  seed: 1,                      // default 1
  build(ctx) {
    const iron = hex('#2b2b2e');
    ctx.part('base', box({ size: [0.4, 0.4, 0.3], color: iron, strip: 'iron', omit: ['bottom'] }));
    ctx.part('pole', cylinder({ radius: 0.06, length: 3.2, segments: [12, 8, 6][ctx.lod] ?? 6,
                               at: [0, 0, 1.9], color: iron }));
  },
});
```

One module may export several assets; `t3d` builds every one. No default exports.

## `defineAsset` fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | `[a-z][a-z0-9_]*`, else `T3D_RECIPE_INVALID` |
| `kind` | `string` | yes | Written to glTF `extras.kind` |
| `budget.triangles` | `[lod0, lod1, lod2]` | yes | Enforced by the `triangle-budget` gate |
| `build` | `(ctx) => void` | yes | Synchronous |
| `real` | `{ length, width, height, tolerance?, measures? }` | no | Real overall dimensions, metres (X, Y, Z). The `proportions` gate holds LOD0 to them, default ±5% |
| `real.measures` | `Measure[]` | no | Spec-sheet dimensions checked on LOD0 by the `measures` gate, default ±2%. See below |
| `sources` | `string[]` | with `real` | Where the numbers came from: spec sheets, rosters, drawings, photos. The type says "required for `real`"; as of 2026-10 nothing enforces it |
| `checks` | `Check[]` | no | The recipe's own physical intent, run by QA at every LOD ([below](#checks-declared-intent)) |
| `description`, `tags` | `string`, `string[]` | no | Gallery / search metadata |
| `seed` | `number` | no | Default `1`; overridden by `compile(…, { seed })` or `ctx.use(…, { seed })` |

## The `ctx` API

| Member | Does |
|---|---|
| `ctx.lod` | `0` hero · `1` mid · `2` far. Read it and drop detail; never decimate |
| `ctx.seed` | The seed this compile runs with |
| `ctx.rng` | Seeded PRNG: `next()`, `range(a,b)`, `int(a,b)`, `pick(xs)`, `fork(name)` |
| `ctx.part(name, mesh, opts?)` | Add a named part. `mesh` may be `null` (empty pivot) |
| `ctx.group(name, opts?)` | An empty pivot other parts parent to (`part(name, null, opts)`). Pivots and parts with `motion` survive export as nodes; static parts merge into them ([batching](03-ir.md#batching-parts--pivots)) |
| `ctx.use(asset, opts)` | Instance another asset at this LOD: the composition primitive |
| `ctx.emitter(name, opts)` | A particle source as a named node ([below](#emitters)) |
| `ctx.socket(name, opts)` | An attachment point as a named node ([below](#sockets)) |

`PartOptions`:

| Option | Meaning |
|---|---|
| `at` | Pivot in the parent's space. The mesh is authored relative to it |
| `parent` | Name of an existing part/group. Parents first, else `T3D_PART_UNKNOWN` |
| `yaw` | Rotation about local Z, radians |
| `motion` | `{ kind: 'spin', axis, rps }` · `{ kind: 'slide', offset, hz }` · `{ kind: 'sway', axis, degrees, hz }` (turret scan, gun elevation, tree wind, a door). Baked to a 2 s `run` clip only when exporting with animations ([03](03-ir.md#glb-layout)) |
| `surface` | `'opaque'` (default) · `'cutout'` · `'glass'` · `'translucent'` ([below](#surfaces)) |
| `clearOf` | Part names this moving part may pass through by design (an axle in its bearing, a crosshead in its guide). Exempts them from the `clashes` gate |

Rules the compiler enforces:

- Part names are unique per asset (`T3D_PART_DUPLICATE`). Suffix loop indices: `wheel_0`, `wheel_1`.
- A part can't have both `yaw` and `motion` (`T3D_RECIPE_INVALID`). Yaw the parent group, move the child.
- Names are snake_case (QA gate `part-names`). Names are the contract with the engine: `axle_*`, `door_*`, `rotor_*`.

## Fidelity: `real.measures`

**Overall size is not enough; players notice the driver diameter.** Each `Measure` names one number from a source and how to measure it on the model:

| Field | Meaning |
|---|---|
| `label` | Human name: `'driver diameter'`, `'gauge'` |
| `value` | Metres, from the source |
| `axis` | `'x'` · `'y'` · `'z'` |
| `parts` | Extent of these parts' union along `axis`. Prefix match: `'axle_driver_0'` includes `axle_driver_0_wheel_l` |
| `between` | Or: centre-to-centre distance of exactly two parts along `axis` (gauge, wheelbase) |
| `tolerance` | Relative, default 0.02 |
| `source` | Which of `sources` the number came from |

```ts
real: {
  length: 6.68, width: 3.0, height: 2.45,
  measures: [
    { label: 'turret width', value: 2.0, axis: 'y', parts: ['turret_body'], source: 'hull drawing' },
    { label: 'road wheel diameter', value: 0.83, axis: 'z', parts: ['road_wheel_l_0'] },
  ],
},
```

A failing measure means the model is wrong. **Rebuild the part from the number; never edit the spec to pass.** Gate details: [06-qa](06-qa.md).

## Detail: build once, place N times

`place(mesh, { at, yaw, pitch, roll, scale })` rigidly transforms a mesh; `merge` joins meshes into one part. Author a rivet, hatch or bracket once in local space, then place it along a seam:

```ts
import { cylinder, merge, place } from '@developerz-ai/ts23d';

const rivet = cylinder({ radius: 0.012, length: 0.01, segments: 6, axis: 'x', color: iron });
const rivets = merge(Array.from({ length: 24 }, (_, i) => place(rivet, { at: [3.0, -1.2 + i * 0.1, 1.1] })));
if (ctx.lod === 0) ctx.part('glacis_rivets', rivets);
```

Lower level: `affine(placement)`, `frame(u, v, w, at)` (an explicit basis), `applyAffine(mesh, affine)`.

## Families: one build, many assets

**A variant is a name plus the parameters that differ.** T-34 1941 vs 1943, a 4-4-0 vs a 2-6-0, oak vs birch: one key change, not a copied file.

```ts
import { defineFamily } from '@developerz-ai/ts23d';

const t34 = defineFamily({
  kind: 'vehicle',
  budget: { triangles: [40000, 10000, 1500] },
  defaults: { turret: '1941' as '1941' | '1943', hullLength: 6.68 },
  build(ctx, p) { /* hull from p.hullLength; turret shape from p.turret */ },
});

export const t34_1941 = t34.variant({ name: 't34_1941' });
export const t34_1943 = t34.variant({ name: 't34_1943', params: { turret: '1943' } });

// Derive: add params, wrap or replace the parent's detail.
const t34_85 = t34.extend({
  defaults: { gun: 85 },
  build(ctx, p, base) { base(); /* swap the turret, add the 85 mm gun */ },
});
export const t34_85_1944 = t34_85.variant({ name: 't34_85_1944', tags: ['ww2'] });
```

| API | Does |
|---|---|
| `defineFamily({ defaults, build(ctx, params), ...assetFields })` | Typed defaults; every `defineAsset` field except `name` / `build` |
| `family.variant({ name, params?, ...overrides })` | One `Asset`: defaults merged with `params`; may override `real`, `budget`, `tags`, … |
| `family.extend({ defaults, build?(ctx, p, base) })` | A new family with more params. Call `base()` to run the parent's build, or don't, to replace it |
| `family.defaults` | Read-only defaults, for docs and UIs |

## Emitters

`ctx.emitter(name, opts)` adds an empty named node carrying `extras.ts23d.emitter`. It moves with its parent; the engine binds its own particle system to it. The gallery renders them.

| Option | Meaning |
|---|---|
| `kind` | `'smoke'` · `'steam'` · `'dust'` · `'muzzle'` · `'fire'` · `'sparks'` |
| `at`, `parent` | Position in the parent's space; parent it to a turret or stack so it follows |
| `dir` | Emission direction, default up (+Z) |
| `rate`, `life` | Particles per second; seconds each lives |
| `size` | `[start, end]` metres |
| `color` | Linear RGB start colour; engines fade to transparent |
| `speed`, `spreadDeg` | Initial speed along `dir`; cone spread |
| `when` | `'always'` (chimney) · `'moving'` (track dust) · `'event'` (muzzle flash, fired by game code) |

```ts
ctx.emitter('exhaust_l', { kind: 'smoke', at: [-3.2, 0.6, 1.2], dir: [-1, 0, 0.5],
                           rate: 20, life: 2, size: [0.2, 1.2], when: 'moving' });
ctx.emitter('muzzle', { kind: 'muzzle', parent: 'gun', at: [2.6, 0, 0], dir: [1, 0, 0],
                        rate: 200, life: 0.1, size: [0.3, 0.8], when: 'event' });
```

## Sockets

`ctx.socket(name, { kind, at?, parent?, dir?, data? })`: an empty named node with `extras.ts23d.socket`, for game code to attach to.

| `kind` | Example |
|---|---|
| `seat` | Driver, gunner, passenger |
| `mount` | Weapon hardpoint, `data: { caliber: 88 }` |
| `camera` | Gunner sight, chase cam, `data: { fov: 60 }` |
| `audio` | Engine, `data: { clip: 'engine_idle' }` |
| `attach` · `spawn` · `interact` · `light` | Tow hook, spawn point, door handle, headlamp |

`dir` is the facing in the parent's space (default +X). `data` is free-form `string | number | boolean` values.

## Surfaces

**One texture set, at most four materials.** `surface` on a part picks the shading model; tint stays in vertex colour.

| Surface | For | glTF |
|---|---|---|
| `opaque` (default) | Almost everything | `ts23d_trim` |
| `cutout` | Leaves, fences, grilles | Alpha-tested, double-sided |
| `glass` | Windows, lenses, clear bottles | `KHR_materials_transmission` + `_volume` + `_ior` (1.5) |
| `translucent` | Plastic bottles, liquids, paper | Transmission, tinted; engines without it fall back to alpha blend |

Batching splits by pivot and surface, so a shampoo bottle (opaque cap, translucent body) is 2 draw calls.

## Checks: declared intent

**Static intersections need declared intent.** Modellers sink bolts into plates on purpose, so QA can't fail every overlap. The recipe says what must hold, and the `check` gate enforces it at every LOD.

```ts
import { clear, noOverlap, symmetric, touches } from '@developerz-ai/ts23d';

checks: [
  clear('track_*', 'hull_*', 0.02),        // the track never hits the frame; 2 cm running gap
  noOverlap('road_wheel_l_*'),             // interleaved wheels don't intersect
  touches('turret_body', 'hull_top'),      // the turret sits on its ring
  symmetric('_l', '_r', 'y'),              // left matches right across y = 0
],
```

| Builder | Fails when |
|---|---|
| `clear(a, b, minGap?)` | Anything in `a` sinks more than 1 cm into `b`'s closed solid (ray-parity point-in-solid; open planar sheets are never solids), or is closer than `minGap` |
| `noOverlap(glob)` | Any two parts matching `glob` interpenetrate |
| `touches(a, b, eps = 0.02)` | `a`'s surface is further than `eps` from `b`'s |
| `symmetric(left, right, axis = 'y')` | A part containing `left` has no `right` mirror, or isn't mirrored across `axis = 0` (2 cm) |

Selectors are globs (`*`, `?`) over part names. A custom check is any `(asset: CompiledAsset) => CheckFinding[]`, where `CheckFinding = { message, fix, part? }`.

## Composition: `ctx.use`

A scene is an asset that uses other assets. Each instance is compiled at the parent's LOD, with its own seed, under a prefixed group:

```ts
import { box, defineAsset, facade, palettes } from '@developerz-ai/ts23d';

const { limestone, glass } = palettes.artDeco;

export const shop_house = defineAsset({
  name: 'shop_house',
  kind: 'building',
  budget: { triangles: [4000, 1500, 400] },
  build(ctx) {
    const floors = ctx.rng.int(2, 4);               // varies per seed
    ctx.part('mass', box({ size: [8, 10, floors * 3.2], color: limestone,
                           strip: 'stone', omit: ['bottom'] }));
    if (ctx.lod < 2)
      facade(ctx, { prefix: 'win', at: [0, 0, 0], footprint: [8, 10], floors, floorHeight: 3.2,
        grammar: 'pier:0.6 | {win:1.4 | pier:0.6}* | pier:~',
        ground: 'pier:0.6 | shop:4 | pier:~ | door:1.2 | pier:0.6',
        sides: ['front'], glass });
  },
});

export const street = defineAsset({
  name: 'street',
  kind: 'scene',
  budget: { triangles: [40000, 15000, 4000] },
  build(ctx) {
    ctx.part('road', box({ size: [12, 60, 0.05], at: [12, 0, 0],
                           color: palettes.modernGlass.concrete, omit: ['bottom'] }));
    for (let i = 0; i < 6; i++)
      ctx.use(shop_house, { prefix: `house_${i}`, at: [0, -25 + i * 10, 0], seed: 100 + i });
  },
});
```

Result: six different houses (2–4 floors each) as `house_0` … `house_5`, with parts `house_3_mass`, `house_3_win_front_1_2` and so on. LOD2 drops every window on every house at once.

`UseOptions`: `prefix` (required), `at`, `yaw`, `parent`, `seed` (defaults to the parent's seed).

## Determinism rules

**Same source + seed + LOD → same bytes.** Breaking any rule below breaks that.

| Rule | Why | Enforced by (in this repo) |
|---|---|---|
| Never `Math.random()`. Use `ctx.rng` or `createRng(seed)` | Ambient entropy | `scripts/determinism.ts` (static ban in `src/` + `recipes/`); test preload makes `Math.random` throw |
| No `Date.now()`, `new Date()`, `performance.now()` in library or recipe code | Wall clock | `scripts/determinism.ts` |
| No `toLocale*String()` | Locale changes bytes; format with `toFixed` | `scripts/determinism.ts` |
| `ctx.rng.fork('name')` per independent feature | Adding a draw in one part must not shift another | Convention |
| No env vars, file or network reads in `build` | Ambient state | Convention |
| `build` is synchronous | No ordering races | The type signature |
| Iterate arrays, not object key order you didn't create | Stable part order → stable node order → stable bytes | Convention |
| Generated meshes (neural, imported) go through a content-hash cache | A GPU result is not reproducible; the cached file is | Planned, M5 ([08](08-neural-adapters.md)) |

`scripts/recipes.ts` compiles every recipe twice per LOD and fails if the GLB hashes differ. Both run in `bun run verify`. In your own project, copy the rules; the guards ship with this repo, not the package. Cross-machine hash comparison: planned ([06-qa](06-qa.md)).

## Library entry points

One import gives everything; subpaths load one layer ([ADR 006](../decisions/006-single-package-subpath-exports.md)):

```ts
import { defineAsset, box } from '@developerz-ai/ts23d';
import { split } from '@developerz-ai/ts23d/grammar';
import { contactSheet } from '@developerz-ai/ts23d/render';
```

Programmatic build, without the CLI:

```ts
import { compile, contactSheet, runQa, toGlb } from '@developerz-ai/ts23d';
const lod0 = compile(lamp_post, { lod: 0 });
const findings = runQa(lod0);                      // [] = PASS
const glb = toGlb(lod0);                           // Uint8Array
const png = contactSheet(lod0, { far: compile(lamp_post, { lod: 2 }) });
```
