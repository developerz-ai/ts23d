# 19 — VDM stamps: vector-displacement detail as sculpt edits (primitives tier 2, material)

Rule: secondary/tertiary organic detail (scales, warts, horn bases, tooth sockets, pores, scars) is a placed stamp with position, normal frame, scale and seed — never hand-scattered noise.

## Files
| Path | State | Why |
|---|---|---|
| `src/primitives/vdm.ts` + `.test.ts` | new | `VdmStamp { size, grid: Float32Array (x,y,z per texel, metres at unit size), lipschitz }`; `vdmEdit(stamp, { at, normal, up, scale, depth, blend })` → sculpt field edit: inverse-map the query into the stamp frame, sample the displacement trilinearly, subtract along the frame; declared Lipschitz for the sparse fold |
| `src/primitives/vdm-library.ts` + `.test.ts` | new | procedural stamps, seeded: `scalePatch` (overlapping keeled scales), `wart`, `hornBase` (ringed collar), `toothSocket`, `poreField`, `scarWelt`, `furrow` |
| `src/primitives/vdm-scatter.ts` + `.test.ts` | new | anchored placement along a surface: Poisson-disk on the block-out field (`ctx.rng`), frame from ∇f + flow field (07), density/size masks by zone |
| `scripts/vdm-import.ts` + `.test.ts` | new | optional: CC0 VDM brush (EXR/PNG vector map) → committed quantised `.vdm.bin` with source URL + licence + sha256 (import-licence rules) |
| `src/primitives/sculpt-edit.ts` | changed | `vdm` edit kind |

## Depends on
04 (sculpt engine), 07 (flow field for scale orientation).

## Change
- LOD: stamps LOD0 only by default (`lod: [true, false, false]`), LOD1 opt-in at reduced depth; LOD2 carries them in colour (08 maps).
- Budget-neutral: they change the field, not the triangle count; with the hero tier (11) they bake to normal maps.
- Determinism: stamp grids are code or committed quantised data; placement from `ctx.rng`.

## Tests
Failure first: a stamp declared with too low a Lipschitz is caught by `probeLipschitz`; a wart on a sphere raises the surface by `depth` ± 5 % at its centre and leaves it unchanged beyond `size`; scale-patch orientation follows the flow field.

## Checks
`bun test src/primitives/vdm*.test.ts scripts/vdm-import.test.ts` · `--only lint,typecheck,boundaries,determinism,filesize`

## Docs
`docs/idea/10-sculpting.md` (VDM section), creature-artist + character-artist skills.

## Done when
Dragon scales and the orc's warts/scars/tusk collars are VDM stamps; detail row up in the panel critique.
