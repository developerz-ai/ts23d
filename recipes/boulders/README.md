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

## Parts the engine needs
`boulder_0` … `boulder_3`: one static mesh each, base at z = 0 (the flat bearing face), laid out
along +Y with 0.5 m gaps so the contact sheet shows the set. One shared material.

## Open questions
Rock type is left to the palette (grey granite here); limestone or sandstone is a colour swap.
