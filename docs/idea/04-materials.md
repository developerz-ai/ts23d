# 04 — Materials

**Every asset shares one texture set: a 1024² trim sheet, tinted by vertex colour, under at most four surface materials (opaque, cutout, glass, translucent).** One texture set for everything (with static geometry batched per pivot, draw calls = the parts the engine moves), equal texel density across assets, and a palette swap is a recipe edit, never a new texture. Source: `src/material/`. Decisions: [ADR 003](../decisions/003-shared-trim-sheet.md), superseded by [ADR 008](../decisions/008-surface-materials.md) (surfaces).

## Status (2026-10-25)

| Piece | Status |
|---|---|
| Trim-sheet layout: 8 strips, 6 decal cells, 11 foliage cells | Shipped |
| UVs authored against the layout by every primitive | Shipped |
| Palettes + `hex()` sRGB → linear | Shipped |
| `grime` pass (vertex-colour wear) | Shipped |
| ≤ 4 shared materials per GLB (opaque, cutout, glass, translucent) over one sheet | Shipped |
| `paintTrimSheet`: procedural albedo / normal / ORM | Shipped |
| Sheet in the GLB: embedded, or shared external PNGs | Shipped |
| `threeMaterialSource` (TSL) and `godotShaderSource` (.gdshader): wind, window glow, wear | Shipped |
| KTX2 (`KHR_texture_basisu`) | Planned |
| `kubeezImages`: image source for decals / texture sources | Planned, M5 |

## The trim sheet

| Region | Contents | Mapping |
|---|---|---|
| Strips: 8 rows, each 1/16 of V, full U | `plain` `brick` `stone` `slate` `iron` `wood` `glass` `concrete` | Tile along U; one strip rect = 2 m of surface |
| Cells: 1/8 × 1/8 squares from V = 0.5 | `window_sash` `door_panel` `clock` `smokebox` `sign` `porthole` | Fixed decals; one cell = 1 m |

`stripRect(id)` / `cellRect(id)` return `{ u0, v0, u1, v1, metres }`. `metres` is the point: a primitive maps UVs by world size, so a 6 m wall and a 0.4 m crate show bricks at the same size.

A primitive takes `strip?: StripId` (default `plain`). Cells are used by the planned `cell()` primitive (M1).

## Colour: palettes and vertex colour

The sheet is greyscale detail (mortar lines, grain, rivets); hue comes from `COLOR_0`, multiplied over it.

```ts
import { definePalette, palettes } from '@developerz-ai/ts23d';

const livery = { ...palettes.victorianRail, paint: palettes.victorianRail.red };   // repaint = spread
const custom = definePalette({ hull: '#203040', deck: '#8a6f4e' });            // sRGB hex in, linear out
```

| Palette | Keys |
|---|---|
| `victorianRail` | `paint` `trim` `iron` `brass` `red` |
| `artDeco` | `limestone` `steel` `glass` `bronze` |
| `modernGlass` | `glass` `aluminium` `concrete` |
| `harbour` | `hull` `deck` `white` `red` |

Era/region palettes are data. Add one in `src/material/palette.ts` with the era in the key name.

## Wear: passes

`/passes` post-processes a finished mesh, so recipes stay about shape. Shipped: `grime(mesh, { ground?, groundStrength?, zones? })` darkens vertex colour below `ground` metres of the mesh's own z, not world z (mud, dust) and inside spherical `zones` (`{ at, radius, strength }`: soot round a chimney, oil under an engine).

```ts
ctx.part('hull', grime(box({ size: [6, 3, 1.5], color: green, strip: 'iron' }), { ground: 0.6 }));
```

## Shader sources

Per-asset effects that keep the shared material. Generated per engine from the same hints:

| Function | Output | Hints |
|---|---|---|
| `threeMaterialSource(hints)` | three.js TSL node-material source | `wind: { strength }`, `windowGlow: { color, ratio }`, wear |
| `godotShaderSource(hints)` | Godot `.gdshader` source | same |

Wind is crown `sway` motion in the GLB today; per-vertex wind weights are planned.

## Procedural material generator

`paintTrimSheet(recipe = DEFAULT_SHEET): PaintedSheet` paints the whole sheet from code at a fixed seed, so textures are as deterministic as meshes.

| Output | Format |
|---|---|
| `albedo` | RGBA8, sRGB. Greyscale detail, tinted by vertex colour; foliage cells are the exception (coloured albedo, alpha = leaf mask) |
| `normal` | RGBA8, tangent space |
| `orm` | RGBA8: R occlusion · G roughness · B metalness |

| Size | Paint time (measured) |
|---|---|
| 512² | ≈ 0.22 s |
| 1024² (default) | ≈ 0.8 s |
| 2048² | ≈ 2.95 s |

Strip kinds (`StripRecipe.kind`): `bond` · `planks` · `plates` · `noise` · `flat` · `slate` · `concrete` · `glass`, with `scaleMetres`, `roughness`, `metalness` and per-kind params. Cells: 6 decal cells (window sash, door panel, clock, smokebox, sign, porthole) and 11 foliage cells.

### Getting it into the GLB

| Library | CLI | Result |
|---|---|---|
| `toGlb(a, { sheet })` | `--sheet embed` | Textures inside each GLB |
| `toGlb(a, { sheet: { external: true, prefix } })` | `--sheet external` (default) | `out/trim_sheet_{albedo,normal,orm}.png` written once; every GLB references `../trim_sheet_*.png` |
| no `sheet` | `--sheet none` | Vertex colour only |

`--sheet-size 512|1024|2048`. `TANGENT` is emitted only when a sheet is bound. The `material_swatches` recipe shows every strip and cell.

### Known limits

- Strips are 64 texels tall at 1024²; a strip is 2 m of surface.
- `box` stretches V over the whole face, so tall faces stretch the strip vertically.
- Mips blend neighbouring strips from mip level 3.
- No KTX2 yet; PNG only.

### Image sources

Code paints the base; images add what code paints badly: signage, logos, weathering photos, concept-art colour.

- Cells accept `{ image: Uint8Array }` instead of a recipe: stamp a decal.
- Recommended source: **[kubeez.com](https://kubeez.com)** (a partner) for reference/concept images, decals and texture source images. Planned adapter: `kubeezImages({ apiKey })` in `/neural` ([08](08-neural-adapters.md)). The key is passed by the caller, never read from the environment.
- Any function returning PNG bytes fits the `ImageSource` interface.
- Generated images are cached by (source, prompt, seed) like generated meshes, so rebuilds need no network.

Images are inputs, never the only path. The sheet must paint without them.
