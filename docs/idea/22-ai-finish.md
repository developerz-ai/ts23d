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
  id): `fileStore()` in `.ts23d/finish/` (gitignored), `memoryStore()` for tests. A hit replays
  offline. **The gate never runs a model.**

## 3. Bake (`finishAsset`)

1. **Atlas** — the trim sheet's UVs overlap by design, so the finish gets its own: per triangle the
   dominant face axis picks a chart (±X/±Y/±Z), charts split into connected islands, project flat at
   one texel density and shelf-pack with 2-texel padding (xatlas-like box projection). Vertices split
   only where charts meet; triangle order is kept.
2. **Texels** — every covered atlas texel knows its part, triangle, world position, normal, base
   colour and trim ORM.
3. **Projection** — each texel projects into every view; it takes colour only where it is visible
   (depth test) and only from pixels whose part id is its own (**part masking**), bilinear over
   same-part taps, weighted by (n·v)² so views blend across seams.
4. **Fill** — grow seen texels into unseen ones of the same part (4 texels), give the rest the base
   colour × the part's mean finish/base ratio, dilate into padding.
5. **Derived maps (heuristics, not measurements)** — roughness = trim roughness + local luminance
   variation + darkening; metal = trim metal faded where the colour changed; detail normal from the
   albedo's high-pass. Documented as such in the provenance `note`.

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

## Known gaps

- Lighting in a real model's images is baked into the albedo; ask for flat, even light (delighting
  is the model's job).
- Box projection stretches up to √2 on 45° faces and can self-overlap on rare folded charts.
- Texels no view sees (undersides, occluded faces) get the tinted base colour, not model detail.
- The hosted provider (kubeez) adapter is planned; the `httpFinish` contract is what it will speak.
