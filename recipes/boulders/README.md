# Boulders — a set of four weathered granite/limestone boulders

## Identity
Generic alpine/glacial erratics for scattering on terrain tiles (see `mountain_range`). What makes
them read as rock rather than blobs: **a flattened, blocky core** (two or three intersecting or
smooth-unioned masses, never a sphere), **fractured facets** (a flat cut plane or two), **pitted,
weathered surface** (fractal value-noise displacement, larger features than the strip texture), a
**flat bearing face** where it sits on the ground, and **lichen/moss on the upward faces**.

## Specs
General values cited from prior knowledge, **unsourced / approximate**.

| Quantity | Value | Used as | Source |
|---|---|---|---|
| boulder (Udden–Wentworth: > 256 mm) | 0.26 m and up | smallest ~0.6 m | unsourced, approximate (standard grain-size class) |
| typical field / glacial erratic boulders | 0.5–3 m | 0.6, 1.0, 1.6, 2.4 m long | unsourced, approximate |
| height / length of resting boulders | ~0.4–0.7 (they settle on a broad face) | 0.45–0.65 | unsourced, approximate |
| moss / lichen | on the tops and the shaded side, not the bearing face | normal-based tint | observation |

## Photos (by view)
To be added (no web access in this session).

## How it is built
Three shape families: angular (a 0.85 m tall frost-split block standing on end, and the 2.4 m
boulder), a slab (1.3 m, sheeted granite: a tilted top along the sheeting joint and a diagonal end
break) and a rounded core-stone (1.6 m, 1.3 m tall, half-buried: sunk 0.55 m).
Pitting is applied to the weathered mass first; the fracture planes cut it afterwards, so split
faces stay flat and their edges crisp. Frost cracks (1–2 per rock, LOD0 geometry) are V-grooves
9 cm wide at the surface closing at 12 cm depth (a wedge meshes cleanly where a one-cell slot
stair-steps), on a plane bent by the grain noise, dark and mossy inside (the colour line stays at
LOD1/2). Each rock is sunk 5–10 cm (its bearing face is a section, not its rounded underside),
the core-stone 55 cm. Material: `granite.ts`, a project strip with isotropic features only
(biotite clots, quartz patches, feldspar mottling, ≥ 10 cm since a 3 m band holds only a few dozen
texels), so the SDF's box-projected UVs never show; the library `cliff` strip drew joint networks
that read as painted outlines. Age in vertex colour: soil splash at the foot, moss on north faces,
in hollows and in damp cushions, lichen rosettes on sunny tops, a dark damp band over the bottom
25 cm; LOD2's 0.3 m cells miss most moss and lichen, so a broad green-grey film (18 % moss)
keeps LOD0's mean tint. Cells scale with each rock's largest side
(× 0.8–1.45 of 1.5 m). Skirts: grus (decomposed granite) on the `sand` strip reaching ~0.32 m past
each rock in a lobed outline (three soft waves, no saw-tooth rim), 1 mm over the ground, damp and
dark at the foot, drying to a grey-washed dust over the outer half so they fade into the ground
instead of ending as a hard mat; six pebbles each (three at LOD1) in mixed greys and browns,
resting on the soil. LOD2's skirt is one fan of long triangles, which cannot carry the strip at
true scale (V squeezed into each drew plank-like streaks): it is flat colour on the `plain` row,
the mid soil tone times the sand strip's mean albedo. Nothing goes below z = 0, so the studio floor (the asset's lowest point)
is the skirts' own plane and they cast no drop shadow.

## Parts the engine needs
`boulder_0` … `boulder_3`: one static mesh each, base at z = 0 (the flat bearing face), laid out
along +Y with 0.5 m gaps so the contact sheet shows the set; `soil_0…3` (a grus skirt at each
foot) and `pebbles_0…3` (six / three pebbles each, LOD0 / LOD1). One shared material.

## Budget
The asset is a set of four rocks (0.6 m to 2.4 m), one part each. Per rock it sits at or under
the rock band: 4.7k–9.4k at LOD0, 0.5k–1.1k at LOD1 (cell 0.1 m × size) and 44–108 at LOD2
(cell 0.3 m × size). Set total 35.2k / 4.5k / 376 (skirts and pebbles included).

Budget why: a scatter set of four boulders in one file, one part each and each about one rock band (≤ 10.8k / 1.4k / 132), so the set's sum is four bands, not one oversized rock.

## Open questions
Rock type is left to the palette (grey granite here); limestone or sandstone is a colour swap.
