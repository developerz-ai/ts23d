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
`sdf({ field, resolution: ctx.pick([0.2, 0.85, 1.5]) })` over one field:
1. An ellipsoid core plus three smooth-unioned ellipsoid lobes.
2. `valueNoise` displacement: 0.65 m at a 2.8 m feature size, plus 0.12 m pitting at 0.8 m.
3. Seven fracture half-spaces reaching 75–90 % of the body, smooth-max'd (k = 0.12 m): they facet
   the lumps instead of squaring the sides. Lobes scale with the variant's size (variant c is an
   elongated ~2:1 body). A fine 0.3 m grain octave at LOD0.
4. Nine craters. Each is a radial rim bump that displaces the surface, then a smooth-subtracted
   bowl sphere. All shape draws come from `ctx.rng.fork('shape')`, so the shape is identical at
   every LOD.
   Boulders (ejecta that fell back) settle in the floors of the larger craters.
5. Mining workings at each crystal site: three drill bores cut into the field, each with a scorched
   ring painted round it (drill scars), and heaps of tailings chips: lopsided double cones turned
   and stretched per axis by a hash of their position (irregular chips, not little blocks; hashed,
   not drawn, so every later bore and the triangle count stay put).
6. Colour per vertex over the project regolith strip (`regolith.ts`: per-cobble shade, large pale
   and dark clasts and low-roughness nickel-iron flecks; the cobble edges kept faint, since a crack
   network on every cell read as crazed mud): stony grey-brown, darker space-weathered rock away
   from the fresh impact, dust where n·z > 0.55; ore veins as four fault sheets through the body
   (planes bent by noise, so they cross craters instead of ringing them; the first contains the
   hero camera's line of sight so a vein crosses the face it sees), with a halo four LOD0 cells
   wide (the contact sheet draws one flat colour a triangle, so a hard band edge stair-steps along
   the cell grid); a crusted teal deposit with an edge round each crystal site; paler tailings
   round the workings; dark old crater floors; and the fresh crater — the mid-sized one facing the
   hero camera — with a bright floor, a blanket to ~2 r and rays to ~6 r. LOD2 (1.5 m cells, one
   flat colour a triangle) keeps only the broad blocks: veins as soft 1 m bands, deposit, crater
   floors and the fresh crater's blanket, no tone noise or rays (they made a checkerboard).
7. `bakeAo` (16 / 8 rays at LOD0 / LOD1) for crevice darkening; LOD2 is darkened to match.

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
