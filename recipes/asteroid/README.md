# Mineable asteroid (`asteroid`, `asteroid_b`, `asteroid_c`)

## Identity
A ~10 m rubble-pile asteroid for a mining game, in three seeded variants: `asteroid` (seed 1,
5.0 × 3.8 × 3.0 m radii), `asteroid_b` (seed 2, rounder) and `asteroid_c` (seed 3, an elongated
shard). The rocks are original and procedural.

Signature features: a lumpy mass chipped by flat fracture planes; impact craters with raised rims
and dark floors; very dark carbonaceous rock with lighter dust on up-facing slopes; thin metallic
ore veins; glowing teal crystal clusters at the mining points.

## References
| Fact | Value | Source |
|---|---|---|
| C-type (carbonaceous) albedo | 0.03–0.09, ~75 % of asteroids, very dark | https://starlust.org/what-are-the-different-types-of-asteroids |
| S-type (silicate) albedo | 0.10–0.22 | same |
| M-type (metallic, nickel-iron) | bright, metallic, the mining target | https://www.esa.int/Science_Exploration/Space_Science/Rosetta/Debris_of_the_Solar_System_Asteroids |

The base rock (`#3b3632`/`#4f4841`) is C-type dark. The ore veins (`#b98a48`) stand in for
M-type metal. The glowing crystals (`#3fe0d0`) are a game convention, not science.

## How it is built
`sdf({ field, resolution: ctx.pick([0.206, 0.86, 1.53]) })` over one field:
1. An ellipsoid core plus three smooth-unioned ellipsoid lobes.
2. `valueNoise` displacement: 0.65 m at a 2.8 m feature size, plus 0.12 m pitting at 0.8 m.
3. Ten fracture half-spaces reaching 80–93 % of the body, smooth-max'd (k = 0.06 m): small, sharp
   angled facets on the lumps instead of one flat cut wall. Lobes scale with the variant's size (variant c is an
   elongated ~2:1 body). A fine 0.3 m grain octave at LOD0.
4. Nine craters. Each is a ring rim bump (0.2 r high, 0.22 r wide, at 0.85 r from the strike
   axis, faded out 0.5–1.5 r along it) that lifts the surface like a heightfield (a bump on the
   distance from the bowl's sphere centre was a shell hovering over the slope: sliver flaps), then
   a smooth-subtracted bowl sphere (k = 0.14 r: a steep inner wall under a sharp lip). All shape draws come from `ctx.rng.fork('shape')`, so the seeded layout (lobes,
   fractures, crater sites and sizes, boulders) is the same at every LOD. The field built on it is
   not: the 0.3 m grain octave is added at LOD0 only, and at LOD2 each crater over 1.2 m radius
   becomes a wider dish (1.7 × its radius, no raised rim) that the 1.5 m cells can still catch.
   Boulders (ejecta that fell back) settle in the floors of the larger craters.
5. Mining workings at each crystal site: three drill bores cut into the field, each with a scorched
   ring painted round it (drill scars), and heaps of tailings chips at LOD0 (squat lumps, blunt
   at both ends, sunk a third into the spoil, so no tip pokes out as a shard) turned
   and stretched per axis by a hash of their position (irregular chips, not little blocks; hashed,
   not drawn, so every later bore and the triangle count stay put).
6. Colour per vertex over the project regolith strip (`regolith.ts`: per-cobble shade, large pale
   and dark clasts and low-roughness nickel-iron flecks; the cobble edges kept faint, since a crack
   network on every cell read as crazed mud): stony grey-brown, darker space-weathered rock away
   from the fresh impact, dust where n·z > 0.55; ore veins filling a fracture network (`veins.ts`:
   the faces of a warped 3D Voronoi pattern of ~2.4 m cells, half of them filled, so veins branch
   where cells meet and swell and pinch 0.25–1.6× along their length; not great-circle stripes),
   with a soft 16 cm halo; a crusted teal deposit with an edge round each crystal site; paler tailings
   round the workings; dark old crater floors; and the fresh crater — the mid-sized one facing the
   hero camera — with a floor, a blanket to ~2 r and narrow (cos⁴) rays to ~4.5 r, a step above the rock
   (`#9a9183`), not white: pale-white swirls read as marbled paint. LOD2 (1.5 m cells, one flat
   colour a triangle) keeps only the broad blocks on the `plain` row (no regolith grain to smear
   into streaks): veins as the mean ore weight over each vertex's cell (continuous streaks, not
   point-sampled blotches), deposit, the fresh crater's blanket, and the two big craters as a
   wider dish the cells catch, a near-black floor and a pale rim ring. No tone noise or rays.
7. UVs re-projected per face (`_lib/terrain/strip-inset.ts`): `sdf` picks each vertex's projection
   axis on its own, so triangles straddling an axis switch crammed metres of regolith into a stack
   of thin lines, the contour rings round every bump in the hero. Per-face projection splits those
   corners; V also stays off the strip's padded edge rows.
8. `bakeAo` (16 / 8 rays at LOD0 / LOD1) for crevice darkening; LOD2 is darkened to match.

A free body: no flat cut. Each LOD rests on its own lowest vertex, sunk 3 cm into z = 0. The SDF
bounds follow the body's extent per axis (lobes included) instead of a cube.

## Parts the engine needs
`rock` (the mass; also usable as a collider at LOD2), `ore_crystals` (glow), interact sockets
`mine_point_0…3` (at each cluster, facing into the rock, `data: { resource, yield }`), emitter
`dust` (`event`, for mining debris).

## Open questions
- `real` is not declared: the size of a procedural rock is a design choice, not a spec, and the
  noise moves its extents by ±10 %. The budget is measured per seed instead.
- No in-library "surface point along a ray" helper exists, so the recipe bisects its own field to
  seat the crystals. A `sdfSurface(field, from, dir)` helper would make this reusable.
