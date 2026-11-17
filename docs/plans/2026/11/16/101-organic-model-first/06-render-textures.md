# 06 — Renderers sample texture sets (render, tier 3)

Rule: what the agent reads in `hero.png` and `sheet.png` is what the GLB shows.

## Files
| Path | State | Why |
|---|---|---|
| `src/render/texture-sets.ts` + `.test.ts` | new | decode a `TextureSet` (PNG → linear mips via existing `texture.ts` machinery), cache by set name + hash |
| `src/render/scene.ts`, `src/render/shade.ts`, `src/render/texture.ts` | changed | per-triangle texture-set index; albedo, normal (tangent frame from UVs), ORM sampling |
| `src/render/path/surf.ts`, `src/render/path/world.ts` | changed | the path tracer reads the same |
| `src/render/sheet.ts`, `src/render/part-masks.ts` | changed | contact sheet + masks unaffected in layout, textured in colour |

## Depends on
01.

## Change
- PNG decode through the existing reader (`src/neural/png-read.ts` is tier 2: allowed downward import from render).
- Texture sets clamp (no U repeat), bilinear + mips; normal map applied with the UV tangent frame (`passes/uvTangents`) so it matches the export.
- Fur/skin response: textured `creature` parts use the existing sheen/SSS look classes where the kind asks for them (`src/render/path/classes.ts`); default is plain dielectric at the set's roughness.
- Memory: maps decoded once per process; 2048² RGBA mips ≈ 22 MB each, released with the scene.

## Tests
Failure first: a set that fails to decode surfaces as `T3D_TEXTURE_INVALID` with the part name, not a grey render. Then: a quad with a 2×2 checker renders four colours in raster and path renders; a flat normal map changes nothing; a tilted one shifts shading the expected way.

## Checks
`bun test src/render` · `bun run verify --only lint,typecheck,boundaries,filesize` · `bun run t3d shot` on a fixture recipe, PNG read.

## Docs
`docs/idea/24-path-tracer.md`, presentation-artist skill line (slice 13 writes it).

## Done when
A textured fixture renders textured in `sheet.png`, `hero.png` (raster and path).
