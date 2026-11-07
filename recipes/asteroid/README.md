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

The base rock (`#3b3632`/`#4f4841`) is C-type dark. The ore veins (`#b78a45`) stand in for
M-type metal. The glowing crystals (`#3fe0d0`) are a game convention, not science.

## How it is built
`sdf({ field, resolution: ctx.pick([0.17, 0.38, 0.95]) })` over one field:
1. An ellipsoid core plus three smooth-unioned ellipsoid lobes.
2. `valueNoise` displacement: 0.65 m at a 2.8 m feature size, plus 0.12 m pitting at 0.8 m.
3. Twelve fracture half-spaces, smooth-max'd (k = 0.12 m), which give the angular facets.
4. Nine craters. Each is a radial rim bump that displaces the surface, then a smooth-subtracted
   bowl sphere. All shape draws come from `ctx.rng.fork('shape')`, so the shape is identical at
   every LOD.
5. Colour per vertex: blended tone noise, dust where n·z > 0.55, ore veins where |noise| < 0.05
   (teal near crystals), dark crater floors.
6. `bakeAo` (16 / 8 rays at LOD0 / LOD1) for crevice darkening.

The bottom is clipped flat at z = 0 by the SDF bounds, so the rock rests on the ground (or in a
field). The core sits below every variant's z radius, so the clip always happens.

## Parts the engine needs
`rock` (the mass; also usable as a collider at LOD2), `ore_crystals` (glow), interact sockets
`mine_point_0…3` (at each cluster, facing into the rock, `data: { resource, yield }`), emitter
`dust` (`event`, for mining debris).

## Open questions
- `real` is not declared: the size of a procedural rock is a design choice, not a spec, and the
  noise moves its extents by ±10 %. The budget is measured per seed instead.
- No in-library "surface point along a ray" helper exists, so the recipe bisects its own field to
  seat the crystals. A `sdfSurface(field, from, dir)` helper would make this reusable.
