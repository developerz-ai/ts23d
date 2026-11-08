# Rocks and boulders playbook

Boulders, cobbles, outcrops, cliffs faces, scree, standing stones, river stones. Reference recipes:
[`boulders`](../../../recipes/boulders/README.md), [`asteroid`](../../../recipes/asteroid/README.md),
[`mountain_range`](../../../recipes/mountain_range/README.md). **Scale from grain size classes
and a human-scale object**: geologists name sizes (cobble 64–256 mm, boulder > 256 mm), and a
rock in a scene is judged against a person or a fence post.

## Research
Rock type determines form: igneous (granite: rounded, jointed blocks, tors), sedimentary
(sandstone/limestone: layered, flat bedding planes, overhangs), metamorphic (slate/schist:
foliated, sharp splitting). Look up the region's geology for the scene, then photograph-reference
that rock type: whole form, edge rounding, fracture pattern, lichen and moss.

| Class / feature | Size | Notes |
|---|---|---|
| gravel / pebble | 2–64 mm | Wentworth scale |
| cobble | 64–256 mm | |
| boulder | > 256 mm (game boulders 0.5–4 m) | |
| tor / outcrop | 3–20 m | granite joints 1–3 m apart |
| scree particle | 0.05–0.5 m, slope 30–37° (angle of repose) | |
| cliff bedding | 0.1–2 m beds (sandstone), joints vertical | |
| standing stone | 1–5 m tall, 0.5–1.5 m wide | |
| river stone | well rounded, sphericity high, flattened | |

Rounding: river and glacial stones are rounded; freshly broken rock (scree, quarry) is angular
with sharp edges and 2–10 mm chamfers. Weathered granite: rounded corners on blocky forms.

## Part tree
```
rock_<i> (static; one per boulder, merged for a cluster at LOD1/2)
├── moss_* / lichen_* (vertex colour or cards), grass_tuft_* at the base
└── embed: the bottom 10–30 % buried in the terrain
```
For clusters use one asset with seeded variation (`ctx.rng.fork('rock_3')`) and `place`.

## Motion
None. Rocks are static; sockets for gameplay (spawn, cover) as needed.

## Signature details
1. Big–medium–small forms: primary mass, secondary planes/facets, tertiary chips and cracks.
2. Flat fracture planes meeting at edges with small chamfers — not noise blobs.
3. Bedding lines on sedimentary rock; joints on granite; foliation on slate.
4. Burial: rocks sit IN the ground with soil and grass lapping the base.
5. Colour variation: darker cracks (cavity), lighter exposed tops, lichen patches, moss on the
   shaded/north side and in crevices.
6. Groups: one big rock with smaller fragments nearby (talus), not isolated identical stones.

## Materials
Nature strips `rock_strata` (layered), `cliff` (faces), `stone` (classic, tinted), `moss`, lichen
(via vertex colour), `gravel` / `sand` / `soil` at the base, `snow` caps above the snowline.
Use `bakeAo` for crevice darkening and `grime` with zones for wet bases.

## LOD policy
- LOD0: `sculpt` with plane cuts (box/half-space intersects) + noise displacement; 2–10k per
  hero boulder.
- LOD1: same SDF at lower resolution. 300–1,500.
- LOD2: 30–150 triangles; the silhouette and the top colour.
SDF meshing resolution is the LOD knob — never decimate.

## QA
```ts
real: { length: 2.4, width: 1.8, height: 1.4 },
checks: [touches('rock_*', 'ground')],
budget: { triangles: [8000, 1200, 120] },
```
Rocks seldom have sourced `measures`; state the intended size class in the dossier.

## Common mistakes
- Potato rocks: smooth noise blobs with no fracture planes.
- Rocks resting on top of the ground like eggs on a plate.
- Uniform grey; no moss, cavity darkening or top-lit lightening.
- Identical rocks repeated at the same rotation.

## Reuse
`sculpt` (edit lists: `box` cuts with `op: 'intersect'`, noise), `sdf` + `sd.*` combinators,
`valueNoise`, `fbm`, `ridged`, `terrace` (layered rock), `heightfield` for embedding. Techniques
from [terrain](terrain.md).

## Sources
- Grain size (Wentworth/Udden): https://en.wikipedia.org/wiki/Grain_size
- Angle of repose: https://en.wikipedia.org/wiki/Angle_of_repose
- Tor landforms: https://en.wikipedia.org/wiki/Tor_(rock_formation)
- Rock types: https://en.wikipedia.org/wiki/Rock_(geology)
