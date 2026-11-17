# 01 — Textured parts in the IR (core, tier 0)

Rule: a part may carry its own texture set on every LOD; it is opt-in, counted and visible.

## Files
| Path | State | Why |
|---|---|---|
| `src/core/texture-set.ts` + `.test.ts` | new | `TextureSet`, `checkTextureSet`, PNG header read (size, colour type) |
| `src/core/part.ts` | changed | `PartOptions.textures?: TextureSet`; `Part` carries it |
| `src/core/asset.ts`, `src/core/definition.ts` | changed | carry through compile and `ctx.use`; `Budget.textureSets?: { count: number; size: 1024 \| 2048 \| 4096 }` |
| `src/core/validate-asset.ts` | changed | refuse over-budget / undeclared sets |
| `src/core/errors.ts` | changed | `T3D_TEXTURE_INVALID` |
| `docs/decisions/016-textured-parts.md` | new | ADR: model-built organic parts keep their own textures on all LODs; trim sheet stays the default; supersedes the LOD0-only limit of ADR 012 for imported/model parts only |

## Depends on
Nothing.

## Change
```ts
export interface TextureSet {
  /** Stable name; parts sharing a name share one material (one draw per pivot still holds). */
  readonly name: string;
  /** PNG bytes. sRGB base colour (RGB or RGBA; alpha = cutout mask when the part is `cutout`). */
  readonly albedo: Uint8Array;
  /** PNG bytes, tangent-space normal, glTF green-up (MikkTSpace from the part's UVs). */
  readonly normal?: Uint8Array;
  /** PNG bytes, R occlusion · G roughness · B metallic. */
  readonly orm?: Uint8Array;
  /** Used when `orm` is absent. Defaults 0.8 / 0. */
  readonly roughness?: number;
  readonly metallic?: number;
  /** Where the pixels came from (model, licence): goes to the manifest and GLB extras. */
  readonly credit?: string;
}
```
- A textured part's `mesh.uvs` address the set (0..1, V down as in glTF); its vertex colour multiplies the albedo (white = unchanged).
- Only `opaque` and `cutout` surfaces; no `paint`, no `finish` on a textured part (`T3D_TEXTURE_INVALID`, fix names the option to drop).
- `Budget.textureSets` required when any part has `textures`; count = distinct names; each map ≤ `size`², square, power of two. Missing declaration: `T3D_TEXTURE_INVALID` with `fix: declare budget.textureSets: { count: 1, size: 2048 }`.
- Same name with different bytes in one asset: error.
- Bytes are compared by identity then length+content hash once per compile (memoised); no decode in core beyond the PNG IHDR.

## Tests
Failure first: undeclared budget, size over cap, non-PNG bytes, non-square, `paint` + `textures`, same name different bytes. Then: carried through `compile` at each LOD and through `ctx.use` (prefix does not rename the set).

## Checks
`bun test src/core` · `bun run verify --only lint,typecheck,boundaries,filesize`

## Docs
ADR 016; `docs/idea/03-ir.md` (TextureSet), `docs/architecture/errors.md` line reported to the coordinator.

## Done when
Tests green; slices 05–07 can import `TextureSet` from `../core/index.ts` (coordinator adds the export).
