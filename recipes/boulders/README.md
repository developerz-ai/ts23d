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
Three shape families: angular (0.6 m, 2.4 m: frost-split), a slab (1.3 m, sheeted granite: a
tilted top along the sheeting joint and a diagonal end break) and a rounded core-stone (1.6 m).
Pitting is applied to the weathered mass first; the fracture planes cut it afterwards, so split
faces stay flat and their edges crisp. Each rock is sunk 5–10 cm (its bearing face is a section,
not its rounded underside). Material: `granite.ts`, a project strip with isotropic features only
(biotite clots, quartz patches, feldspar mottling, ≥ 10 cm since a 3 m band holds only a few dozen
texels), so the SDF's box-projected UVs never show; the library `cliff` strip drew joint networks
that read as painted outlines. Age in vertex colour: soil splash at the foot, moss on north faces,
in hollows and in damp cushions, lichen rosettes on sunny tops. Cells scale with each rock.

## Parts the engine needs
`boulder_0` … `boulder_3`: one static mesh each, base at z = 0 (the flat bearing face), laid out
along +Y with 0.5 m gaps so the contact sheet shows the set; `soil_0…3` (a gravel skirt at each
foot) and `pebbles_0…3` (three half-buried pebbles each, LOD0/1). One shared material.

## Budget
The asset is a set of four rocks (0.6 m to 2.4 m), one part each. Per rock it sits at or under
the rock band: 4.6k–10.8k at LOD0 (the 2.4 m rock 8% over), 0.6k–1.4k at LOD1 (cell 0.1 m × size)
and 56–132 at LOD2 (cell 0.3 m × size, from 0.21 m on 2026-11-19: 856 → 432 triangles).

Budget why: a scatter set of four boulders in one file, one part each and each about one rock band (≤ 10.8k / 1.4k / 132), so the set's sum is four bands, not one oversized rock.

## Open questions
Rock type is left to the palette (grey granite here); limestone or sandstone is a colour swap.
