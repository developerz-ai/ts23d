# 12 — Blender bridge (design + feasibility)

**Status: all planned. Nothing here is shipped, and the core library never needs Blender.** An optional adapter could call a user-installed Blender headless (`blender -b --python`) for things ts23d's CPU paths do not do: Cycles path-traced beauty renders under a CC0 HDRI, high→low bakes, voxel remesh / decimate of imported meshes, and GLB round-trips through other formats. Blender output is not byte-deterministic across versions or hardware, so every Blender result is a **cached input**, keyed by content hash, exactly like the `/neural` cache ([08](08-neural-adapters.md)). Research as of 2026-11-07; Blender was not run on the authoring machine, so every command below is unverified on hardware.

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
| Version pin | `blender --version` parsed; supported list in code (e.g. `['4.5', '5.2']`); others refused | Version (major.minor + build hash) goes into the cache key and `report.json` |
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
