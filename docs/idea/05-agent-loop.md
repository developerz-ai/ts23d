# 05 — The agent loop

**The agent writes, builds, looks, and fixes the single worst thing, until two looks in a row find nothing.** ts23d's job is to make each turn of that loop cheap: a build in well under a second, one QA verdict, one image that shows everything.

## The loop

```
research refs ─► write recipe ─► t3d build ──QA FAIL──► fix finding ─┐
                      ▲              │                               │
                      │           QA PASS ◄──────────────────────────┘
                      │              ▼
                 detail pass ◄─ read PNG ◄─ t3d shot
```

| Step | Command / action | Done when |
|---|---|---|
| 1. Research | Find real dimensions, a side elevation, photos. Put the URLs in `sources`, overall L × W × H in `real`, and every key size (driver diameter, gauge, wheelbase, turret width) in `real.measures` | The spec is in the recipe, in metres, each number with a source |
| 2. Masses | Write the big volumes only: hull, body, tiers. Real dimensions | Silhouette roughly right |
| 3. Build | `bunx -p @developerz.ai/ts23d t3d build recipes/x/x.ts` | Prints `QA PASS`, exit 0. Fix every finding first; each prints a `fix:`. A `measures` or `proportions` finding means rebuild the part, never edit the spec |
| 4. Shot | `bunx -p @developerz.ai/ts23d t3d build` already wrote `out/x/sheet.png`; `bunx -p @developerz.ai/ts23d t3d shot recipes/x/x.ts` for a sheet without GLBs | `out/x/sheet.png` + `manifest.json` written |
| 5. Read | Open the PNG (vision). Compare against the reference | One concrete error named, e.g. "turret 30% too tall in SIDE -Y" |
| 6. Fix | Edit the recipe for that one error | → step 3 |
| 6b. Photo match | `photoMatch(asset, { photo, camera })` → one PNG: photo · model · overlay, plus silhouette IoU | IoU stops rising; the overlay shows no misplaced mass |
| 7. Detail pass | Once masses read right: hatches, rivets, windows, handrails. Gate each on `ctx.lod` | Detail shows at LOD0, dropped by LOD2, budget holds |
| Stop | Two consecutive shots with nothing worth fixing | |

Fix one thing per iteration. Proportions before details: a wrong mass makes every detail on it wrong.

## The organic loop (creature, humanoid; As of 2026-11)

**Hard surface is the loop above. Organic assets add a model stage and a Blender stage between "masses" and "build", and the agent looks at Blender's renders as well as ts23d's.** Code-sculpted animals and people did not read right (owner review 2026-11-16), so the body is a model's mesh, finished by steps the recipe writes ([plan 101](../plans/2026/11/16/101-organic-model-first/overview.md)).

```
research ─► concept image ─► READ it ─► image-to-3D ─► Blender steps ─► t3d blender review ─► READ
                ▲                                          ▲                                   │
                └──── re-roll seed (new keys) ─────────────┴──── edit steps (free) ◄──────────┘
                                                   ▼
                  t3d build (QA incl. model, skin, deform, gait) ─► shot / hero ─► READ ─► shots
```

| Step | Command | Done when |
|---|---|---|
| 1. Concept | bind `image`; `t3d neural run recipes/x/x.ts` | exact side profile (quadruped) or A-pose front (biped), flat light, passes the input-image rules; you READ the PNG |
| 2. Model | bind `mesh` (and `rig`); same command, up to 5 rounds; paid adapters print credits, `--yes-spend` above 50 or when a job cannot be priced | `neural/<key>/record.json` committed, committed bytes <= 12 MB, raw mesh local |
| 3. Steps | edit the recipe's `blender` steps; `t3d blender review recipes/x/x.ts --out review` (needs Blender, never cached) | clay, wire, weights, poses show no shards, fused limbs or torn weights; then `t3d neural run` again so the cached Blender output the build reads is the reviewed program's |
| 4. Build | `t3d build recipes/x/x.ts` | QA PASS incl. `model` (`T3D_MODEL_*`), `skin`, `deform`, `gait` |
| 5. Look | `t3d shot`, `t3d hero`, READ; the model tier renders its own textures | flaws named in the recipe README, not hidden |
Re-running only the Blender stage is free and fast (about a minute); a new concept or seed changes every key after it and, with a hosted mesh or rig, costs credits. Tests and CI never call a model or Blender. Skills: [creature-artist](../../.claude/skills/creature-artist/SKILL.md), [character-artist](../../.claude/skills/character-artist/SKILL.md).

## Fidelity from real-world sizes

**The spec goes in first; the model is rebuilt until the gate agrees with it.** Real-world sizes are the cheapest fidelity there is: a 4-4-0 with the right driver diameter, wheelbase and boiler height reads as *that* locomotive before any texture exists.

| Gate | Holds | Tolerance |
|---|---|---|
| `proportions` | Overall L × W × H vs `real` | ±5% |
| `measures` | Each named dimension vs `real.measures` | ±2% each |
| `clashes` | Moving parts clear everything through their whole motion | 1 cm |
| `floating-parts` | Every part in surface contact with something grounded | 2 cm |

An agent that "fixes" a finding by editing `value` or `tolerance` has defeated the gate. Review rule: a diff touching `real` needs a source for the new number.

## The contact sheet

One PNG, 1200 × 840 px. Every view orthographic, on the same scale, over a ground grid in metres. Rendered on the CPU ([ADR 007](../decisions/007-cpu-contact-sheets.md)).

**Header line:** `NAME  <X>X<Y>X<Z>M  GRID <step>M  LOD0`: bounding box in metres, grid step, LOD.

| Cell | Label | Camera | Check |
|---|---|---|---|
| Row 1, left | `3/4 FRONT` | From front-right (+X, −Y), above | Overall read; does it look like the thing? |
| Row 1, middle | `FRONT +X` | Looking at the +X face | Width, symmetry, track/gauge |
| Row 1, right | `SIDE -Y` | From −Y, front (+X) on the right | Length, height, profile vs a side elevation |
| Row 2, left | `TOP` | From above, +X up | Plan, footprint, alignment |
| Row 2, middle | `3/4 REAR` | From rear-left (−X, +Y), above | The back nobody modelled |
| Row 2, right | `FAR LOD2` | 3/4 front, LOD2 compile | Does the far LOD keep the silhouette? |

Grid step is picked so the asset spans ≤ 24 cells: 0.1, 0.5, 1, 5, 10, 50 or 100 m. Shading is flat Lambert, one colour per triangle, over the hero's base colour: the trim sheet's mean albedo for the triangle's strip × vertex colour, so an oak plank is brown and terrain is green, rock and snow, as in `hero.png`. Texture detail (grain, joints, normal and roughness maps) is not shown: judge that in the hero. See-through parts (`surface: 'glass'`, `ice`, `liquid`…) are blended over what is behind them. Cutout cards (`surface: 'cutout'`: leaves, needles, fur) are alpha-tested per pixel against the sheet, so foliage shows its real silhouette, not the quads that carry it. Parts with their own texture set are sampled per pixel (ADR 016). `thumb.png` uses the same colours; `blueprint.png` stays vertex colour only (a technical drawing). Library callers get this by passing `contactSheet(asset, { sheet })`; without `sheet` the panels are vertex colour only.

### Reading it

| Symptom in the sheet | Likely cause |
|---|---|
| A part hangs in the air in `SIDE -Y` / `FRONT +X` | Wrong `at` z, or `at` given in world space instead of parent space |
| Asset faces left in `SIDE -Y` | Front built along −X; flip it, +X is front |
| Header dims don't match the reference | Units (cm vs m), or a stray part stretching the bounds |
| `FAR LOD2` loses a defining shape | Dropped a mass instead of a detail at LOD2 |
| Mirror-image parts asymmetric in `TOP` | Sign error on one side's y |

## Photo match (planned, M2)

**The step after the contact sheet: compare against reality, not against memory.** `photoMatch(asset, { photo, camera: { eye, target, fovDeg } })` renders the model from the camera that took the reference photo and stacks three panels in ONE PNG:

| Panel | Shows |
|---|---|
| Top | The reference photo |
| Middle | The model from the same camera, scaled to the photo |
| Bottom | 50% overlay of the two |

It also returns silhouette IoU (0–1), the number the `silhouetteIoU` gate and the M6 reverse direction optimise. With `marks` (≥ 4 photo↔model correspondences) `photoMatch` solves the camera (DLT, refined on IoU); otherwise the agent passes the camera. `bun run ref <recipe>` turns dossier photos into committed derived numbers (`ref.json`).

The bar: [`loco-photo-match.png`](https://raw.githubusercontent.com/developerz-ai/ts23d/main/docs/reference/loco-photo-match.png), from the in-house predecessor, not from this library.

## Debugging with `inspect`

When a finding is unclear, write a scratch script instead of guessing. `inspect(compiled)` answers geometric questions by part glob:

```ts
import { compile, inspect } from '@developerz.ai/ts23d';
import { t34 } from './recipes/t34/t34.ts';

const q = inspect(compile(t34, { lod: 0 }));
q.parts('road_wheel_l_*');                  // names
q.bounds('turret*');                        // world AABB
q.distance('track_l_top', 'hull_upper');    // surface gap, metres (0 = touching/intersecting)
q.penetration('track_l_top', 'hull_upper'); // { depth, samples }: how deep A sits inside B's solid
```

| Method | Returns |
|---|---|
| `parts(glob)` | Matching part names |
| `mesh(glob)` | Merged world-space mesh, or `null` |
| `bounds(glob)` | World AABB, or `null` |
| `distance(a, b, max?)` | Smallest surface-to-surface distance, capped at `max` |
| `penetration(a, b)` | `{ depth, samples }`: deepest point of A inside B's closed solid |

Also exported: `glob(pattern) → RegExp`, `insideSolid`. Once you know the intent, encode it as a `checks` entry so the gate holds it from then on.

## Output an agent reads

`out/<asset>/manifest.json` answers most questions without opening a GLB: triangles and draw calls per LOD as the GLB holds them (`triangles` counts what is in the file, after the exporter dropped degenerate and duplicate triangles; `trianglesCompiled` appears beside it only when that differs from what the recipe compiled to, the number `budget.triangles` is checked against; `drawCalls` counts primitives, so a pivot left with no triangles is none), pivots (the names engine code binds to), emitters, sockets, surfaces, `clips` as the GLBs hold them (a clip is listed when at least one built LOD's file keeps a channel of it, so a weights-only clip on morphs LOD2 dropped is gone from a LOD2-only build; none with `--no-animations`), `real` and each measure with its **measured** value, sources, QA findings. `out/index.json` lists every asset in the run with its verdict.

## Machine-readable output

`--json` on any command:

```json
{"ok":true,"data":[{"name":"<asset>","dir":"out/<asset>","files":{"lods":["lod0.glb","lod1.glb","lod2.glb"],…},"qa":{"pass":true,"findings":[]},"triangles":[<lod0>,<lod1>,<lod2>],…}]}
{"ok":false,"error":{"code":"T3D_CLI_USAGE","message":"…","fix":"…"}}
{"ok":false,"error":{"code":"T3D_QA_FAILED","message":"T3D_QA_FAILED: QA failed: 2 finding(s) on 1 asset(s): <asset>","fix":"read data[].qa.findings: …"},"data":[{"name":"<asset>",…,"qa":{"pass":false,"findings":[{"gate":"floating-parts","code":"T3D_QA_FLOATING_PARTS","message":"…","fix":"…"}]}}]}
```

**When `ok` is false, `error` is always there**: read `error.code` and `error.fix` first. Three shapes: passed (`ok: true, data`); stopped by a coded error before anything was built (`ok: false, error`, no `data`); ran but something failed (`ok: false, error, data`: `data` holds every built item plus `{ file, asset?, error }` per failed recipe or asset, and `error` is the first such failure, or `T3D_QA_FAILED` when only QA failed). A build item is its `manifest.json` plus `dir`: its `files` are relative to `dir`. `hero`, `review`, `gaps` and the other renders give `files` as full paths. Details: [errors.md](../architecture/errors.md).

Current numbers for the gallery recipes: `bun run bench` (README benchmarks block).

Exit codes: `0` pass · `1` QA finding or `T3D_*` error · `2` usage.

## MCP tools (optional)

**The CLI with `--json` stays the baseline; `t3d mcp` puts the same steps behind MCP tools for agents that prefer them, and returns every render as an image content block.** A stdio server, zero dependencies (JSON-RPC 2.0, MCP revision 2025-06-18; clients on 2025-11-25 / 2025-03-26 / 2024-11-05 get their version echoed). Source: `src/cli/mcp/`.

| Tool | CLI equivalent | Returns |
|---|---|---|
| `build` | `t3d build <recipe> --json` | QA verdict, findings (code, gate, part, message, fix; first 20, the rest in manifest.json), triangles and draw calls per LOD, paths |
| `shot` | `t3d shot <recipe>` | the contact sheet as an image + manifest summary |
| `hero` | `t3d hero <recipe> [--az --el --size --variant --quality]` | the beauty render as an image |
| `blueprint` | `t3d blueprint <recipe>` | the measured drawing as an image |
| `review` | `t3d review <recipe>` | the review pack images (within the byte budget; the rest by path) + review.md path |
| `critique` | `t3d critique <recipe>` | pack paths + warnings (drift from committed renders, inflated scores) |
| `list_recipes` | `t3d list <files…>` | assets per recipe file (`recipes/*/*.ts`, `assets/**/*.ts`; `_`-folders skipped) |
| `explain_error` | docs/architecture/errors.md | the code's rows: where thrown, cause, fix |

Rules: paths are relative to the project root (`--root`, default the working directory); recipes must sit inside it, outputs inside it or `--out`; anything else is `T3D_CLI_USAGE`. Images are downscaled to a 1024 px long edge (deterministic box filter) and capped at 3 MB per result. A tool error is an `isError` result with the `T3D_*` code and `fix`; an unknown tool is JSON-RPC error −32602 with the fix in `data`. Tool calls run one at a time; `ping` and `tools/list` answer meanwhile. Setup: `claude mcp add ts23d -- bunx -p @developerz.ai/ts23d t3d mcp`. Not served: the stateless 2026-07-28 revision (`server/discover`), resources, prompts.

## Prompt snippet

```text
Using @developerz.ai/ts23d, write recipes/<name>.ts: a <thing>, real dimensions in metres,
Z up, +X front. Look up reference dimensions first. Block out the masses, then details.
Name every part that moves (axle_*, door_*, rotor_*) and pivot it where it hinges.
Loop: bunx -p @developerz.ai/ts23d t3d build → fix until QA PASS → read out/<name>/sheet.png →
fix the single biggest error → repeat. Stop when two shots in a row show nothing worth fixing.
Never use Math.random; use ctx.rng.
```

The package ships `CLAUDE.md` (the repo's `AGENTS.md` links to it), `llms.txt` and the skills as plain markdown (`.claude/skills/<skill>/SKILL.md`: `author-recipe` and the artist workflows) for agents that read them.

## Planned (as of 2026-10)

- **Reverse direction:** a VLM proposes recipe params from photos; the loop scores them by silhouette IoU and keeps the best (M6).
