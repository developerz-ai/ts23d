# 03 — importModel: a textured, skinned, animated GLB as IR values (neural, tier 2)

Rule: nothing a model or Blender gave us is thrown away at the door.

## Files
| Path | State | Why |
|---|---|---|
| `src/neural/import-model.ts` + `.test.ts` | new | the reader |
| `src/neural/import-skin.ts` + `.test.ts` | new | JOINTS/WEIGHTS/inverse binds → `Armature` + per-vertex 4 influences by bone name |
| `src/neural/import-clips.ts` + `.test.ts` | new | glTF animations → core `Clip` tracks on bones (resampled to keys; translation/rotation/scale) |
| `src/neural/glb-scene.ts`, `src/neural/glb-read.ts` | changed | expose per-node primitives with UV, JOINTS_0, WEIGHTS_0, material images (albedo, normal, ORM) without merging |
| `src/neural/fixtures.ts` | changed | a tiny skinned, textured, animated GLB fixture built with `glb-write.ts` |

## Depends on
01 (`TextureSet`).

## Change
```ts
importModel(source: ImportSource | { bytes: Uint8Array; license: string; author: string; url?: string },
            o?: ImportOptions & { lodNodes?: readonly [string, string, string] /* default lod0..2 */; unit?: number }):
  ImportedModel
interface ImportedModel {
  readonly lods: readonly Mesh[];            // 1 or 3; UVs kept (not reprojected), white vertex colour, joints/weights when skinned
  readonly textures?: TextureSet;            // PNG bytes as found (JPEG/WebP: T3D_IMPORT_UNSUPPORTED naming the Blender `export` step)
  readonly armature?: Armature;              // bone names snake_cased (map returned), asset frame after the same reframe/fit as the mesh
  readonly clips: readonly Clip[];           // on the armature's bones
  readonly credit: string; readonly warnings: readonly string[]; readonly scale: number;
}
```
- Same licence gate, frame change (glTF Y-up → Z-up, +X front), fit (`height` / `fit`), placement as `importGlb` (`src/neural/import-glb.ts:76`); the SAME transform is applied to bones and clip translations. No `cleanMesh` by default (it would break weights and UVs); weld only exact duplicates.
- Weights renormalised to sum 1, ≤ 4; bones the skin does not use are kept when they are ancestors of used ones.
- Rest pose with rotated joint nodes is baked to translation-only rest (the exporter's rule, `src/export/skin.ts:1`): bind matrices recomputed, clip rotations re-expressed.
- Memoised by content hash + options.

## Tests
Failure first: skin with 5+ influences is reduced with a warning; JPEG image → error with fix; clip on a non-joint node ignored with a warning; mismatched LOD node names → error listing found names. Then: round trip with `glb-write` fixture (positions, UVs, weights by name, clip key values after reframe).

## Checks
`bun test src/neural` · `bun run verify --only lint,typecheck,boundaries,filesize`

## Docs
`docs/idea/21-import.md` (importModel section).

## Done when
The slice-02 smoke output and a Meshy rigged GLB (fixture-shaped) both import; tests green.
