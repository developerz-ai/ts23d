# 11 — Authoring materials: node graphs, edge wear, and the one trim sheet

**Substance Designer, Material Maker and ArmorPaint all run the same chain: noise → height → normal / AO / curvature → masks → albedo, roughness, metalness. ts23d's painter already runs that chain in TypeScript; what it lacks is curvature, so edges can't wear yet.** This page maps the material-authoring toolbox onto `src/material/` and proposes where edge wear and roughness variation should live, given that every asset shares one trim sheet ([04](04-materials.md), [ADR 008](../decisions/008-surface-materials.md)). Research as of 2026-11; everything under "Proposed" is **planned, not shipped**.

## How material artists work

| Tool | Model | Licence / cost | Source |
|---|---|---|---|
| Substance 3D Designer (Adobe) | Node graph of generators and filters, output = tileable PBR maps; **mesh-based mask generators** take baked curvature + AO | Commercial subscription | [Edge Damages node](https://helpx.adobe.com/substance-3d-designer/substance-compositing-graphs/nodes-reference-for-substance-compositing-graphs/node-library/mesh-based-generators/mask-generators/edge-damages.html) |
| Substance 3D Painter | Paint on the mesh; "smart materials" are generator stacks (Metal Edge Wear, …) driven by baked mesh maps | Commercial | [Metal Edge Wear](https://experienceleague.adobe.com/en/docs/substance-3d-painter/using/effects/generators/metal-edge-wear) |
| Material Maker | Node graph like Designer, also paints models; built on Godot | MIT ("files in this repository are licensed under the MIT license") | [GitHub](https://github.com/RodZill4/material-maker) |
| ArmorPaint (ArmorTools) | Painter-style 3D texture painting, node materials | Source zlib/libpng; "Distributed binaries are paid" | [GitHub](https://github.com/armory3d/armortools), [licence](https://raw.githubusercontent.com/armory3d/armortools/main/license.md) |
| Blender shader nodes + bake | Procedural nodes, baked to images with Cycles | GPL software; output is yours | [Blender licence](https://www.blender.org/about/license/) |

### The chain, step by step

| Step | What artists do | Why |
|---|---|---|
| 1. Shapes + noise | Tile generators (bricks, planks), Perlin/cells/fBm, warps | All structure starts as a greyscale field |
| 2. **Height** | Combine shapes into one height map | The single source of truth: everything else derives from it |
| 3. Normal | Gradient of height (Sobel / Scharr) at known texel size | Relief that lights correctly |
| 4. AO / cavity | Blur(height) − height, or ray-marched | Dirt collects, light doesn't reach |
| 5. **Curvature** | Convex edges (+) vs concave creases (−) from the height Laplacian, or baked from the mesh | Drives edge wear, dust, highlights |
| 6. Masks | Thresholded noise × curvature × AO; **slope blur in Min mode** to chew a mask edge into chips | Wear goes where it would happen physically |
| 7. Albedo / roughness / metal | Gradient-map masks into colour, roughness and metalness | Realism lives here: roughness *variation* reads as material more than colour does |

Edge damage specifically: Designer's **Edge Damages** "represents damage done to raised, convex edges based on curvature and baked AO" (both inputs required); Adobe's own tutorial chips a height map with slope blur / multi-directional warp in Min mode, then subtracts the damaged height from the original to extract the damaged areas ([tutorial](https://www.adobe.com/learn/substance-3d-designer/web/create-edge-damage)). Practitioners note low-poly hard edges give weak curvature bakes and UV seams break edge masks ([Unreal forum](https://forums.unrealengine.com/t/help-with-turning-a-curvature-map-into-a-mask-for-edge-wear/48349), [Polycount](https://polycount.com/discussion/comment/2571946)).

## What ts23d already has

| Chain step | ts23d today | Where |
|---|---|---|
| Canvas in real metres | Layers `height` (m), `tone`, `rough`, `metal`, `mix` (two-colour blend), `occl` | `src/material/paint/canvas.ts` |
| Shapes | Running-bond layout shared by bricks, stone, planks, slates, plates; SDF helpers for decal motifs | `paint/courses.ts`, `paint/shapes.ts` |
| Noise | Seeded, periodic-in-U value noise + fBm (strips tile) | `paint/noise.ts` |
| Normal | Sobel of height over texel size in metres, glTF tangent space | `paint/normal.ts` |
| AO / cavity | Blurred height − height, packed into ORM R; mild cavity darkening baked into albedo | `paint/orm.ts` |
| Masks | `rustStreaks`, `grime` (bottom pooling + rain streaks) | `paint/masks.ts` |
| Edge chips, texture-space | Paint films with `chips` revealing albedo2 (planks: mostly along board edges; metal; plates: chipped paint on edges) | `paint/planks.ts`, `paint/metal.ts`, `paint/plates.ts` |
| Measured PBR | 16 library strips with physicallybased.info reflectance, sRGB 30–240 albedo range | `src/material/library.ts` |
| Project materials | `defineMaterial({ kind, roughness, albedo, albedo2, params, paint })`; a `paint` layer gets a `PaintKit` (tileable noise, hash, smooth, `each`) and is NaN-checked | `define.ts`, `material-def.ts`, `paint/kit.ts` |
| Image inputs | PNG stamped into cells | `paint/stamp.ts`, `paint/decode-png.ts` |
| Mesh-space wear | `grime` (vertex colour near ground / zones), `bakeAo` (ray-cast AO into vertex colour), `livery` (paint by rules) | `src/passes/` |
| Shader-side wear | `ShaderHints.wear`: darkens + roughens **cavities** (1 − AO) and ground grime | `src/material/shader.ts` |
| Hard-surface realism | `box({ bevel })` chamfers, `weightedNormals` (big faces flat, bevels catch light) | `primitives/bevel-box.ts`, `passes/weighted-normals.ts` |

**The structural constraint.** A strip is shared by every asset and tiles along U, so the texture cannot know where *this* mesh's edges are. Substance bakes curvature per asset; ts23d can't, without giving up one material. So wear splits in two: **texture-space** wear (edges *inside* the pattern: brick arrises, plank ends, plate laps), which belongs in the painter, and **mesh-space** wear (the silhouette edges of this hull), which belongs in vertex data and the shader. Today only cavities are handled mesh-side; convex edges are not.

## Proposed (planned)

### 1. Texture-space curvature and `edgeWear` in the painter

```ts
// src/material/paint/curvature.ts — Laplacian of height (metres⁻¹), wraps along U for strips
export function curvature(c: Canvas, radiusMetres: number): Float32Array; // + convex, − concave
// src/material/paint/masks.ts
export function edgeWear(c: Canvas, o: {
  amount: number;        // 0..1, share of convex edge exposed
  width: number;         // metres of edge the wear can reach
  chip: number;          // 0..1 noise erosion of the mask edge (slope-blur-min analogue)
  to: 'albedo2' | 'lighter';   // reveal the second colour (bare metal, raw wood) or just lighten
  roughness?: number; metalness?: number;   // what is exposed (bare steel: 0.35, 1)
}, seed: number): void;
```

Exposed via `PaintKit.curvature()` and a shared `params.edgeWear` (like today's `params.grime`, `paint/strip.ts`), so every strip kind gets it. Chipping: threshold `curvature × (1 + chip·fbm)`, then a min-filter pass in a noise-warped direction: deterministic, a few lines, no GPU. Size: **S**.

### 2. Mesh-space convexity → edge wear in vertex data

```ts
// src/passes/edge-wear.ts
export interface EdgeWearOptions {
  readonly angle?: number;       // dihedral (°) that counts as an edge; default 30
  readonly width?: number;       // metres the wear spreads from the edge (geodesic, capped)
  readonly amount: number;       // 0..1
  readonly lighten?: number;     // vertex-colour lift on worn edges (scuffed paint)
  readonly attribute?: boolean;  // also write a `_WEAR` 0..1 vertex attribute for the shader
}
export function edgeWear(mesh: Mesh, o: EdgeWearOptions): Mesh;
```

Per-vertex convexity from the signed dihedral angles of incident edges (polygon meshes), or from the field Laplacian for `sdf`/`sculpt` meshes (the SDF Laplacian is the level set's mean curvature up to a convention factor, because |∇d| = 1; [StEik, eq. 14](https://arxiv.org/pdf/2305.18414)). `head-tone.ts` already probes the field for cavity; convexity is the same probe with the other sign. Lightening vertex colour works in every engine with no shader; `_WEAR` follows the `_WIND` precedent and lets `threeMaterialSource` / `godotShaderSource` blend toward bare metal (`mix`, roughness down, metalness up) per pixel. Needs the GLB writer to emit `_WEAR` (an UNOWNED change in `src/export/`). Size: **M**.

### 3. An `edge` trim row: the trim-sheet way to wear edges

Production trim sheets carry dedicated bevel/edge strips: a chamfer mapped to a strip that is painted worn ([docs/idea/13](13-asset-pipeline-research.md#trim-sheets)). `box({ bevel })` already emits chamfer quads; mapping them to a `worn_edge` strip (bright scuffed metal or paint over primer, `edgeWear` at 100%) gives pixel-sharp wear on every bevelled asset with no new attribute and no new material. Costs one strip row (28 rows today, 4 custom slots: `trim-sheet.ts`). Size: **S–M**.

### 4. Roughness variation as a first-class knob

Every painter writes `rough`; add `roughnessVariation` (0..1, default from the library) to `MaterialDef`, applied as low-frequency fBm + cavity-driven increase (dirt is rougher) + edge-driven decrease (handled edges polish). Validate that a strip's roughness histogram is not flat: a `material` test fails a strip whose roughness standard deviation is below a floor (a flat roughness map is the first sign of a CG look). Size: **S**.

### 5. A node-graph-shaped helper API, as functions

Node graphs are hard for agents to diff ([ADR 001](../decisions/001-recipe-compiler-over-ai-meshes.md)); plain composable functions are not. Wrap the painter internals as pure layer ops a `defineMaterial({ paint })` can chain:

```ts
paint(s, kit) {
  const h = kit.layer();                        // Float32Array, metres
  kit.cells(h, { size: 0.04, jitter: 0.8 });    // Voronoi stones
  kit.add(h, kit.fbm({ size: 0.3, amp: 0.002 }));
  const wear = kit.mask(kit.curvature(h), { above: 0.6, chip: 0.5 });
  kit.write(s, { height: h, rough: kit.lerp(0.7, 0.4, wear), mix: wear });
}
```

`PaintKit` (`paint/types.ts`) is the place. Ops: `layer`, `fbm`, `cells` (Voronoi/Worley), `tiles`, `warp`, `slopeBlur`, `blur`, `curvature`, `mask`, `levels`, `lerp`, `write`. Each is a tested pure function over typed arrays, periodic in U. Size: **M**.

### 6. Texel-density gate

The sheet is 2048² at 64 px per strip row; a strip is 2 m along U (`trim-sheet.ts`), i.e. ~1024 px/m along U at 2048². Industry examples: 10.24 px/cm first person, 5.12 px/cm third person ([Maxon: Texel density](https://help.maxon.net/c4d/en-us/Content/html/Texel_Density.html)). Strips are anisotropic (V spans `scaleMetres`), so a `texel-density` QA gate should report px/m along U and V per part and flag parts below a target, and faces where V is stretched (the `box` known limit in [04](04-materials.md#known-limits)). The roadmap already lists "Gates: … texel density" (M2). Size: **S–M**.

### 7. CC0 photo textures as *inputs* to strips (not as maps)

ambientCG / Poly Haven / cgbookcase sets are CC0 ([13](13-asset-pipeline-research.md#free-cc0-libraries)). Copying their colour maps into the sheet breaks the greyscale-tint model and the size budget. Better: use them as **calibration** (sample albedo and roughness histograms to set `MaterialDef` numbers, cite the URL in `sources`) and, for a few strips, as a **height source**: a vendored CC0 displacement PNG, resampled to the strip, then run through the same normal/AO/curvature chain so it stays consistent. Vendored with a hash; never fetched at build time. Size: **M**.

## Next steps for ts23d (prioritised)

1. **`curvature()` + `edgeWear` mask in the painter**, exposed as `params.edgeWear` on every strip and on `PaintKit`. S.
2. **`edgeWear(mesh)` pass**: dihedral convexity (polygon) / Laplacian (SDF) → vertex-colour lift. S–M. Then `_WEAR` attribute + shader-source support. M.
3. **`roughnessVariation`** on `MaterialDef` + the flat-roughness test. S.
4. **`worn_edge` strip** mapped by `box({ bevel })` chamfers. S–M.
5. **`PaintKit` layer ops** (fbm, cells, slopeBlur, mask, levels, lerp, write). M.
6. **Texel-density gate** (px/m per part, V-stretch warning). S–M.
7. **CC0 height sources + calibration workflow** documented in the author-recipe skill. M.

## Sources

- Adobe: [Edge Damages](https://helpx.adobe.com/substance-3d-designer/substance-compositing-graphs/nodes-reference-for-substance-compositing-graphs/node-library/mesh-based-generators/mask-generators/edge-damages.html), [Leather Wear](https://helpx.adobe.com/substance-3d-designer/substance-compositing-graphs/nodes-reference-for-substance-compositing-graphs/node-library/mesh-based-generators/mask-generators/leather-wear.html), [Create edge damage tutorial](https://www.adobe.com/learn/substance-3d-designer/web/create-edge-damage), [Painter Metal Edge Wear](https://experienceleague.adobe.com/en/docs/substance-3d-painter/using/effects/generators/metal-edge-wear)
- [Material Maker](https://github.com/RodZill4/material-maker) (MIT, Godot) · [ArmorTools](https://github.com/armory3d/armortools) (zlib source, paid binaries)
- Curvature of an SDF: Yang et al., "StEik", 2023, [arXiv:2305.18414](https://arxiv.org/pdf/2305.18414)
- Texel density examples: [Maxon Cinema 4D docs](https://help.maxon.net/c4d/en-us/Content/html/Texel_Density.html)
- Edge-mask pitfalls: [Unreal forum](https://forums.unrealengine.com/t/help-with-turning-a-curvature-map-into-a-mask-for-edge-wear/48349), [Polycount](https://polycount.com/discussion/comment/2571946) (practitioner reports)
