# AI finish: code builds the structure, a model adds the surface

Code is good at what an asset IS: dimensions, named parts, pivots, motion, three LODs, colliders,
sounds, QA. Image models are good at what a surface LOOKS like: soot, rust, wear, grain. The finish
layer joins them without letting the model touch the structure: the model only ever sees and returns
2D images aligned to deterministic control maps, and those images are projected back onto a texture
of the code-built asset.

```
concept → recipe (code) → compile ──────────────────────────────► GLB (geometry, parts, LODs …)
                             │                                        ▲
                             └► control maps ─► model ─► bake ─► finish material on LOD0
```

Module: `@developerz.ai/ts23d/finish` (tier 4). CLI: `t3d finish`. Shipped: everything below with a
procedural mock model and an HTTP adapter; no hosted provider is wired yet (planned, interface only).

## 1. Control maps (`controlViews`, `exportControlMaps`)

N views (default 8): N−1 orbiting at 20° elevation starting at the hero 3/4 (−35°), plus one from
above. Per view, `width × height` (default 512²), byte-deterministic:

| File | What |
|---|---|
| `depth.png` | white = near (ControlNet convention), normalised per view |
| `normal.png` | view-space normal: R right, G up, B toward the camera (ControlNet normal) |
| `normal_world.png` | world normal, Z up |
| `part.png` + `legend.json` | a stable colour per part name (FNV-1a, collision-bumped), black = background |
| `uv.png` | atlas U → R, V → G; black on parts the finish leaves alone |
| `albedo.png` | unlit base colour: vertex colour × trim albedo |
| `beauty.png` | the lit beauty render (only when a real model is used) |
| `cameras.json` | eye, basis, focal, centre per view + the projection formula |

`ControlViews.hash` is sha256 of the legend, cameras, albedo, depth and part ids.

## 2. Models (`FinishModel`)

```ts
interface FinishModel {
  readonly id: string;              // cache key + provenance
  readonly licence?: string;
  run(req: { views, prompt, negative?, seed, palette? }): Promise<Uint8Array[]>; // one PNG per view
}
```

- `mockFinish()` — deterministic procedural "AI" for tests, demos and CI: base colour + grime pooling
  low and in creases, worn convex edges, rust patches and streaks down vertical faces, moss on top
  faces, a per-part tint; all noise in WORLD space so views agree. Prompt keywords pick effects
  (`rust`, `soot`/`grime`/`dirt`, `moss`, `worn`/`chipped`, `clean`).
- `httpFinish({ endpoint, model?, headers?, licence? })` — POSTs `{ prompt, negative, seed, palette,
  legend, views: [{ name, width, height, camera, maps: { depth, normal, … } }] }` (base64 PNGs) to the
  user's server (a ComfyUI / diffusers wrapper with ControlNet depth + normal) and expects
  `{ images: [base64 PNG per view] }`. Keys come from the caller, never the environment.
- Results are cached by sha256 of (control hash, view names, prompt, negative, seed, palette, model
  id): `fileStore()` in `.ts23d/finish/` (gitignored today; [ADR 014](../decisions/014-neural-outputs-are-cached-inputs.md) moves committed outputs to `recipes/<name>/neural/`), `memoryStore()` for tests. A hit replays
  offline. **The gate never runs a model.**

## 3. Bake (`finishAsset`)

1. **Atlas** — the trim sheet's UVs overlap by design, so the finish gets its own, unwrapped by
   **least-squares conformal maps** (`src/finish/lscm.ts`, Lévy et al. 2002). Seams: triangles grow
   into charts across welded edges until a curvature ridge (dihedral > 50°) stops them; part borders
   are seams by construction. Each chart minimises the conformal energy Σ area·|∇v − R90 ∇u|² with
   two pinned vertices, solved by our own Jacobi-preconditioned conjugate gradient (zero deps),
   warm-started from the projection on the chart's mean plane, then scaled to its true area. Gate per
   chart: Sander L2 stretch < 1.25, no flipped triangle, no self-overlap (raster test). A failing
   chart is re-cut with a normal cone (180° → 108° → 65° → 39° → 23°); what still fails falls back to
   **box projection** (dominant face axis ±X/±Y/±Z, connected islands, projected flat), which
   `buildAtlas(asset, size, pad, 'box')` also selects outright. Charts shelf-pack at one texel
   density with 2-texel padding. Vertices split only where charts meet; triangle order is kept.
2. **Texels** — every covered atlas texel knows its part, triangle, world position, normal, base
   colour and trim ORM.
3. **Projection** — each texel projects into every view; it takes colour only where it is visible
   (depth test) and only from pixels whose part id is its own (**part masking**), bilinear over
   same-part taps, weighted by (n·v)² so views blend across seams.
4. **Fill** — grow seen texels into unseen ones of the same part (4 texels), give the rest the base
   colour × the part's mean finish/base ratio, dilate into padding.
5. **Derived maps (measured, not guessed from the albedo)** — `deriveMaps(texels, albedo, { height })`:
   roughness and metal are the trim's own under each texel (the strip's height graph made them),
   roughened in the height's concave curvature; the detail normal is the gradient of a world-metre
   height at each texel's surface point (`graphHeight(materialGraph)`: the strip's height graph
   sampled triplanar), over the true metres between neighbouring texels. Without a height the normal
   is flat: an image model's colour is never read as relief.

## 4. A layer, not a replacement

The finished asset is the compiled LOD0 with finishable parts (opaque, no paint slot, no named
finish, no glow) on their atlas meshes with white vertex colour; `finishedGlb(result, [lod1, lod2])`
writes LOD0 on one extra material, `ts23d_finish` (albedo + ORM + detail normal), and LOD1/2 as
MSFT_lod alternates on the trim sheet. Tested identical to the plain export: every node (names,
pivots, rotations), every animation, LOD1/2 meshes byte for byte, LOD0 triangle positions and bounds.
Liveries (`paint` slots), glass, cutouts, glow and named finishes keep their materials. Provenance
(model, prompt, seed, cache key, views, licence, note) goes to `extras.ts23d.finish` and `finish.json`.

## 5. Finish QA

| Code | When |
|---|---|
| `T3D_FINISH_PALETTE_DRIFT` | a part's mean colour moved more than ΔE76 25 from its declared base: the model repainted it |
| `T3D_FINISH_MASK_LEAK` | baked weight came from another part's pixels (0 with masking), or a view's image paints > 20 % of the 2-px ring outside the silhouette (misaligned model) |

`finishedGlb` refuses a rejected finish unless `force: true` (the provenance then lists why). The
asset's own QA gates are re-run on the finished asset (`result.qa`).

## CLI

```
bun run t3d finish recipes/finish_demo/finish_demo.ts --model mock --prompt "soot, rust, worn edges"
bun run t3d finish <recipe> --model http --endpoint http://127.0.0.1:8188/ts23d-finish --prompt "…"
  [--negative "…"] [--views 8] [--atlas 1024] [--seed 1] [--force]
```

Writes `<out>/<asset>/finish/`: `controls/`, `model/<view>.png`, `finish_{albedo,orm,normal,base}.png`,
`compare.png` (before | after under one simple light), `<asset>_finish.glb`, `finish.json`. Exit 1
on a finish finding or a QA finding.

## 6. Hero texture tier (ADR 012, `heroTier`)

No image model: the asset's own fine field is the source. A recipe opts in with
`budget.heroTextures: { size: 2048, cell?: 0.0015 }`; a sculpting kind (`defineCreature`, the bust
library's `buildBust(ctx, b, { hero: true })`) then meshes a lighter LOD0 and tags each sculpted
part's mesh with its field (`withBakeSource`, passes). `heroTier(lod0, { size, cell })`:

- LSCM atlas of LOD0 (the finish's `buildAtlas`; skin and morphs ride along);
- per tagged part, `bakeHeight` (passes): from each texel's surface point, the nearest zero
  crossing of the field along ±n inside the cage (8 cells), normal = ∇f at `cell` in the
  exporter's tangent frame, height, mean curvature, SDF AO. The field is evaluated only there,
  never meshed;
- albedo = vertex colour × trim albedo; ORM = trim occlusion × AO, trim roughness + cavity, trim
  metal; 6 texels of dilation; the hero asset's vertex colour turns white;
- QA (`T3D_BAKE_FAILED`): ray misses ≥ 1 % on a part, texel density off the atlas by > ±20 %, a
  size above `budget.heroTextures.size`.

`heroGlb` puts LOD0 on one extra material, `ts23d_hero`; LOD1/2 stay on the trim sheet; the bake's
numbers go to `extras.ts23d.hero`. CLI: `t3d finish <recipe> --hero` writes `<out>/<asset>/hero/`
(`hero_{albedo,orm,normal,height}.png`, `<asset>_hero.glb`, `hero.json`).

## Known gaps

- Lighting in a real model's images is baked into the albedo; ask for flat, even light (delighting
  is the model's job).
- Charts that fail the LSCM gate at every cone fall back to box projection, which stretches up to
  √2 on 45° faces and can self-overlap on rare folded charts.
- `finishAsset` passes a part's strip height to `deriveMaps` only when the caller names the graph
  (`graphs: { part: materialGraph }`); looking a part's strip graph up from its trim UVs is planned.
- Texels no view sees (undersides, occluded faces) get the tinted base colour, not model detail.
- The hosted provider (kubeez) adapter is planned; the `httpFinish` contract is what it will speak.
