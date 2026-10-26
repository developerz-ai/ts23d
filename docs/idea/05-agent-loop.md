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
| 3. Build | `bunx t3d build recipes/x.ts` | Prints `QA PASS`, exit 0. Fix every finding first; each prints a `fix:`. A `measures` or `proportions` finding means rebuild the part, never edit the spec |
| 4. Shot | `bunx t3d build` already wrote `out/x/sheet.png`; `bunx t3d shot recipes/x.ts` for a sheet without GLBs | `out/x/sheet.png` + `manifest.json` written |
| 5. Read | Open the PNG (vision). Compare against the reference | One concrete error named, e.g. "turret 30% too tall in SIDE -Y" |
| 6. Fix | Edit the recipe for that one error | → step 3 |
| 6b. Photo match *(planned, M2)* | `photoMatch(asset, { photo, camera })` → one PNG: photo · model · overlay, plus silhouette IoU | IoU stops rising; the overlay shows no misplaced mass |
| 7. Detail pass | Once masses read right: hatches, rivets, windows, handrails. Gate each on `ctx.lod` | Detail shows at LOD0, dropped by LOD2, budget holds |
| Stop | Two consecutive shots with nothing worth fixing | |

Fix one thing per iteration. Proportions before details: a wrong mass makes every detail on it wrong.

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

Grid step is picked so the asset spans ≤ 24 cells: 0.1, 0.5, 1, 5, 10, 50 or 100 m. Shading is flat Lambert over vertex colour; texture is not shown.

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

It also returns silhouette IoU (0–1), the number the planned `silhouetteIoU` gate and the M6 reverse direction optimise. Camera solving from ≥ 4 marked correspondences comes later (M6); until then the agent passes the camera.

The bar: [`loco-photo-match.png`](https://raw.githubusercontent.com/developerz-ai/ts23d/main/docs/reference/loco-photo-match.png), from the in-house predecessor, not from this library.

## Debugging with `inspect`

When a finding is unclear, write a scratch script instead of guessing. `inspect(compiled)` answers geometric questions by part glob:

```ts
import { compile, inspect } from '@developerz-ai/ts23d';
import { t34 } from './recipes/t34.ts';

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

`out/<asset>/manifest.json` answers most questions without opening a GLB: triangles and draw calls per LOD, pivots (the names engine code binds to), emitters, sockets, surfaces, `real` and each measure with its **measured** value, sources, QA findings. `out/index.json` lists every asset in the run with its verdict.

## Machine-readable output

`--json` on any command:

```json
{"ok":true,"data":[{"asset":"<name>","findings":[],"triangles":[<lod0>,<lod1>,<lod2>]}]}
{"ok":false,"error":{"code":"T3D_PART_UNKNOWN","message":"…","fix":"add the parent (ctx.group or ctx.part) before its children"}}
```

Current numbers for the gallery recipes: `bun run bench` (README benchmarks block).

Exit codes: `0` pass · `1` QA finding or `T3D_*` error · `2` usage.

## Prompt snippet

```text
Using @developerz-ai/ts23d, write recipes/<name>.ts: a <thing>, real dimensions in metres,
Z up, +X front. Look up reference dimensions first. Block out the masses, then details.
Name every part that moves (axle_*, door_*, rotor_*) and pivot it where it hinges.
Loop: bunx t3d build → fix until QA PASS → read out/<name>/sheet.png →
fix the single biggest error → repeat. Stop when two shots in a row show nothing worth fixing.
Never use Math.random; use ctx.rng.
```

The package ships `AGENTS.md` and `llms.txt` for agents that read them.

## Planned (as of 2026-10)

- **Reverse direction:** a VLM proposes recipe params from photos; the loop scores them by silhouette IoU and keeps the best (M6).
- **MCP server:** `build`, `shot`, `list` as tools, PNG returned inline (M6).
