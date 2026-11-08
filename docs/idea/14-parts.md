# 14 — Parts: define once, reuse everywhere

**Detail is cheap for an agent to write; reuse multiplies it.** A hex bolt written well once, with
the ISO table behind it, is right on every tank, bridge and boiler that uses it. `definePart` turns
a piece of geometry into a typed, validated, cached, LOD-aware function, and `recipes/_parts/` is the
shared kit of them.

## Search before you build

1. Open [`recipes/_parts/README.md`](../../recipes/_parts/README.md): every part with a thumbnail,
   its tags and its params (default, range, choices). It is generated, so it is never stale
   (`bun run scripts/parts-catalogue.ts`; `--check` fails on a stale index).
2. Found it: call it. Missing a variant: add a param to the part, not a copy of it.
3. Not there and you will need it twice: write it in `recipes/_parts/<name>.ts`, add it to
   `recipes/_parts/index.ts`, regenerate the index. Used once: keep it in your asset's folder.

## Using a part

```ts
import { hex_bolt, hinge, rivet_row } from '../_parts/index.ts';

// One named part (or a group of named pieces), placed like ctx.part.
hex_bolt(ctx, 'bolt_hatch_0', { size: 'M16', length: 0.05 }, { at: [1.2, 0.4, 2.0] });

// Rotation/scale baked in with `place`; `at` stays the pivot. Multi-piece parts keep their motion:
// the hinge's leaf still swings about its pin after being laid on its side.
hinge(ctx, 'lid_hinge', { style: 'piano', height: 0.8 }, { at, place: { roll: Math.PI / 2 } });

// A mesh to place N times and merge into one part (one draw, cached build).
const rivet = rivet_row.mesh({ count: 1 }, ctx);
ctx.part('seam', merge(points.map((at) => place(rivet, { at }))));
```

`part(ctx, name, overrides?, call?)`: `call` takes every `PartOptions` field (`at`, `yaw`, `parent`,
`motion`, `surface`, `clearOf`, …) plus `place` (a `Placement` baked into meshes, piece pivots and
motion axes) and `upTo` (override the part's LOD policy for this call).

## Defining a part

Abridged from `recipes/_parts/hex_bolt.ts`:

```ts
import { definePart, lathe, merge } from '@developerz.ai/ts23d';
import { METRIC, METRIC_SIZES, type MetricSize } from './metric.ts';

export const hex_bolt = definePart({
  name: 'hex_bolt',
  description: 'ISO 4017 hex bolt: hex head on a plain shank; origin under the head',
  tags: ['fastener', 'hardware', 'metric'],
  params: { size: 'M12' as MetricSize, length: 0.04 },          // defaults = the types
  schema: {
    size: { oneOf: METRIC_SIZES, doc: 'ISO metric thread size' },
    length: { min: 0.008, max: 0.4, unit: 'm', doc: 'shank length under the head' },
  },
  validate: (p) => (p.length > 20 * METRIC[p.size].d ? 'too slender' : undefined),
  lod: { upTo: 1 },                                              // gone at LOD2
  build(b, p) {
    const { d, s, k } = METRIC[p.size];
    return merge([hexHead(s, k, b.lod), shank(d, p.length, b.pick([12, 8, 6]))]);
  },
});
```

| Field | Meaning |
|---|---|
| `params` | Defaults for every parameter: numbers, strings, booleans or number tuples (a path, a size). Their types are the param types; widen a string to a union with `as` |
| `schema` | Per param: `doc`, `unit`, `min`, `max`, `oneOf`. Drives validation and the catalogue |
| `validate(p)` | A cross-param rule: return the problem in words, or `undefined` |
| `lod` | `upTo`: highest LOD that emits the part (rivets 0, bolts 1). `map`: build LOD per requested LOD (`[0, 0, 1]` keeps hero detail at LOD1) |
| `build(b, p)` | Return a `Mesh`, or pieces `{ name, mesh, at?, surface?, motion?, clearOf? }` for parts with moving or glass bits. `b.lod`, `b.pick`, `b.rng` (seeded from name + params: same params, same numbers), `b.mesh(other, o)` / `b.pieces(other, o)` to compose |

Errors: an unknown param (with did-you-mean), a wrong type, an out-of-range value or a broken
`validate` throws `T3D_PART_PARAMS` naming the part, the value and the fix. Bad part or piece names
throw `T3D_RECIPE_INVALID`.

## Conventions for kit parts

- **Real scale, sourced.** Defaults are a real object's numbers; the header comment says which
  standard or product they come from (ISO 4017, EN ISO 14122, IPE 200…).
- **Origin where it mounts.** A bolt's origin is under its head, a door's is the floor at the centre
  of its opening, a wheel's is its hub. Z up, +X front, as for assets; the header says the axis.
- **Closed and outward.** Every piece is a closed, outward-wound solid at every LOD and every
  `oneOf` choice (`scripts/parts-catalogue-parts.test.ts` checks it in the gate). Closed lathe loops
  run counter-clockwise in (r, z); open lathe profiles run upward.
- **LOD-gated, never decimated.** `b.pick([…])` for segments; drop small detail with `lod.upTo` or
  `b.lod` checks. Bevel hard edges at LOD0 (`box({ bevel })`).
- **Library materials.** Pick strips from `src/material/library.ts` (`steel_galvanised`, `oak`,
  `rubber`…) with `NATURAL` tint, or a paint strip with a hue.
- **Glow by name.** A lamp's light is a piece named `glow`; the asset declares
  `glow: [{ parts: ['*_glow'] }]`.
- **Moving pieces declare what they pass through.** A hinge leaf lists its sibling `fixed`
  (`clearOf: ['fixed']`), with the reason in a comment; the call's own `clearOf` is added to it.

## Caching

Each part keeps a cache keyed by (LOD, params): 40 bolts of one size build once and are placed 40
times. The cache holds at most 256 entries per part (oldest dropped first) and never changes output,
so determinism holds. `part.stats()` reports builds vs hits. Treat returned meshes as read-only:
`place`, `merge` and `translate` copy.

## Where it lives

`definePart` is a pure core mechanism (`src/core/define-part*.ts`): it runs, validates, caches and
describes parts but imports no primitives. Parts themselves are recipes-side code
(`recipes/_parts/`, imported with a relative path) and use any primitive. The showcase asset
[`recipes/parts_catalogue`](../../recipes/parts_catalogue/README.md) lays the whole kit out at
real scale.
