# 05 — GLB writer: texture sets as materials on every LOD (export, tier 3)

Rule: a textured part exports as one extra material per set, declared in extras, byte-deterministic.

## Files
| Path | State | Why |
|---|---|---|
| `src/export/texture-sets.ts` + `.test.ts` | new | images, textures, materials for `TextureSet`s; dedupe across LODs |
| `src/export/glb.ts`, `src/export/primitive.ts`, `src/export/materials.ts` | changed | pick the set's material; TANGENT (MikkTSpace-compatible, `tangents.ts`) when a normal map is present; COLOR_0 kept only when not all-white |
| `src/export/lod-coverage.ts`, `src/export/metadata.ts` | changed | `extras.ts23d.textureSets` (name, size, maps, credit); draw accounting counts the set's material |
| `src/cli/manifest.ts` (+ test) | changed | manifest lists texture sets and their bytes |

## Depends on
01.

## Change
- Material: `baseColorTexture` (sRGB), `normalTexture`, `occlusionTexture` + `metallicRoughnessTexture` (same ORM image) or factors; `alphaMode: MASK` for `cutout`. Sampler: linear mip, repeat.
- MSFT_lod trees share the images; split-LOD files each embed them.
- `withOwnTextures` (`src/export/own-textures.ts`) stays for `scripts/import-textured.ts`; note in its header that new code uses `PartOptions.textures`.
- Skinned + textured primitives carry JOINTS/WEIGHTS as today (`src/export/skin.ts`).
- Draw budget: one draw per (pivot, material) as today; a textured skinned body is one draw.

## Tests
Failure first: a part whose UVs leave 0..1 by more than a texel on a non-tiling set warns; a normal map without UVs errors. Then: two LODs share one image index; glTF validator-style structural checks used by existing export tests; bytes identical across two runs.

## Checks
`bun test src/export src/cli/manifest.test.ts` · `bun run verify --only lint,typecheck,boundaries,filesize`

## Docs
`docs/architecture/gltf-capabilities.md`.

## Done when
A compiled asset with a textured skinned part opens in F3D / three.js with its maps on all three LODs.
