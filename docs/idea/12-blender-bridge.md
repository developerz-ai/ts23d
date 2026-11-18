# 12 — Blender bridge (design + feasibility)

**Status: partly shipped (plan 101 slice 20, 2026-11-15); the core library never needs Blender.** Shipped: Blender's *data-level* tools as optional, cached **tool tasks** behind the neural adapter contract (ADR 014/015) — `cloth` (cloth-sim drape), `rig` with `template: 'human'` (Rigify), `fracture` (Voronoi cells + rigid-body settle) — plus three non-Blender tools: `engine-check` (Godot headless import), `ktx2` (Basis Universal) and `meshopt` (meshoptimizer's gltfpack). Since plan 2026/11/16/101 slice 02 the `blender` task runs an ordered **step program** written in the recipe (clean, voxel remesh, deform, retopo, UV, high→low bake, bind, LODs: section below). Still planned: Cycles beauty renders, format conversion, Material Maker textures (see the tables below, kept as the design). Not wrapped, by decision: brush *strokes* only (every `bpy.ops.sculpt.*` tried fails its poll or crashes under `-b`: [research](../research/blender-organic-workflows.md); everything data-level — modifiers, remesh, bake, bone heat — is wrapped; ts23d's SDF strokes and VDM stamps stay the brushes) and Blender MCP servers (they drive a live UI: not reproducible).

## Shipped: tool tasks (slice 20)

| Task | Tool (licence) | TS adapter | Server plug-in | Output |
|---|---|---|---|---|
| `cloth` | Blender cloth (GPL app; outputs yours) | `blenderAdapter()` | `blender-cloth` | draped garment GLB |
| `rig` (`template: 'human'`) | Blender Rigify | `blenderAdapter()` | `blender-rig` | skinned GLB (DEF- bones) + JSON (controls, face controls) |
| `fracture` | Blender bmesh + Bullet | `blenderAdapter()` | `blender-fracture` | GLB of `piece_000…` + JSON (volumes, centres) |
| `engine-check` | Godot 4.2+ headless (MIT) | `godotAdapter()` | `godot` | JSON: meshes, skeletons, bones, collision shapes, bodies, clips played, importer errors |
| `ktx2` | basisu (Apache-2.0) | `basisuAdapter()` | `basisu` | `.ktx2` (UASTC or ETC1S, mipmaps, sRGB/linear) |
| `meshopt` | gltfpack (MIT) | `gltfpackAdapter()` | `gltfpack` | GLB with `EXT_meshopt_compression` and/or simplified (named nodes, extras and constant clips kept) |

- **Two Blender paths, one script set** (`examples/blender/`, GPL-2.0-or-later because it calls `bpy`): the primary path is Blender as a Python module (`pip install bpy`, pinned LTS with its matching Python: bpy 5.2.x is cp313, 4.5.x cp311) inside the reference server's plug-in system; the fallback spawns a user's `blender -b --factory-startup -noaudio -t 1 --python-exit-code 3`. `blenderAdapter({ mode: 'bpy', exe: python })` runs the same dispatcher under a bpy Python.
- **Cached inputs, never build steps.** Every tool model's `weightsSha256` is sha256 of the tool version (+ script bytes), and `record.json` carries `model.tool = { name, version, licence, scriptSha256 }`: an upgrade is a cache miss. Outputs are validated like any model output (`validate.ts`: GLB with triangles / ≥ 2 pieces / a skin; KTX2 identifier; meshopt container).
- **Errors:** every failure is `T3D_NEURAL_FAILED` (the proposed `T3D_BLENDER_*` codes below were folded into it): a missing tool's `fix:` names `t3d setup tools`; a crash carries the script's error and the last 40 lines of stderr; a timeout kills the process group.
- **Recipes:** `recipes/_lib/bust/cloth-sim.ts` asks the cache for a drape and falls back to the stroke folds on a miss, so a bust without the cache builds exactly as the CPU tier does.
- **VDM brushes:** `bun scripts/vdm-from-blender.ts <library.blend> <out> [--bpy python]` extracts vector-displacement brushes from a Blender asset library into `.vdm.bin` stamps with the asset licence recorded; `--commit` refuses licences this repository may not redistribute.

## Shipped: the step program (`blender` task, plan 2026/11/16/101 slice 02)

A recipe writes WHAT to do to a mesh as ordered, typed data; headless Blender does it; the GLB + report are a cached input like any model output (ADR 014).

```ts
const program = blenderProgram([            // → canonical t3d-blender-steps/1 JSON bytes (defaults filled in)
  { op: 'clean' },
  { op: 'retopo', triangles: 30000, focus: [{ at: [0.62, 0, 1.02], r: 0.2, weight: 3 }] },
  { op: 'uv' },
  { op: 'bake', maps: ['albedo', 'normal', 'ao'] },
  { op: 'bind' },
  { op: 'lods', triangles: [10000, 2500] },
  { op: 'export', normalSize: 1024 },
]);
const request = { seed: 1, mesh, program: jsonInput(program), skeleton: jsonInput(skeletonJson(armature)), maxTriangles: 30000 };
```

| op | Does | Blender |
|---|---|---|
| `transform` | 4×4 in the asset frame, on the mesh and its bake sources | `mesh.transform` |
| `clean` | weld, drop small shells and loose geometry, fill holes, consistent normals | bmesh |
| `symmetrize` | mirror one half across an asset-frame plane | `mesh.symmetrize` |
| `amputate` | delete the geometry inside given limb capsules and close the stumps (a profile model's far legs, before `symmetrize`) | bmesh delete + `holes_fill` (`steps/unweb.py`) |
| `unweb` | cut geometry bridging two limbs given as capsules (tail ↔ hocks, leg ↔ leg), cap each side, push them `gap` apart | bmesh delete + per-limb caps (`steps/unweb.py`) |
| `repose` | after `bind`: pose the bound mesh to a target rest (straight head, even left and right), keep it as the new rest; optional gated mirror of one half | pose bones → apply Armature modifier → `pose.armature_apply` (`steps/repose.py`) |
| `voxelRemesh` | one watertight surface | Remesh modifier (VOXEL) |
| `smooth` · `displace` · `inflate` | scripted deformation, optional z-band / sphere mask | Laplacian / Corrective Smooth, Displace + procedural texture, numpy |
| `skinBody` · `metaballs` | build a body with no input mesh (first step only) | Skin + Subdivision modifiers, metaball → mesh |
| `retopo` | the LOD0 shell; `strategy: 'shell'` (default) builds ONE filled, closed surface before reducing: voxel remesh, and when the source leaks (a crust with tunnels) a closing by `close` voxels (0, 1, 2, 4 tried), `skin` voxels fatter when sheets thinner than a voxel would be lost; `'decimate'` collapses directly; `reduce: 'quadriflow'`; `focus` balls and thin parts keep density | Remesh, SDF grid nodes (dilate / fill / erode), Decimate (vertex-group weighted) / QuadriFlow + Shrinkwrap |
| `uv` | fresh UVs projected on a smoothed copy, packed; gated on island count and UV-degenerate triangles | Smart UV Project / minimum-stretch unwrap, `pack_islands` |
| `bake` | albedo (EMIT of the source base colour; a cut-out source is looked through), normal, AO, roughness/metallic → albedo, normal, ORM; the albedo is a solid RGB coat (unreached texels take the nearest colour, their share is gated) | Cycles selected-to-active (GPU when found) |
| `joint` | move a bone's head / tail before `bind` | skeleton JSON / edit bones |
| `bind` | `from: 'skeleton'` (default): armature from `t3d-skeleton/1`, bone heat, voxel-proxy weight transfer when it fails. `from: 'source'`: the input GLB's own rig (a Meshy humanoid) is kept, its weights transferred onto the shell and every LOD, its clips exported. ≤ 4 influences | `parent_set(ARMATURE_AUTO)`, Data Transfer |
| `weights` | after `bind`: assign / scale / smooth one bone's weights inside a mask (z band, sphere, box, half-space); the other bones give way | vertex groups (numpy) |
| `script` | the agent's own bpy code as a recorded step (`python`, required `why`): in the program JSON, so in the cache key; gated like any step | `exec` with `obj`, `source`, `arm`, `bpy`, `bmesh`, `mathutils`, `np` |
| `review` | PNG sheets after the GLB and report: clay, wire, per-bone weight heat maps, posed frames, textured turnaround; changes nothing | Workbench matcap / vertex colour / texture, orthographic |
| `lods` | decimated copies sharing UVs, maps and weights, thin parts collapsed last; gated per level (open edges, shard faces, which bbox side moved, lost surface, new tunnels, UVs alive) | Decimate |
| `export` | one GLB: nodes `lod0..2`, RGB PNG images, opaque material (both checked on the written file), skin, and every clip of a kept source rig at its own frame rate | glTF exporter |

- **Why `shell` is the default retopo:** collapsing a raw image-to-3D surface (fur noise over internal layers) left 1,290 UV islands and a LOD2 of shards; voxel-remeshing first gives a closed shell, 226 islands and three clean LODs, and the fine detail returns through the normal bake. Numbers and renders: [`examples/blender/README.md`](../../examples/blender/README.md).
- **Why the shell must be measured:** Pixal3D meshes are thin crusts (two walls ≈ 1.5 mm apart) with tunnels; a voxel remesh finer than a tunnel floods the inside and returns confetti (4,026 closed specks on a wolf, 1,622 on a clothed human) that still counts as "closed". The same root cause gave three different late failures (a transparent-looking wolf, a dragon LOD whose bbox moved, a human LOD with 35 % UV-dead triangles). Now `retopo` fails at the step, or repairs it: numbers per model in `examples/blender/README.md`.
- **The finishing loop:** `t3d blender review <recipe.ts> --out <dir>` (the module exports `BLENDER_REVIEW = { mesh, steps, skeleton? }`) or `--mesh <glb> --program <json> [--skeleton <json>]` runs the program with a `review` step before its export and writes the sheets + `review.md` (tile legend, per-step facts). The agent reads them, adds a `joint` / `weights` / `script` step to the recipe, and looks again. Never cached, never in a build.
- **Gates:** after every step the result must be a finite mesh with faces whose size did not jump (except `transform`); each op adds its own (shell solidity and lost surface, UV islands, albedo fill, weights after a script, LOD measures, opaque RGB export, clip names and lengths). Every message names the step, the measure and a `fix:`.
- **Report** (`t3d-blender-report/1`, second output): per step seconds, triangles and facts (shell tries, bake hit rate, unfilled share and device, bind method, UV islands, LOD gate values, script sha256 and stdout tail), bbox, the review sheets, and what the GLB holds (mesh nodes, image mimes and channels, joints, animations).
- **Versions:** 4.5 LTS, 5.2 LTS and 5.3 (stable release, the one the ops were run on); the version and the hash of every step script are in the cache key.
- **Not in the gate:** unit tests drive a fake `blender`; `examples/blender/tasks/steps/test_steps.py` is the real self-test (manual; it also runs `test_gates.py` and `test_finish.py`).

Smoke on the dev box (2026-11-15; bpy 5.2.4 LTS, Godot 4.7.2, basisu 2.50.0 built from source, gltfpack 1.3; two runs each gave identical output sha256):

| Job | Time | Result |
|---|---|---|
| cloth: 0.9 m sheet (2.4k verts) over a capsule body, 60 frames × 6 substeps | 3.6 s | settles from z 1.72 to 1.10–1.68 m over the shoulders |
| rig: block humanoid with 16 named pivot nodes | 4.6 s | 16 meta-rig bones snapped, 159 deform bones, 219 controls (84 face) |
| fracture: 0.6 m crate, 12 seeds, 30 settle frames | 0.6 s | 12 pieces, volume 0.2145 of 0.216 m³ |
| meshopt: wolf LOD0 (7.1 MB), compress + simplify 0.5 | 0.4 s | 0.92 MB, 7/7 clips kept |
| ktx2: 2048² trim-sheet albedo, UASTC + mipmaps | 2.3 s | 2.49 MB KTX2 |
| engine-check: wolf LOD0 (`--profile godot --physics`) | 2.9 s | 2 meshes, 1 skeleton (44 bones), 1 collision shape + body, 7 clips played; importer errors for the external `../trim_sheet_*.png` URIs |

## Why at all

| Need | ts23d today | What Blender adds |
|---|---|---|
| Hero image for a README / store page | `beauty()`: zero-GPU rasteriser, key sun + PCF shadows, sky fill, AO, ORM-driven specular (`src/render/beauty.ts`, `shade.ts`) | Path-traced GI, HDRI lighting, depth of field, real glass |
| Bring in a messy mesh (CC0 base mesh, a sculpt, a neural output) | `importGlb` planned (M5) | Voxel remesh to a manifold, decimate to a budget, clean normals, before ts23d fits it |
| Per-asset baked maps | Not in the one-sheet model (vertex AO via `bakeAo`) | Selected-to-active normal/AO/curvature bakes, for an opt-in per-asset texture (needs an ADR, see below) |
| Format reach | GLB only | FBX/USD/OBJ in or out through Blender's importers (out of scope for core; [gltf-capabilities](../architecture/gltf-capabilities.md)) |

Not a reason: modelling. Recipes stay TypeScript; [ADR 001](../decisions/001-recipe-compiler-over-ai-meshes.md) rejected DCC node graphs because agents diff them poorly.

## Verified facts the design rests on

| Fact | Source |
|---|---|
| `-b/--background` "Run in background (often used for UI-less rendering)"; `-P/--python <file>`; `--python-expr`; `--python-exit-code <code>` sets the exit code on a Python exception; `--factory-startup` skips the user's startup.blend; `-noaudio`; `--` ends option processing, rest goes to `sys.argv`; `-t/--threads` | [Blender CLI arguments](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) |
| `--python-use-system-env` is *opt-in*: by default Blender's Python ignores `PYTHONPATH` and user site-packages | same |
| LTS: 5.2 LTS and 4.5 LTS maintained (both updated 2026-10-22), "critical fixes throughout a 2-year time span", no new features or API changes | [Blender LTS](https://www.blender.org/download/lts/) |
| Bake settings: `use_selected_to_active`, `cage_extrusion` ("Inflate the active object…"), `cage_object`, `max_ray_distance` (0 = no limit) | [bpy BakeSettings](https://docs.blender.org/api/latest/bpy.types.BakeSettings.html) |
| glTF importer/exporter (Khronos) bundled since 2.80; `bpy.ops.export_scene.gltf(filepath=…, export_format='GLB')` headless | [glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO), [example](https://til.jakelazaroff.com/blender/export-a-blender-file-to-glb-from-the-command-line/) |
| Voxel remesh uses OpenVDB and makes a manifold mesh | [Remesh modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html) |
| Cycles is not bit-reproducible run to run in general (a user report: identical only with `-t 1`); CPU and GPU tiles drew different random values | [blender#101726](https://projects.blender.org/blender/blender/issues/101726) (could not open, 403; summarised from search), [T72141](https://developer.blender.org/T72141) — treat as unverified |
| Licence: "What you create with Blender is your sole property"; scripts using the Python API, if published, must be under a GPL-compliant licence | [Blender licence](https://www.blender.org/about/license/) |

## Architecture

```
ts23d (TypeScript, zero deps)                    user's machine, optional
─────────────────────────────                    ────────────────────────
t3d blender render recipe.ts ─┐
  compile → toGlb (bytes)     │  job.json + in.glb + hdri path
  hash(job) → cache lookup ───┼─ miss ─► Bun.spawn(blender, ['-b', '--factory-startup',
                              │            '-noaudio', '--python-exit-code', '3',
  cache hit: read out.*  ◄────┘            '--python', 'ts23d_job.py', '--', 'job.json'])
                                         ◄─ out.png / out.glb + report.json (stdout last line)
.ts23d/blender/<sha256>/{out.*, report.json}   committed or published like the neural cache
```

| Piece | Where | Notes |
|---|---|---|
| Discovery | `blender` on PATH, or `T3D_BLENDER` / `--blender <path>` | Env is read by the **CLI only**, never by `src/` library code (same rule as API keys in [08](08-neural-adapters.md)) |
| Version pin | `blender --version` parsed; supported list in code (`BLENDER_LINES`: `['4.5', '5.2', '5.3']`); others refused | Version (major.minor + build hash) goes into the cache key and `report.json` |
| Job | A JSON file: `{ op, input, params, seed, ts23dVersion }` | One Python entry script dispatches on `op`; no Python ever imported by TS |
| Python scripts | `blender/ts23d_job.py` + one file per op, shipped in the npm package as data | GPL-compliant licence required if published (Blender licence page). MIT is generally considered GPL-compatible; **confirm with counsel before publishing** |
| Module | New `src/blender/` at tier 3 (needs `export` for GLB bytes and `render` types), or `cli`-only | Must stay out of `src/index.ts` main barrel; subpath `@developerz.ai/ts23d/blender`. Needs `scripts/lib/tiers.ts` entry (UNOWNED) |
| Isolation | `--factory-startup` (no user add-ons, prefs), `--python-use-system-env` **off**, a temp working dir, timeout | User add-ons are the biggest source of "works on my machine" |

### Operations

```ts
// @developerz.ai/ts23d/blender — planned API, all async, all cache-first
interface BlenderOptions { readonly blender?: string; readonly cacheDir?: string; readonly offline?: boolean }

render(asset: CompiledAsset, o: BlenderOptions & {
  hdri?: string;                 // path to a vendored CC0 .hdr/.exr (Poly Haven), hashed into the key
  camera?: 'hero' | PerspectiveCamera;  // default = beauty()'s cameraFor(), so shots line up
  samples?: number;              // default 128; denoise: 'oidn' | 'none'
  size?: readonly [number, number];
}): Promise<Uint8Array>;          // PNG

remesh(glb: Uint8Array, o: BlenderOptions & { voxel: number; decimate?: number /* target tris */ }): Promise<Uint8Array>;   // GLB
bake(high: Uint8Array, low: Uint8Array, o: BlenderOptions & {
  maps: readonly ('normal' | 'ao' | 'curvature')[]; size: 512 | 1024 | 2048;
  cageExtrusion: number; maxRayDistance?: number;
}): Promise<Record<string, Uint8Array>>;   // PNGs, low's UVs
convert(bytes: Uint8Array, o: BlenderOptions & { from: 'fbx' | 'obj' | 'usd'; }): Promise<Uint8Array>;  // → GLB
```

```
t3d blender render recipes/t34/t34.ts --hdri refs/studio_small_09_2k.hdr --out renders   # → cycles.png
t3d blender remesh in/horse.glb --voxel 0.01 --decimate 8000 --out in/horse_clean.glb
t3d blender bake  --high in/rock_high.glb --low out/rock/lod2.glb --maps normal,ao --size 1024
t3d blender doctor            # finds Blender, prints version, runs a 1-triangle job, reports timings
```

Every command prints the cache key and, with `--json`, a machine-readable report, like the rest of the CLI.

## Determinism: how to live with a non-deterministic tool

1. **Blender never runs in the gate.** `bun run verify` and CI never call Blender. Committed `hero.png` stays the CPU `beauty()` render.
2. **Results are inputs, cached by content.** Key = `sha256(op, params, input bytes, hdri bytes, script bytes, blender version+hash)`. A recipe that consumes a Blender result (say, a remeshed imported mesh) reads it from `.ts23d/blender/<key>/`; the compile stays byte-deterministic because the bytes are fixed.
3. **Cache miss in CI = error, never a silent rebuild:** `T3D_BLENDER_CACHE_MISS` with `fix: run "t3d blender remesh … " locally with Blender 5.2 and commit .ts23d/blender/<key>`. Share the miss logic with the neural cache (one `src/core` or `src/cache` helper; design choice for the implementer).
4. **Regeneration is explicit.** `--refresh` deletes the entry and reruns. A version bump of Blender changes the key, so old results keep working until someone regenerates.
5. **Renders are compared perceptually, not by bytes.** If a Cycles image is ever checked in CI-like flows, compare by a downscaled mean-absolute-error threshold, not a hash. Fixed `scene.cycles.seed`, fixed samples, `-t 1` when bit-stability on one machine matters (slow; per the bug report above).
6. **Geometry from Blender is normalised on the way back**: ts23d's own `optimize` (weld + Forsyth) runs on the imported mesh, so vertex order no longer depends on Blender internals once cached.

## Errors (proposed codes)

| Code | When | `fix:` |
|---|---|---|
| `T3D_BLENDER_NOT_FOUND` | No binary on PATH / flag / `T3D_BLENDER` | Install Blender 5.2 LTS from blender.org, or pass `--blender /path/to/blender` |
| `T3D_BLENDER_VERSION` | Version not in the supported list | Use 4.5 LTS or 5.2 LTS, or `--allow-blender-version` (key still records it) |
| `T3D_BLENDER_FAILED` | Non-zero exit (`--python-exit-code`), timeout, missing output | The last 40 lines of Blender's stderr + the job file path to rerun by hand |
| `T3D_BLENDER_CACHE_MISS` | Offline/CI and no cached result | The exact command that regenerates it |

## High→low baking vs the one-material rule

A Blender normal bake makes a **per-asset** texture; [ADR 008](../decisions/008-surface-materials.md) says every asset shares the trim sheet. Options, in order of preference:

| Option | Keeps one material? | Notes |
|---|---|---|
| A. Don't bake normals; SDF meshes already take normals from the exact field at every LOD (`sdf.ts`) | Yes | Covers sculpts today; polygon recipes get `weightedNormals` + bevels |
| B. Bake AO / curvature into **vertex colour / `_WEAR`** on the low mesh (sample the bake at vertices) | Yes | Cheap; ts23d can do this itself (`bakeAo` exists) without Blender |
| C. Opt-in `surface: 'baked'` with its own texture set for hero assets | No: a second material per asset | Needs an ADR; only worth it for imported organic hero assets |

Recommendation: ship A/B in core first; Blender baking only serves C, so it waits for that ADR.

## Feasibility

| Item | Feasible? | Effort | Risk |
|---|---|---|---|
| `render` (Cycles + HDRI, same camera as `beauty`) | Yes: standard headless pattern | M | Camera/axis conversion (ts23d Z-up +X front → glTF Y-up → Blender Z-up); test against `beauty()` silhouette |
| `remesh` / `decimate` on imported GLB | Yes | S–M | Vertex colours / UVs lost by voxel remesh; re-colour on the ts23d side (`importGlb` already plans recolouring) |
| `convert` FBX/OBJ/USD → GLB | Yes | S | Importer quirks per format; GLB stays the only output |
| `bake` selected-to-active | Yes technically | M–L | Only useful with option C above |
| CI coverage | Partial | S | Tests mock the spawn (fake `blender` script printing a canned report); a manual `t3d blender doctor` is the real smoke test |

## Next steps for ts23d (prioritised, all planned)

1. **New ADR "Optional external tools"**: Blender runs only via the CLI/subpath, results are cached inputs, never in the gate; licence note on shipped Python. S.
2. **Shared content-hash cache helper** for `/neural` and `/blender` (key, lookup, miss error). S–M.
3. **`t3d blender doctor` + discovery + version pin** with the four error codes. S.
4. **`t3d blender render`** (Cycles, CC0 HDRI path, `beauty()`'s camera), output `cycles.png` beside `hero.png`, never gated. M.
5. **`remesh` / `decimate` / `convert`** feeding the planned `importGlb`. M.
6. **Baking** only after an ADR accepts a per-asset `baked` surface. L.

## Sources

- [Blender command-line arguments](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) · [LTS](https://www.blender.org/download/lts/) · [Licence](https://www.blender.org/about/license/)
- [bpy.types.BakeSettings](https://docs.blender.org/api/latest/bpy.types.BakeSettings.html) · [Remesh modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html)
- [glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO) · [headless GLB export example](https://til.jakelazaroff.com/blender/export-a-blender-file-to-glb-from-the-command-line/)
- Cycles reproducibility reports: [blender#101726](https://projects.blender.org/blender/blender/issues/101726), [T72141](https://developer.blender.org/T72141) (not opened directly; status unverified)
