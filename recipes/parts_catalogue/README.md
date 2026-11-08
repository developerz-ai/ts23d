# Parts catalogue — the shared parts kit on display (`parts_catalogue`)

## Identity
A showroom for [`recipes/_parts`](../_parts/README.md), the define-once, reuse-everywhere kit
(`definePart`, [docs/idea/14-parts.md](../../docs/idea/14-parts.md)). Every part stands at its
real-scale defaults on a concrete plinth, with a raised label in front: a panelled door, a casement
window, a fixed ladder, a pendant lamp hanging from a gallows built from two `steel_beam` calls, a
guard railing; a steel drum, an oak cask, a crate, a chair and a stool; a workbench with four bolt
sizes (M8–M24) and their nuts and washers, a rivet row, a hinge, a lever handle, a chain, a spring,
a valve handwheel and a flange; a flanged pipe, a hose, a wheel and two beam sections on the floor.
It is also the composition test: `flange` carries `hex_nut`, `pipe` carries `flange`,
`panel_door` carries `hinge` (split across frame and leaf) and `door_handle`.

## Specs
A display piece, not a real object. Each part's own numbers and their sources are in its header
comment; the main ones:

| Part / dimension | Value | Source |
|---|---|---|
| plinth (L × W × H) | 5.0 × 7.0 × 0.1 m | design |
| workbench top height / size | 0.90 m / 0.8 × 2.3 m | design (typical bench height) |
| hex bolt, nut, washer | ISO 4017 / 4032 / 7089 tables (M8–M24) | `_parts/metric.ts` |
| panel door leaf | 0.85 × 2.03 × 0.04 m in a 0.86 × 2.04 m opening | common internal door, 826 × 2040 × 40 mm |
| ladder | 0.5 m between stringers, rungs every 0.28 m | EN ISO 14122-4 |
| railing | handrail 1.1 m, knee rail, 0.1 m toe board, Ø 42 mm tube | EN ISO 14122-3 |
| steel drum | Ø 0.585 × 0.88 m, two rolling hoops | ISO 15750 (200 L) |
| flange (DN100 PN16) | Ø 220 mm, 8 × M16, pipe Ø 114.3 mm | EN 1092-1 |
| wheel | 0.63 m tyre on a 0.43 m (17") rim, 0.22 m wide | 225/45 R17 |
| I-beam | 200 × 100 mm, web 5.6, flange 8.5 | IPE 200 (EN 10365) |

## Photos (by view)
None: the reference for each part is its standard (above). Compare `out/parts_catalogue/hero.png`
with the per-part thumbnails in [`recipes/_parts/out/`](../_parts/out/).

## Parts the engine needs
Every part keeps its kit name as a prefix (`door_leaf`, `hinge_leaf`, `lamp_glow`, `bolt_m24`,
`label_*`). Moving: `door_leaf` and `hinge_leaf` sway 90° one way about their pins; `wheel` spins
about Y. `lamp_glow` is emissive. Small fasteners drop out at LOD2, rivets at LOD1 (their `lod`
policy).

## Open questions
- The sway clash gate sweeps a conservative sector, so a hinged leaf lists its frame (`clearOf`)
  even though it turns away from it; the reason is written next to each `clearOf` in the parts.
- Paint chips and grain are the material library's strips; the parts only pick strips and tints.
