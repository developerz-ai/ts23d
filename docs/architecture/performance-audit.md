# Performance, algorithms and code-quality audit

Audit of `@developerz.ai/ts23d` at branch `feat/lod-single` (2026-11-07), made while nine agents were
editing `src/**`. Read-only: nothing in `src/` changed. Scratch scripts are in `tmp/audit/`
(`profile.ts`, `phase.ts`, `micro.ts`, `png-filter.ts`, `tex-mem.ts`, `glb-size.ts`,
`raster-proto.ts`, `normal-bug.ts`), and CPU profiles are in `tmp/audit/prof/*.md` (Bun 1.4.4
`--cpu-prof-md`). Machine: 12 cores, Linux 6.8, load average about 1.8 from the other agents. All
times are single runs and include JIT warm-up for the first `compile`. Treat ±10 % as noise.

**Labels.** **measured** means a number from a script or profile in this audit. **estimate** means
reasoning from measured shares that has not been prototyped. **unverified** means a claim taken from
literature or memory that was not checked here.

## 1. Measured hot spots

### 1.1 Phase × asset, milliseconds (measured, `tmp/audit/profile.ts`, 1024² trim sheet)

| Asset | Tris LOD0 | compile L0 / L1 / L2 | QA ×3 LODs | top QA gates | toGlb ×3 | single LOD GLB | beauty | sheet | thumb | peak RSS |
|---|---:|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiger_1 | 88 176 | 519 / 87 / 3 | 2 270 | clashes 680, gaps 675, floating 438, checks 390 | 664 | 434 | 3 127 | 956 | 685 | 772 MB |
| mountain_range | 133 120 | 702 / 605 / 528 | 867 | gaps 786 | 564 | 399 | 2 765 | 733 | 510 | 500 MB |
| asteroid | 20 428 | 934 / 193 / 31 | 684 | gaps 613 | 162 | 164 | 2 364 | 290 | 347 | 687 MB |
| orc_head | 73 760 | **5 346** / 871 / 85 | 469 | floating 298, gaps 82 | 411 | 308 | 2 244 | 577 | 531 | 704 MB |
| svg_showcase | 38 824 | 1 653 / 344 / 50 | 146 | gaps 78 | 247 | 181 | 2 194 | 304 | 279 | 390 MB |
| boxcar | 14 412 | 62 / 20 / 4 | 700 | gaps 383, floating 126 | 142 | 73 | 2 869 | 339 | 775 | 410 MB |
| eiffel_tower | 188 016 | 629 / 64 / 4 | 1 386 | gaps 769, floating 402 | 916 | 803 | 2 349 | 1 406 | 772 | 864 MB |
| oak | 12 408 | 56 / 11 / 4 | 1 917 | **gaps 1 574** | 110 | 47 | 2 343 | 381 | 627 | 544 MB |

- **Trim sheet paint** is the same for every asset: about 1.4 s at 1024² and **3.36 s at 2048²**
  (the CLI default, measured).
- **CLI-equivalent run at the 2048² sheet** (all phases, `SHEET=2048`, `/usr/bin/time`, measured):
  tiger_1 13.2 s and 1.41 GB maxrss, orc_head 15.3 s and 1.13 GB, eiffel_tower 12.4 s and 1.55 GB.
- **Beauty costs about 2.2–3.1 s whatever the triangle count.** It is fixed cost: 1600×900 at 2×
  supersampling is 5.76 M samples, plus 13 depth maps and the mip-chain build.

### 1.2 Inside the phases (measured, CPU profiles)

| Phase | Where the time goes |
|---|---|
| orc_head compile (6.5 s profiled) | sculpt `fold` 57 % total. `sampleGrid` 1.41 s (22 %). Per-vertex **colour** pass `sdf.ts:77` 1.94 s (30 %, of which `head-tone` 0.59 s). Gradient normals `sdf.ts:62-64` about 0.45 s. AO bake `bake-ao.ts:133` 0.71 s (11 %). Mirrored-shape closure `sculpt-edit.ts:156-159` 0.88 s total, and it allocates a tuple per call |
| svg_showcase compile (1.94 s) | `polygonSdf` closure (`sdf-silhouette.ts:28-52`) **1.09 s self (56 %)** |
| asteroid compile (1.16 s) | `value-noise.ts` `one`/`plane` 0.72 s (61 %) |
| mountain_range compile (1.03 s) | erosion `droplet` 0.45 s, thermal 0.12 s. **The same work repeats for every LOD** |
| tiger_1 compile (0.68 s) | recipe `camo` 0.22 s. `Math.hypot` 0.11 s. `MeshBuilder.vertex` + `push` about 0.15 s |
| boxcar beauty + paint (4.9 s) | paint value-noise/fBm 0.71 s. `rasteriseVis` 0.53 s. `resolve` 0.92 s total. `floorLight` 0.25 s. depth maps 0.36 s. mip `chain` 0.2 s |
| boxcar thumb (1.19 s) | `raster.ts` `tri` **0.64 s self (62 %)** plus `set` 0.11 s (per-pixel array allocation) |
| oak QA (2.39 s) | `depth-views.ts` rasterising 0.96 s, `slits.ts` `windowMin` + `scanLine` 0.66 s |
| tiger_1 QA (2.84 s) | `depth-views` 0.37 s. `Math.hypot` **0.20 s**. `boundsOf` **0.20 s**. `parity` 0.14 s. `atan2` 0.05 s. `Array.filter`/`every` 0.32 s |
| eiffel_tower GLB | `weld` about 0.15 s, `forsyth` 0.12 s, `cacheStats` 0.14 s per call. Runs twice per `t3d build` (split + single) |

### 1.3 Memory (measured)

- `render/texture.ts` builds the beauty renderer's mip chains as Float32 RGBA × 3 maps:
  **268 MB at 2048²**, taking 573 ms and raising RSS 102 → 365 MB.
- The supersampled visibility buffer is about 92 MB (3200×1800 × 16 B).
- Peak RSS of a full run at 2048² is 1.1–1.6 GB.

### 1.4 Micro-benchmarks (measured, `tmp/audit/micro.ts`, 2·10⁷ iterations)

| Operation | Time | vs `Math.sqrt(x*x+y*y+z*z)` |
|---|---:|---:|
| `Math.sqrt(x*x+y*y+z*z)` | 57 ms | 1× |
| `Math.hypot(x,y,z)` | 477 ms | 8.4× |
| `Math.hypot(...[x,y,z])` | 1 387 ms | 24× |

- `rotZ` with per-vertex trig and an array allocation (5·10⁶ calls): 44 ms. With cos/sin hoisted
  and scalar arguments: 7 ms.
- `Math.max(...arr)` works at 500 k elements and **throws "Maximum call stack size exceeded" at
  1 M**.

## 2. Top 15 findings, by gain ÷ effort

Owners come from the live ownership map. Unowned paths go to the coordinator.

| # | Finding (file:line) | Evidence | Proposal | Expected gain | Risk | Effort | Owner |
|---|---|---|---|---|---|---|---|
| 1 | Every `build`/`hero`/`review` process repaints the identical trim sheet (`cli/run.ts:151-153`). `scripts/shots.ts:25-26` spawns `shot` + `hero` per recipe | 3.36 s per process at 2048² (measured). About 24 recipes × hero = about 80 s of identical painting per `bun run shots` (estimate) | Content-hash disk cache: sha256 of (sheet definition JSON, package version, texture-cache hashes) → `node_modules/.cache/ts23d/sheets/<hash>.{albedo,normal,orm}.raw`. Same bytes by construction | −3.4 s per CLI run; −1 to 1.5 min per `shots` (estimate) | Low: key must cover every input. Verify with a byte compare in a test | S | materials-v3 (painter) + measure (cli) |
| 2 | `t3d build` optimises every LOD twice: split `toGlb` and single `exportLodGlb` both run `prepare` → `mergeToPivots` → `optimizeParts` (`export/glb.ts:93-111`, `cli/run.ts:56-66`) | tiger 664 + 434 ms, eiffel 916 + 803 ms (measured) | Memoise `prepare` per input `CompiledAsset` + options (WeakMap), or derive the split GLBs from the single run's prepared LODs | about −40 % of export time (−0.4 to −0.8 s per heavy asset) | Low: pure functions on immutable input | S | coordinator (export; physics touches `glb.ts`) |
| 3 | Beauty mip chains are Float32 RGBA for 3 maps (`render/texture.ts:25-47`) | 268 MB and 573 ms at 2048² (measured). Peak RSS 1.1–1.6 GB | Keep albedo as Uint8 sRGB with a 256-entry LUT decode in `sample`. Store normal/ORM as Uint8. Box-filter mips in a Float32 scratch, then quantise. Or build mips once per painted sheet and share them with the cache from #1 | −200 MB RSS, mip build about 3–4× faster (estimate) | Medium: hero bytes change, so regenerate `recipes/*/out` | S–M | measure (render) |
| 4 | Thumbnail / contact-sheet rasteriser divides by area per pixel and allocates `[r,g,b,255]` per written pixel (`render/raster.ts:190-211`). `vis-buffer.ts` and `depth-map.ts` already step edge functions | `tri` is 62 % of a boxcar thumb (measured). thumb 0.28–0.78 s, sheet 0.29–1.41 s. `tmp/audit/raster-proto.ts` (edge-stepped, allocation-free) gives **identical depth buffers (0 / 2 359 296 pixels differ)** on boxcar, tiger_1 and eiffel_tower (measured) | Port the stepped loop. Write bytes directly. Hoist the `ids.map`/`pts` arrays in `drawAsset:217-243` | **2.2–3.4× measured** on the raster pass alone (boxcar 805 → 236 ms, tiger 572 → 226 ms, eiffel 684 → 307 ms; the prototype still allocates in `drawAsset`, so a full port should do better) | Low: same pixels | S | measure (render) |
| 5 | QA rebuilds the same indices: `TriangleGrid` per gate (`floating.ts:33`, `occlusion.ts:89`, `inspect.ts:79`, `measure.ts:125`). `boundsOf` recomputed per pair (`floating.ts:20`, `clash.ts:152`, `occlusion.ts:65`) | `boundsOf` 0.20 s (7 %) of tiger QA (measured). `TriangleGrid` build 60 ms on oak | WeakMap<Mesh, …> caches in `qa/geometry.ts` for `TriangleGrid`, `SolidIndex` and bounds, as `surfaceSamples` already does. World meshes are already cached per parts array, so the keys are stable | −10 to −15 % QA on part-heavy assets (estimate) | Low | S | gaps (qa) |
| 6 | `Math.hypot` has 135 call sites in `src/`, 29 with spread. Hot ones: `qa/geometry.ts:220-245` (point–triangle distance, about 10 Vec3 allocations per call), `primitives/sdf-grid.ts:155` (every field evaluation), `passes/optimize-weld.ts:181`, `transform.ts:69`, `clash.ts:51` | 8.4× / 24× slower than sqrt (measured). 0.20 s self in tiger QA | `sqrt(x*x+y*y+z*z)` in hot paths. Scalar `pointTriangleDistance(px,…,cz)` over the packed `tris` array | −5 to −10 % QA. −2 to −3 % sculpt compile (estimate) | Medium: last-bit changes, so regenerate committed outputs. At metre scale there is no overflow risk | S | gaps (qa), coordinator (primitives/passes/core) |
| 7 | Sculpt surface pass evaluates the field 7 times per vertex: 6 central differences + 1 colour fold (`primitives/sdf.ts:62-77`). The mirrored shape allocates a tuple per evaluation (`sculpt-edit.ts:156`) | Colour 1.94 s (30 %) + gradient about 0.45 s of orc_head compile (measured) | (a) Tetrahedral 4-tap gradient (Quílez) cuts 6 evaluations to 4. (b) One `fold` that returns value and colour at the vertex. (c) Scalar branches instead of the `[first, second, lb]` tuple | orc_head compile −20 to −30 % (estimate) | Medium: normals and colours change, so regenerate outputs | S | coordinator (primitives/sculpt); orc-v3 consumes |
| 8 | Silhouette visual hull evaluates the exact 2D polygon SDF in O(edges) per 3D sample (`sdf-silhouette.ts:28-52`). On a lattice each (y, z) pair is recomputed `nx` times | 56 % of svg_showcase compile (measured) | Per-view 2D cache keyed by the exact lattice coordinate (identical results). Better: a uniform edge-bucket grid with ring search, O(1) average per query | svg compile about −50 % (estimate) | Low with exact caching | S–M | svg |
| 9 | Sparse SDF grid culls one level only (4³ blocks, `sdf-grid.ts:109-191`). `fold` scans every top-level edit per point with a `sqrt` bound test (`sculpt-tree.ts:177-223`) | `fold` 57 % and `lowerBound` 0.32 s of orc_head (measured) | Dreams-style per-brick edit lists: for each 4³/8³ brick, keep only edits whose bounding sphere minus blend reach can affect it (conservative, so bit-identical), then fold that short list. Optional second culling level (32³ → 4³) for empty space | 2–3× on field evaluation for heads (estimate, unverified) | Medium: the skip proof must cover the running value `d` (use a Lipschitz upper bound over the brick) | M | coordinator (primitives/sculpt) |
| 10 | **Bug:** `place()` / `applyAffine` transforms normals by M, not the inverse transpose (`core/transform.ts:65-72`). The comment assumes "rigid + uniform", but the API accepts `scale: Vec3` and arbitrary `frame(u,v,w)` | `tmp/audit/normal-bug.ts`: scale `[1,1,4]` on the plane x+z=1 gives vertex normal (0.243, 0, 0.97) vs the true (0.97, 0, 0.243). **62° wrong** (measured). No recipe uses non-uniform scale yet; mirrors are unaffected | n' = cof(M)·n (cofactor = det·M⁻ᵀ, no inversion, handles det<0), renormalise. Add a failing test first | Correctness | Low | S | coordinator / measure (core) |
| 11 | LOD-independent work recomputed per LOD. mountain_range erodes the same 256² grid in every `compile` | compile L1 605 ms and L2 528 ms vs L0 702 ms (measured) | `ctx.memo(key, () => …)` scoped to (asset, seed, key), shared across the LODs of one process. Erosion, rock fields and skeletons are computed once | −1.1 s of 1.8 s for mountain_range (estimate) | Medium: a memoised value must not depend on `ctx.lod` (make the API take no `ctx`) | M | coordinator (core) |
| 12 | No parallelism. `scripts/shots.ts:20-26` runs recipes sequentially, 2 processes each, each recompiling. Paint, compile, QA and renders run serially in one thread | tiger 13.2 s wall, of which paint 3.7 s is independent of compile+QA 2.8 s (measured) | Worker pool in `shots` (N = cores/2). `shot`+`hero` in one process. Paint the sheet in a `Worker` while compiling. Per-LOD compile+QA in workers (each pure, so byte-identical) | shots wall ÷ about 4–6. Single build −30 to −40 % (estimate) | Low for process-level; medium for intra-process (transferables, memory) | M | measure (scripts/shots, cli) |
| 13 | `gaps` dominates QA on open or thin assets: 5 axis depth views at span/1600 px, every row and column scanned (`gaps.ts:112-126`, `depth-views.ts:60-106`, `slits.ts:106-135`) | oak 1.57 s = 82 % of its QA. 0.6–0.8 s on tiger, eiffel, asteroid, mountain (measured) | Skip lines without a depth jump ≥ `minDepth` (one linear pre-pass per line). Two-level scan: candidates at ¼ resolution, refine in windows. Rasterise views in one pass over triangles | 2–4× on gaps (estimate) | Medium: must not miss 6 mm slits, so keep the full-res refine | M | gaps |
| 14 | Mesh building is AoS-by-object: `MeshBuilder.vertex({p,n,uv,color})` does `push(...v.p)` ×4 (`core/mesh.ts:34-40`). `worldMesh` recomputes cos/sin and allocates two arrays per vertex (`world.ts:13-17, 46-54`). `render/raster.ts:155-188` duplicates `worldMeshes` uncached | `push` 14 % + `vertex` about 20 % of tiger compile (measured). rotZ 6× slower than hoisted (measured micro) | Add a scalar `MeshBuilder.v(px,py,pz,nx,ny,nz,u,v,r,g,b)` over growable Float32Arrays (doubling), keeping the object API as a wrapper. Hoist trig in `worldMesh`. Use `worldMeshes` in `raster.ts` | −15 to −25 % of hard-surface compile (estimate) | Low | S–M | coordinator / measure (core), measure (render) |
| 15 | Spread `Math.min/max(...big)` crashes at ≥ about 1 M elements: `qa/clash.ts:74-75,86` over `surfaceSamples(mesh, 0.05, 8)` of a whole moving subtree; 26 sites in total | Throws at 1 M args, fine at 500 k (measured) | Loop reductions on arrays that scale with geometry (clash, `ray-grid.ts:64` is fine at 3 args) | Prevents a latent crash on large rotors/turntables | Low | S | gaps (qa) |

Not hot today, but worth doing: two ear clippers, one of them O(n³) worst case
(`primitives/triangulate.ts:19-41` restarts its scan at 0 after every clip and tests every vertex,
and its `guard` silently returns a partial fill; `svg-triangulate.ts:132-168`). Replace both with
one earcut-style clipper: a doubly linked list plus z-order hashing for the point-in-ear test,
holes bridged as now. It brings robustness and one code path. Effort M, owner svg plus coordinator.

## 3. Algorithms and data structures (review)

| Area | What is there | Verdict |
|---|---|---|
| Mesh IR | SoA typed arrays (`Float32Array` positions/normals/uvs/colours, `Uint32Array` indices). GLB writes uint16 indices when ≤ 65 535 vertices and COLOR_0 as unorm16 | Good. The weak spots are the build path (#14) and QA's `Vec3[]` sample arrays (`qa/geometry.ts:162-187`), which allocate an array per sample. A packed `Float64Array` is the better fit |
| Weld (`passes/optimize-weld.ts`) | Quantise 11 attributes to an integer cell, FNV-1a hash, open addressing, first occurrence wins | Deterministic and O(n). Known flaw of grid quantisation: two vertices 1e-6 m apart can straddle a `round` boundary and stay unwelded. Harmless for exact duplicates; meshoptimizer's `generateVertexRemap` uses exact equality. Positions beyond ±21 km overflow Int32 cells at 1e-5 (irrelevant at current sizes). Duplicate-triangle detection uses `Map<number, number[]>`; fine |
| Vertex cache (`optimize-cache.ts`) | Forsyth LRU-32, scores recomputed for the cache's live triangles each step, keeps the better of in/out by FIFO-16 ACMR. Fetch reorder after | Standard and correct. meshoptimizer's `optimizeVertexCache` (Forsyth-derived, tuned tables) and `optimizeOverdraw` would add overdraw ordering; low priority for small props (unverified gain) |
| LOD | Authoring-time LOD gating only (by rule) | Matches CLAUDE.md. A quadric (Garland–Heckbert) simplifier is only worth it as an opt-in LOD3/impostor fallback for imported meshes (neural); not needed now |
| AO ray casting (`passes/ray-grid.ts`) | Uniform grid, CSR, Amanatides–Woo DDA, mailboxing, Möller–Trumbore with plane pre-reject, any-hit; memo on (position, normal) | Good for compact assets. Sparse lattices (eiffel_tower) and large empty volumes favour a binned-SAH BVH (Wald 2007) with any-hit traversal. Not a current hot spot (AO 0.7 s on orc_head only), so low priority |
| Point-in-solid (`qa/inside.ts`) | Parity of 3 axis rays (majority vote) over 2D column hashes, fixed NUDGE | Fast; fails on open or self-intersecting meshes, where the majority vote only mitigates. The generalised winding number (Jacobson 2013), made fast (Barill et al. 2018), is robust to soups and gives a confidence value; worth it if QA starts reporting false hidden-part or penetration findings on merged soups (unverified frequency) |
| QA nearest distance (`TriangleGrid`) | Hashed uniform grid `Map<number, number[]>` + per-triangle AABB reject + Ericson closest point | Fine; the costs are the allocations (#6) and rebuilds (#5) |
| SDF meshing | Dense value grid with one-level 4³ Lipschitz block culling. Naive surface nets with a fold-aware diagonal split. MC with edge-shared vertices | Good mesher choice. The dense `Float32Array` + `Uint8Array` + `Int32Array` (cells) use up to about 150 MB at the 2²⁴-point cap; a brick-sparse store (#9) also fixes memory. `surfaceNets` scans every cell including culled blocks, which could be skipped via the coarse array. The header comment says "8³-cell block" but `BLOCK = 4` (`sdf-grid.ts:84` vs `:109`) |
| Sculpt fold | Ordered smooth-min edit list with exact-skip bounds (Dreams model) | Sound and bit-identical skipping; needs spatial culling (#9) |
| Noise | `primitives/noise.ts` (gradient/value, ridged, warp; no transcendental functions, deliberately deterministic), `value-noise.ts` (3D perm table), `material/paint/noise.ts` (integer-hash value noise) | Three implementations (see §5). The paint fBm is the paint hot spot (0.71 s at 1024²). Precomputing per-octave lattice rows or vectorising per scanline (one `floor` per row) is about 2× (estimate); the disk cache (#1) makes it moot |
| Erosion | Beyer/Lague droplets, Rng-seeded | Fine; memoise across LODs (#11) |
| Convex hull (`physics/hull.ts`, in progress) | Incremental insertion without conflict lists, string edge keys, eps-plane test | OK for "a few hundred points". Plain float `above()` is not robust (no Shewchuk `orient3d`), so near-coplanar input can yield a non-convex or leaky hull. Use an adaptive orient3d or snap input to a grid; add a randomised-order-independent test |
| Triangulation | Ear clipping ×2 | See the note after §2 |
| PNG (`core/png.ts`) | Filter 0 on every row, default zlib | **Kept as is.** Adaptive per-row filters plus zlib level 9 over all 84 committed PNGs save only **4.9 %** (21.59 → 20.53 MB) at about 20× encode time (2.6 s → 51.5 s, measured `png-filter.ts`). `node:zlib.crc32` exists in Bun and could replace the JS CRC loop (minor) |
| Texture atlas | Strip rows replicated `pad` deep (`material/paint/compose.ts`), foliage bleed, sampler REPEAT-U / CLAMP-V | Good: bleed and padding are already handled |

## 4. Numerics, physics and game-asset tricks

| Topic | Evidence (file:line) | Assessment / proposal | Gain | Effort | Owner |
|---|---|---|---|---|---|
| Normal transform | `core/transform.ts:65-72` | Wrong for non-uniform scale (#10). World transforms are translation + yaw only (`world.ts`), so they are correct there | Correctness | S | core |
| Robust predicates | `qa/inside.ts` (NUDGE + majority), `triangulate.ts` (`cross ≥ 0`), `physics/hull.ts` (eps plane) | No exact orientation tests anywhere. Shewchuk adaptive `orient2d`/`orient3d` (about 150 LOC each, deterministic) for hull and ear clipping; QA can stay heuristic | Robustness | M | coordinator, physics |
| Float summation | Bounds, centroid and mass integrals sum in input order (deterministic) | Deterministic but not order-independent. Use pairwise or Kahan summation only where accuracy matters (physics volume/inertia over 10⁵ triangles); not needed for byte determinism | Accuracy | S | physics |
| Cross-platform determinism | `scripts/determinism.ts` is a static lint (Math.random, Date, locale). CI is ubuntu-only. Geometry uses `Math.sin/cos/atan2/pow/exp/hypot` | V8 ships fdlibm for trig so results match across platforms; SpiderMonkey uses system libm and differs by OS. **Whether JavaScriptCore (Bun) uses system libm is unverified.** `Math.hypot` precision is implementation-approximated. A macOS contributor may produce different bytes, and the recipes gate would then report stale outputs. Add a `macos-latest` CI job that builds every recipe twice and compares hashes, plus a same-platform double-build check in `determinism`. If they differ, ship deterministic `sin`/`cos` in core | Trust in "same source = same bytes" | S (CI) / M (trig) | coordinator |
| Quaternion vs matrix | `Affine` is a 3×3 + t; joints/export use quaternions (`core/vec.ts` `quatFromAxisAngle`) | Fine: matrices for baking geometry, quaternions for glTF rotation/animation | — | — | — |
| Tangents / MikkTSpace | `export/tangents.ts`: Lengyel per-triangle sum (unweighted) + Gram-Schmidt; the header admits "close, not bit-equal" on curved surfaces. Beauty uses per-**triangle** frames without orthogonalising to the interpolated normal (`render/scene.ts:84-119`) | Engines bake normal maps and shade in MikkTSpace. The glTF spec says that when TANGENT is absent, clients SHOULD compute MikkTSpace. Option A (S): omit TANGENT, so engines generate exact MikkTSpace (relax the internal validator rule S10/G15 that demands tangents). Option B (L): port mikktspace.c. Also make the preview use the exported per-vertex tangents, so the preview matches engines | Correct normal-map shading on curved parts | S / L | coordinator (export), measure (render) |
| Colour space | Vertex colours linear (glTF COLOR_0), albedo PNG sRGB, normal/ORM linear. Beauty decodes albedo to linear before mipping, tone-maps per sample, then encodes sRGB. Contact sheet encodes sRGB | Correct, except `render/thumbnail.ts:48-66`, which averages **sRGB bytes** (darkened, haloed edges) and samples 4 taps from a 3×-supersampled buffer (aliasing). Decode → average in linear → encode, with 9 taps or a 3×3 box | Visual | S | measure |
| Premultiplied alpha | Thumbnail is alpha-weighted (good); PNGs are straight alpha (PNG requires it) | OK | — | — | — |
| PBR in preview | `render/shade.ts:174-201`: normalised Blinn-Phong + Schlick + ad-hoc environment curve | glTF's reference BRDF is GGX D + Smith (height-correlated) V + Schlick F (glTF 2.0 Appendix B). Use those; use Karis' `EnvBRDFApprox` (analytic split-sum fit, no LUT) for the environment term; optionally add multiple-scattering energy compensation (Fdez-Agüera 2019 / Kulla–Conty 2017) so rough metals don't darken. The preview then predicts engine highlights | Fidelity of the review images | S–M | measure |
| Normal-map mips | `render/texture.ts:35-42` box-filters normals without renormalising | Renormalise per texel (or Toksvig-style roughness widening). Matters at distance only | Visual | S | measure |
| Cutout alpha mips | Preview alpha test at a chosen mip; exported textures rely on the engine's mips | Foliage thins out with distance in engines as averaged alpha drops below 0.5. Fix: alpha-coverage-preserving mips (Castaño 2010), which requires shipping our own mips (KTX2) — or document `alphaCutoff` tuning per engine | Far-LOD foliage | M | materials-v3 / export |
| Light units | `export/lights.ts:42-43`: directional default 3 lux, spot 100 cd, point 20 cd | KHR_lights_punctual is in lux/candela; a real sun is about 10⁵ lux. 3 lux suits non-physical viewers (three.js defaults) but reads near-black with physical units (Unreal, Godot "physical light units"). Document per engine, or emit physically plausible values plus a note | Engine import parity | S | coordinator (export) |
| SIMD-friendly layout | SoA everywhere except QA samples (`Vec3[]`), the hull (`Vec3[]`) and the MeshBuilder input object | JSC does not auto-vectorise JS, so SoA helps mainly through fewer allocations and better caching. Finish the move (§3 rows) | See #6, #14 | S | qa, core |
| Workers / parallel | None | #12. Each LOD compile, QA gate set, depth map and hero render is pure and parallelises without changing bytes | 30–40 % per build, 4–6× shots (estimate) | M | measure |
| Caching / memoisation | Present: `worldMeshes`, `surfaceSamples`, `sheetTextures`, `sheetPngs`, AO `RayGrid` per mesh, inspector per asset. Missing: painted sheet on disk (#1), optimise per asset (#2), indices/bounds (#5), cross-LOD (#11), the sculpt field per brick (#9) | | | | |
| Vertex-colour AO | `passes/bake-ao.ts`: Fibonacci cosine hemisphere, Frisvad/Duff basis, position+normal memo | Good. Bent normals could be emitted as a by-product: the mean unoccluded direction, stored in a second UV or vertex attribute, gives cheap directional ambient in engines (unverified engine uptake) | Visual | S | coordinator (passes) |
| Normal encoding | Float32 normals (12 B) | glTF has no octahedral encoding; KHR_mesh_quantization int8 normals (4 B) are the standard trick | See next row | | |
| Quantisation / compression | Float32 POSITION/NORMAL/TEXCOORD, unorm16 COLOR_0 (`export/primitive.ts:9-29`) | **KHR_mesh_quantization** (int16 pos + node scale, int8 normal/tangent, uint16 UV): geometry about −35 % (tiger 4.4 → about 2.8 MB, eiffel 16.9 → about 11 MB, `glb-size.ts` estimate). Supported by three.js r111+ and Babylon 4.1+; Godot 4 and Unreal Interchange are **unverified**, so ship it behind `--quantize`. **EXT_meshopt_compression** gives a further 2–4× (unverified here) but needs a decoder; three.js r122+ has one, and Godot's importer rejects compression extensions (Draco) out of the box. Opt-in only | Download size | M | coordinator (export) |
| Impostors / far LOD | `kinds/vegetation-impostor.ts` exists | Good. Generalise the octahedral impostor bake (Ryan Brucks style) to any asset as an optional LOD3 using the CPU rasteriser (unverified value) | Far LOD | M | coordinator |
| Mip bias / padding | Padding and bleed present (`compose.ts`, `foliage-raster.ts`); trilinear sampler | Good | — | — | — |

## 5. Code quality

- **Duplication.**
  - Four triangle rasterisers with different fill rules: `render/raster.ts:190` (strict `<0`,
    per-pixel divide), `render/vis-buffer.ts:57`, `render/depth-map.ts:217`, `qa/depth-views.ts:60`
    (`-1e-7` closed edges). Extract one edge-function core with a top-left fill rule.
  - Two ear clippers. Three noise implementations.
  - Bounds loops in `qa/gaps.ts:60`, `qa/gates.ts:22`, `qa/measures.ts:20`, `qa/lods.ts:31` and
    `render/scene.ts:57`, besides `core.boundsOf`.
  - `worldParts` (`render/raster.ts:155`) re-implements `core.worldMeshes` without its cache.
  - `qa/geometry.ts:192-203` defines its own `sub`/`dot`/`lerp` beside `core/vec.ts`.
- **Allocation in hot loops.**
  - `pointTriangleDistance` (Vec3 temporaries plus spread `hypot`).
  - The `sculpt-edit.ts:156` tuple.
  - `raster.ts:209`/`256` `px.set([…])`.
  - `drawAsset`'s `ids.map`.
  - `clash.ts:73` `.map(coords)` builds a `[a, r, φ]` per sample.
  - `TriangleGrid` constructor's `tris.set([...a, ...b, ...c])`.
- **Unit/option naming.** `resolution` means cell edge in metres for `sdf`/`sculpt`, `cells` is a
  count for heightfields, and `size` is pixels for renders. Calling the metre knob `cell` (or
  `cellMetres`) would remove the "resolution = count?" ambiguity. Error codes and `fix:` strings
  are consistent and good.
- **Public API traps.** `insideSolid(p, m)` (`qa/inside.ts:114`) builds a whole index per call; it
  is documented, but an O(n)-per-point helper exported from a barrel invites misuse. Prefer
  exporting only `SolidIndex`, or memoise per mesh.
- **Stale comment.** `sdf-grid.ts` header says 8³ blocks; the code uses 4³.
- **Size.** 18 non-test files exceed the 200-LOC target, all under the 300 ceiling (largest:
  `material/library.ts` 253, `kinds/roof.ts` 250, `kinds/head-face.ts` 242, `passes/ray-grid.ts`
  237).
- **Tests.**

  | Module | Source files | Test files |
  |---|---:|---:|
  | material | 57 | 7 |
  | neural | 3 | 0 |
  | core | 20 | 6 |

  The paint pipeline is covered mostly indirectly. There is no test for `mesh.ts`, `png.ts`
  (round-trip through `decodePng`) or `world.ts`, and no failing test for non-uniform `place`
  normals (#10). Spot-checked tests (ray-grid, optimize, bake-ao) do assert behaviour that can
  fail.
- **Tier boundaries.** No violations seen in the files read. The scratch scripts deep-import
  `src/cli/load.ts` / `src/render/raster.ts`, which is fine for `tmp/` but shows that `loadAssets`
  and the rasteriser are useful enough to export.
- **Tree state during the audit (other agents' work in progress, not findings).**
  - `qa/index.ts` was missing a `jointFit` export the CLI imports, so `bun src/cli/bin.ts` failed
    to load.
  - `material/define.ts` imported a not-yet-written `./nature.ts`.
  - The new `gravel` material failed its own U-tiling probe (`T3D_MATERIAL_INVALID`).

  The profile numbers in §1 were taken before these appeared; the `raster-proto.ts` check ran in
  a window when the tree loaded.

## 6. Suggested order

1. S, no visual change: #2 optimise memo, #5 QA caches, #15 spread crash, #4 raster port (identical
   pixels), #1 sheet disk cache, #12 process-level `shots` pool.
2. S, needs `bun run shots` regeneration: #6 hypot, #7 gradient/colour fusion, #3 Uint8 mips, the
   thumbnail colour-space fix, GGX in preview.
3. M: #9 brick culling, #11 `ctx.memo`, #13 gaps two-level scan, #8 silhouette grid, intra-process
   workers, KHR_mesh_quantization opt-in, MikkTSpace decision.
4. Correctness first regardless of order: #10 cofactor normals, the macOS determinism CI job.

## Sources

- Barill, Dickson, Schmidt, Levin, Jacobson, [Fast Winding Numbers for Soups and Clouds](https://dgp.toronto.edu/projects/fast-winding-numbers), SIGGRAPH 2018 ([paper](https://www.dgp.toronto.edu/projects/fast-winding-numbers/fast-winding-numbers-for-soups-and-clouds-siggraph-2018-barill-et-al.pdf)).
- Evans, [Learning from Failure (Dreams)](https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf), SIGGRAPH 2015 Advances; [Media Molecule post](https://www.mediamolecule.com/blog/article/siggraph_2015). The brick size and culling details are second-hand (unverified).
- Wald, [On fast construction of SAH-based BVHs](https://www.sci.utah.edu/~wald/Publications/2007/ParallelBVHBuild/fastbuild.pdf), IEEE RT 2007; [binned SAH slides (Saarland)](https://graphics.cg.uni-saarland.de/courses/cg1-2018/slides/Building_good_BVHs.pdf); Karras & Aila, [Fast Parallel Construction of High-Quality BVHs](https://research.nvidia.com/sites/default/files/pubs/2013-07_Fast-Parallel-Construction/karras2013hpg_paper.pdf).
- Karis, [Physically Based Shading on Mobile](https://www.unrealengine.com/blog/physically-based-shading-on-mobile) (EnvBRDFApprox), 2014.
- Cross-engine libm differences: [Mozilla bug 531915](https://bugzilla.mozilla.org/show_bug.cgi?id=531915); [V8 fdlibm README](https://android.googlesource.com/platform/external/v8/+/android-6.0.1_r66/third_party/fdlibm/README.v8).
- glTF compression support: [meshoptimizer gltfpack README](https://docs.rs/crate/gltfpack-sys/latest/source/meshoptimizer/gltf/README.md); [Godot forum: compressed GLB not supported](https://forum.godotengine.org/t/compression-version-of-glb-gltf-is-not-working/94486).
- Cited from memory, not re-fetched (unverified):
  - Forsyth, "Linear-Speed Vertex Cache Optimisation" (2006).
  - meshoptimizer (github.com/zeux/meshoptimizer).
  - Garland & Heckbert, quadric simplification (1997).
  - Jacobson et al., generalised winding numbers (2013).
  - Shewchuk, adaptive robust predicates (1997).
  - Mapbox earcut.
  - Quílez, tetrahedral SDF normals (iquilezles.org).
  - Kulla & Conty (2017) and Fdez-Agüera (2019), multiple-scattering compensation.
  - Castaño (2010), alpha-coverage mips.
  - glTF 2.0 spec Appendix B and the TANGENT/MikkTSpace note.
  - KHR_mesh_quantization and EXT_meshopt_compression specs.
  - Frisvad (2012) / Duff et al. (2017), orthonormal basis.
  - Beyer (2015), hydraulic erosion.

## Status (2026-11-07)
Done, byte-identical outputs: #2 (one optimise per LOD; tiger_1 export 1.50 → 0.69 s), #5 (per-mesh QA geometry cache; tiger_1 QA 2.9 → 2.2 s), #8 (silhouette distance memo; svg_showcase LOD0 1.65 → 0.95 s), #10 (inverse-transpose normals; 61.9° → < 0.05° error), #11 (erosion memo across LODs; mountain_range LOD1/2 ~2.5× faster), #15 (no spread on large arrays), exact `orient2d` / `orient3d` predicates with one shared ear clipper (old clipper half-filled polygons with repeated points; old hull left 18/400 near-coplanar hulls open), physical light defaults.
Rejected with evidence: #7(a) tetrahedral 4-sample gradient — 0.94° mean / 41° max normal error vs 0.054° / 3.7° for the 6-sample gradient at 4 mm cells. Skipped: #9 per-brick edit lists — no byte-identical bound for subtract/intersect and non-exact fields.
