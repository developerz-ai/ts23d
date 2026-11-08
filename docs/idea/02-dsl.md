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
| `box` | `size`, `at`, `strip`, `omit`, `bevel?` | Hulls, walls, crates; `bevel` = the mid-poly chamfer |
| `lathe` / `cylinder` | `profile` or `radius`+`length`, `segments`, `axis`, `creaseDeg?`, `uv?: 'metres'`, `faceted?` | Wheels, boilers, domes, n-sided tanks |
| `prism` | `profile`, `depth`, `plane: 'xy'\|'xz'\|'yz'` | Sloped armour, gables, fins |
| `beam` | `from`, `to`, `width`, `segments?`, `up?`, `caps?` | Girders, rods, rails |
| `planar` | `points`, `doubleSided?` | Plates, decks, signs |
| `sweep` | `section` (polygon or `{ radius, segments }`), `path`, `scale?` (taper), `twist?`, `caps?` | Branches, pipes, handrails, cables. Parallel-transport frames; triangles = 2·S·(P−1) + S per cap |
| `loft` | `rings` (Vec3 rings), `capStart?`, `capEnd?`, `uv?` | Trunks, fuselages, bottles. `ringXY(centre, rx, ry, …)` builds a ring, with wobble |
| `heightfield` | `rect`, `cells`, `height(x, y)`, `color`, `skirt?` | Terrain, dioramas; with `terrainGrid` + `hydraulicErosion` / `thermalErosion` + `terrainColor` for real-looking mountains |
| `tiled` | `origin`, `u`, `v`, `strip`, `segments?` | Walls, roofs, decks at true texture scale |
| `cell` | `origin`, `u`, `v`, `cell`, `inset?` | Windows, doors, clocks, signs; `inset` adds reveals |
| `lattice` | `from`, `to`, `depth`, `pattern: warren\|pratt\|howe\|x`, `bays`, `chord`, `web`, `section` | Bridges, towers, cranes, gantries |
| `text` | `str`, `origin`, `along`, `up`, `height`, `font`, `depth?`, `align?`, `maxWidth?`, `surface?` | Name boards, wagon lettering, hull markings (5×7 font, Latin + Cyrillic) |
| `sdf` | `field(p)`, `bounds`, `resolution`, `mesher?`, `symmetry?` | Any signed-distance shape; `sd.*` combinators, `valueNoise` |
| `sculpt` | `edits` (shape, op, blend, color, groups, `{ field, bounds }`), `resolution`, `mirror?` | Busts, rocks, asteroids: Dreams-style edit lists |
| `extrudeSvg` / `latheSvg` | SVG string, `scale` or `size`, `depth`, `bevel?`, `view`, `tolerance?`, `lod?` | Emblems, gears, brackets, vases from a drawing ([Drawing with SVG](#drawing-with-svg)) |
| `visualHull` / `sd.silhouette` | `front`, `side`, `top?` SVGs, `scale`, `round?` | Block out a head, creature or vehicle from two drawings, then sculpt |

Noise for any primitive: `gradientNoise2`, `valueNoise2`, `fbm`, `billow`, `ridged`, `warp`, `terrace` — all seeded from an `Rng`.

## Drawing with SVG

**A coding agent cannot emit pixels, but SVG is drawing as text.** Artists start a model from front
and side drawings; in ts23d the drawing is an inline SVG string in the recipe, and these primitives
turn it into closed, game-ready geometry (`src/primitives/svg-*.ts`, `sdf-silhouette.ts`):

| Call | Does |
|---|---|
| `svgShape(svg, { scale \| size, origin?, tolerance?, lod? })` | Path `d` (M L H V C S Q T A Z, any case) or a small `<svg>` with `<path>`, `<polygon>`, `<polyline>`, `<rect>`, `<circle>`, `<ellipse>` → flattened contours in metres, **Y up**, origin at the viewBox bottom centre. `size` = viewBox width in metres. Curves flatten within `tolerance` (default 2 mm), ×4 at LOD1, ×12 at LOD2 |
| `extrudeSvg(svg, { depth, bevel?, view, at, color, strip })` | Even-odd fill (nested contours are holes, islands inside holes fill again), ear-clipped caps with hole bridges, smooth walls split at sharp corners, optional 45° chamfer. `view: 'front'` (YZ, along X) · `'side'` (XZ, along Y, the default) · `'top'` (XY, up from z = 0). Closed and outward-wound |
| `latheSvg(svg, { segments, axis?, at, color })` | Half profile with the axis on the paper's left edge; a closed shape drops its on-axis edges |
| `visualHull({ front, side, top?, scale, round?, at })` | The solid whose views match the drawings: exact 2D polygon distances extruded and intersected (`round` smooths view-against-view creases). Returns `{ field, bounds }`: spread it into a `sculpt` edit, then refine with normal edits |

```ts
const hull = visualHull({ front: HEAD_FRONT, side: HEAD_SIDE, top: HEAD_TOP, scale: 0.004, round: 0.02, lod: ctx.lod });
sculpt({ edits: [{ ...hull, color: SKIN }, { shape: 'ellipsoid', op: 'intersect', blend: 0.03, … }, …], resolution, mirror: 'y', color: SKIN });
```

Malformed drawings throw `T3D_SVG_INVALID` with the fix (transforms are refused: bake them into the
coordinates). The worked example is [`recipes/svg_showcase`](../../recipes/svg_showcase/): a bevelled
gear, a turned amphora, a silhouette-sculpted creature head and a star emblem, all from inline SVG.

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
import { box, cylinder, defineAsset, hex } from '@developerz.ai/ts23d';

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
| `ctx.joint(name, opts)` | Where two parts connect; QA `joints` proves they fit ([below](#joints-parts-that-fit)) |

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
import { cylinder, merge, place } from '@developerz.ai/ts23d';

const rivet = cylinder({ radius: 0.012, length: 0.01, segments: 6, axis: 'x', color: iron });
const rivets = merge(Array.from({ length: 24 }, (_, i) => place(rivet, { at: [3.0, -1.2 + i * 0.1, 1.1] })));
if (ctx.lod === 0) ctx.part('glacis_rivets', rivets);
```

Lower level: `affine(placement)`, `frame(u, v, w, at)` (an explicit basis), `applyAffine(mesh, affine)`.

## Big assets: many files
Code is cheap for an agent, so a hero asset can run to thousands of lines. Split it like any program:
the folder's `<name>.ts` is the entry, sibling modules hold the parts, and `recipes/_lib/` holds parts
many assets share.

```
recipes/dragon/dragon.ts    defineAsset: wires the parts, budgets, real, LOD policy
recipes/dragon/head.ts      export function head(ctx: Ctx, o: HeadOpts): void
recipes/dragon/wings.ts     export function wings(ctx: Ctx, o: WingOpts): void
recipes/dragon/body.ts · legs.ts · tail.ts · scales.ts
recipes/_lib/weapons/greataxe.ts   shared by orc, dwarf, troll
```

```ts
// recipes/dragon/dragon.ts
import { defineAsset } from '@developerz.ai/ts23d';
import { body } from './body.ts';
import { head } from './head.ts';
import { wings } from './wings.ts';

export const dragon = defineAsset({
  name: 'dragon', kind: 'character', budget: { triangles: [150000, 30000, 4000] },
  build(ctx) {
    const torso = body(ctx, { length: 9 });
    head(ctx, { at: torso.neckEnd, horns: 6 });
    wings(ctx, { root: torso.shoulders, span: 14 });
  },
});
```
The recipes gate accepts any `.ts` inside an asset folder (outside `out/`) as that asset's module.
Whole finished assets compose with `ctx.use(other)` (a weapon into a hand socket).

## Families: one build, many assets

**A variant is a name plus the parameters that differ.** T-34 1941 vs 1943, a 4-4-0 vs a 2-6-0, oak vs birch: one key change, not a copied file.

```ts
import { defineFamily } from '@developerz.ai/ts23d';

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
| `when` | `'always'` (chimney) · `'moving'` (track dust) · `'event'` (muzzle flash, fired by engine code) |

```ts
ctx.emitter('exhaust_l', { kind: 'smoke', at: [-3.2, 0.6, 1.2], dir: [-1, 0, 0.5],
                           rate: 20, life: 2, size: [0.2, 1.2], when: 'moving' });
ctx.emitter('muzzle', { kind: 'muzzle', parent: 'gun', at: [2.6, 0, 0], dir: [1, 0, 0],
                        rate: 200, life: 0.1, size: [0.3, 0.8], when: 'event' });
```

## Sockets

`ctx.socket(name, { kind, at?, parent?, dir?, data? })`: an empty named node with `extras.ts23d.socket`, for engine code to attach to.

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
import { clear, noOverlap, symmetric, touches } from '@developerz.ai/ts23d';

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

## Joints: parts that fit

**A hand built in `hand.ts` must fit the forearm built in `arm.ts`.** `ctx.joint` says where two
parts meet; the default QA gate `joints` cuts both at that plane and compares the sections.

```ts
ctx.joint('wrist', { from: 'forearm', to: 'hand', at: wrist, axis: [1, 0, 0] });          // flush
ctx.joint('grip', { from: 'hand', to: 'sword', at: fist, axis: [0, 0, 1], kind: 'grip' });
```

| Option | Meaning |
|---|---|
| `from`, `to` | Part selectors: a name, a prefix (`'hand'` covers `hand_palm`, `hand_thumb`) or a glob |
| `at`, `axis` | Joint centre and direction in the asset's frame; `axis` points from `from` to `to` (a grip: along the handle) |
| `kind` | `flush` (default): sections either side match in width, depth and centre · `socket`: `from` fits inside `to` and fills it · `grip`: the handle's diameter matches the fist's opening, and the fingers wrap at least half of it |
| `tolerance` | Relative size difference allowed, default 0.2 |

| Code | Fails when | Example fix printed |
|---|---|---|
| `T3D_JOINT_MISMATCH` | Sizes differ beyond tolerance | `scale hand ×0.51 at the joint, or flare forearm to 9.1 cm (×1.95)` |
| `T3D_JOINT_GAP` | A side never crosses the plane, or the parts stop short | `extend forearm or move hand 2.0 cm back along the axis` |
| `T3D_JOINT_OFFSET` | Section centres miss by over 25% of the section | `slide hand by 5.0 cm in the joint plane` |
| `T3D_JOINT_BURIED` | `from` runs through `to` far past the joint (flush) | `shorten forearm to end at the joint` |

Joints carry through `ctx.use` (prefixed, moved with the instance) and are listed in the manifest.
`jointFit(compiled, joint)` returns both sections and the findings. Worked example:
`recipes/joint_demo/` (arm.ts, hand.ts, sword.ts; its test builds a hand ×2 and gets the mismatch).

## Measuring: the ruler and the blueprint

```ts
import { compile, ruler } from '@developerz.ai/ts23d';
const r = ruler(compile(knight));
r.size();                                      // { length, width, height } in metres
r.bounds('shield');                            // world box of every shield_* part
r.between('hand_r', 'sword', 'closest');       // surface to surface; 0 = touching
r.between('wheel_l', 'wheel_r');               // centre to centre
r.gap('door', 'frame', 0.1);                   // clearance, capped at 0.1 m
r.section('forearm', { at: [0.5, 0, 1], normal: [1, 0, 0] }); // { width, depth, area, centroid }
```

In tests (`@developerz.ai/ts23d/testing`): `assertSize(asset, { height: [1.7, 1.9] })`,
`assertBetween(asset, 'hand_r', 'sword', [0, 0.005], { mode: 'closest' })`, `assertJointsFit(asset)`.

`t3d blueprint recipe.ts --out renders` draws it: side, front and top on a metre grid (major 1 m /
minor 0.1 m, adapting to the size), L × W × H dimension lines, every `real.measures` entry between
its parts as model/spec (green within tolerance, red outside), joints green or red by fit, and a
1.8 m figure beside the asset for scale. Read it after `t3d shot`.

## Composition: `ctx.use`

A scene is an asset that uses other assets. Each instance is compiled at the parent's LOD, with its own seed, under a prefixed group:

```ts
import { box, defineAsset, facade, palettes } from '@developerz.ai/ts23d';

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
import { defineAsset, box } from '@developerz.ai/ts23d';
import { split } from '@developerz.ai/ts23d/grammar';
import { contactSheet } from '@developerz.ai/ts23d/render';
```

Programmatic build, without the CLI:

```ts
import { compile, contactSheet, runQa, toGlb } from '@developerz.ai/ts23d';
const lod0 = compile(lamp_post, { lod: 0 });
const findings = runQa(lod0);                      // [] = PASS
const glb = toGlb(lod0);                           // Uint8Array
const png = contactSheet(lod0, { far: compile(lamp_post, { lod: 2 }) });
```

## Physics: body, colliders, mass

**Collision and mass come from the same geometry, opt-in at export.** `toGlb(lod0, { physics: true })` writes `KHR_physics_rigid_bodies` + `KHR_implicit_shapes` (Khronos drafts; [gltf-capabilities](../architecture/gltf-capabilities.md#physics-rigid-body-colliders-mass-physics-true-opt-in)). Nothing in the recipe is required: every pivot gets a fitted collider, every shell a mass from its strip's density.

```ts
export const tiger_1 = defineAsset({
  name: 'tiger_1', kind: 'vehicle',
  real: { length: 8.45, width: 3.7, height: 3.0, mass: 57000, massTolerance: 0.1 },
  physics: {
    body: 'dynamic',                 // 'static' | 'dynamic' | 'kinematic'; default by kind
    shell: 0.06,                     // hollow hull: wall metres (omit = solid)
    density: { plain: 7850 },        // kg/m³ per strip: `plain` is armour steel here
    // mass: 57000,                  // override the total (keeps CoM + inertia shape); never to pass QA
  },
  build(ctx) {
    ctx.part('antenna', whip, { collider: 'none' });          // no collider, still has mass
    ctx.part('gun_barrel', barrel, { parent: 'gun', collider: 'cylinder' });
    ctx.part('spare_track', links, { density: 7200, shell: 0.02 });
  },
});
```

| Option | Where | Effect |
|---|---|---|
| `collider` | part (read on pivots) | `auto` (default): tightest box / sphere / capsule / cylinder, else ≤ 64-vertex hull, compound if one hull swallows the parts; `mesh` = exact trimesh; `none` |
| `density`, `shell` | part, or `physics.density` (per strip) / `physics.shell` | kg/m³; wall thickness for closed shells (area × wall, capped at solid) |
| `real.mass` | asset | QA `mass`: computed vs real (±15 % default) → `T3D_MASS_MISMATCH` |

Library: `massProperties(compiled)` (mass, centre of mass, inertia tensor and principal axes), `fitCollider(mesh, kind)`, `convexHull`, `cappedHull`, `DENSITY`, `physicsMaterialOf(strip)` from `@developerz.ai/ts23d/physics`.

## Parts: define once, reuse everywhere

**A bolt, a hinge or a wheel is written once, as a `definePart`, and called anywhere.** Typed params
from real-scale defaults, validated (`T3D_PART_PARAMS` + fix), cached per (params, LOD), LOD-gated,
and composable. The shared kit lives in [`recipes/_parts/`](../../recipes/_parts/README.md): search
it before writing geometry. Full guide: [14-parts](14-parts.md).

```ts
import { flange, hex_bolt } from '../_parts/index.ts';

hex_bolt(ctx, 'bolt_0', { size: 'M16', length: 0.06 }, { at: [1, 0, 0.5] });   // one named part
const head = hex_bolt.mesh({ size: 'M10' }, ctx);                              // cached mesh
ctx.part('bolts', merge(seam.map((at) => place(head, { at }))));               // place N times
flange(ctx, 'flange_in', { pipe: 0.114 }, { at, place: { pitch: Math.PI / 2 } });
```

| API | Does |
|---|---|
| `definePart({ name, description, tags?, params, schema?, validate?, lod?, build(b, p) })` | `build` returns a `Mesh` or named pieces `{ name, mesh, at?, surface?, motion?, clearOf? }`; `b` has `lod`, `pick`, a params-seeded `rng`, `b.mesh(part, o)` / `b.pieces(part, o)` |
| `part(ctx, name, overrides?, call?)` | One mesh → part `name`; pieces → group `name` + `name_<piece>`. `call`: `PartOptions` + `place` (bake rotation/scale) + `upTo` |
| `part.mesh(o?, lod \| ctx, upTo?)` / `part.pieces(…)` / `part.params(o?)` | Merged mesh (empty when the LOD drops it), the pieces, resolved params |
| `part.info` / `catalogueOf(parts)` | Name, description, tags, params (type, default, unit, range, choices, doc), LOD policy |

## Finishes and optics
Paint slots take a finish: `paint: { body: { colour: '#9b1b1b', clearcoat: 1, clearcoatRoughness: 0.03, metallicFlake: 0.5 } }` (car lacquer, kept by every livery). Transmissive surfaces (`glass`, `ice`, `liquid`, `jelly`, `translucent`) take `optics: { glass: { ior: 1.52, thickness: 0.005, attenuationColour, attenuationDistance } }`. Named `finishes` (sheen for cloth, anisotropy for brushed metal, iridescence for heat tint, specular) apply per part with `{ finish: 'brushed' }`. All write ratified `KHR_materials_*` extensions (used, never required); see [gltf-capabilities](../architecture/gltf-capabilities.md) and `recipes/pbr_showcase`.

## Art intent
`art: { focal: 'head', shape: 'aggressive', grounded: true, restShare: 0.3 }` states what the eye should read, in words the checks measure ([16-art-as-text](16-art-as-text.md)): `focal` part name(s) (prefix or `*` glob) must hold the strongest value contrast; `shape` (`aggressive` · `friendly` · `stable`) must match the silhouette's measured class; `grounded` (default on for `character`/`creature`) wants luminance rising base → top; `restShare` is the minimum calm surface (default 0.25). `assertArt(asset)` in `/testing` and `t3d critique` measure all of it.
