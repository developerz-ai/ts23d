# bear_hybrid — the brown bear, model-first

**The surface is an image-to-3D model's bear, kept whole with its own textures on three LODs; code
keeps the animal: sourced scale, the plantigrade skeleton, the walk, mass, LOD budgets and QA.**
Plan [2026/11/16 101](../../docs/plans/2026/11/16/101-organic-model-first/overview.md) slice 10,
ADR 014 / 015 / 016. The dossier (ranges, photo links) is
[recipes/brown_bear/README.md](../brown_bear/README.md); that recipe stays the code-built big male.
The pattern is [wolf_hybrid](../wolf_hybrid/README.md)'s.

| File | What it holds |
|---|---|
| `spec.ts` | The sourced `CreatureSpec`: the wolf's ursid family member at average-adult numbers |
| `concept.ts` | The concept image request: model, prompt, seed, size |
| `surface.ts` | The five-request chain, the mesh request, the clips dropped |
| `steps.ts` | The Blender program, built from the fitted rig; every step with its reason |
| `bear_hybrid.ts` | `defineModelCreature`: real box, budget, the sourced-measures check |
| `neural/<key>/` | Model and Blender outputs + `record.json`; the raw mesh is `local-0.glb` (git-ignored) |

## Scale

An image-to-3D model draws an average bear, and a model is registered to a plan, not stretched
onto one: against `brown_bear`'s 2.1 m male the registration was refused (4.7 % off the plan's
flesh, limit 4.5 %; the model is 1.55× as long as it is tall at the shoulder, that spec 1.9×).
This recipe declares the animal the model shows, inside the same sourced ranges.

| Measure | Sourced ([brown_bear dossier](../brown_bear/README.md)) | This recipe | Held by |
|---|---|---|---|
| Head + body | 1.0–2.8 m | **1.70** ± 5 % | `checks` (`sourced`), test |
| Shoulder | up to 1.5 m | **1.00** (estimate for an average adult on all fours, unverified, as in the dossier) | `checks`, test |
| Free tail (past the croup) | 0.06–0.22 m | inside | `checks`, test |
| Mass | 80–600 kg | **250**, ± 25 % | QA `mass` |
| Box L × W × H | 1.70 × 0.62 × 1.05 m (head and body, the tail hidden in the coat; shoulder + 5 cm of coat on the hump) | ± 5 % | QA `proportions` |

## The chain

Five cached requests, each naming the previous output by sha256 (kinds `modelChain`). A build
never calls a model or Blender; `t3d neural run` does.

| # | Task | Tool (licence) | Output | In git | Time (RTX 3090) |
|---|---|---|---|---|---|
| 1 | `image` | Z-Image-Turbo (Apache-2.0), seed 5, 1024² | concept PNG, 1.0 MB | yes | 38 s |
| 2 | `mesh` | Pixal3D (MIT), 1536 cascade, 25 steps | 941 691-triangle GLB, 76 MB | no (`keep: 'local'`) | 7 min 18 s |
| 3 | `blender` proxy | Blender 5.3.0: clean → 5 998-triangle shell | GLB, 0.11 MB | yes | 26 s |
| 4 | `rig` | UniRig (MIT) on the proxy | its joints, 0.18 MB | yes | 60 s |
| 5 | `blender` final | Blender 5.3.0: `steps.ts` | 3 LODs + maps + skin, 9.7 MB | yes | 88 s |

Committed: 10.96 MB of the 12 MB cap.

## The Blender steps (`steps.ts`)

| Step | What it did here | Why |
|---|---|---|
| `transform` | the fit's matrix | everything after is in the asset frame, metres |
| `clean` | 941 691 → 892 702 triangles | generator output |
| `unweb` | cut 674 web faces between the tail and the two hind legs; 1.9 cm clearance measured | the stub tail lies on the legs |
| `retopo` | closed shell → 29 998 triangles; density ×3 on head and hips, ×2 on paws | at ×2 the hips stretched ×4.3–5.0 at their limits |
| `uv` · `bake` | 159 islands; albedo 2048², normal and ORM 1024²; hit rate 0.989, 0 unfilled | |
| `bind` | bone heat, no fallback needed | |
| `isolate` | 1 283 vertices: the tail's skin takes only tail bones | |
| `weights` | paw weights smoothed round each wrist (552 and 556 vertices) | the walk folds the wrist 84°; unsmoothed, 6.6–10 % of the triangles round it passed through each other (limit 6 %) |
| `repose` | largest turn 40.9° | straight, symmetric rest; nothing is mirrored |
| `lods` | 9 998 and 4 998 triangles | |
| `export` | one GLB | |

Two things this bear needed that the wolf did not, both in the library now:

| Need | What |
|---|---|
| The head bone | UniRig ends this bear's trunk at the snout, and the plan's 0.40 m head from there ran 0.30 m past the nose. `modelChain({ nose: true })` starts the head at the last trunk joint half a head behind the traced nose tip and ends it at the nose |
| The fit gate | QA `model` read "not registered" (14.8 % of the skeleton's height from a bone; the limit, 12.5 %, was calibrated on a lean wolf). It now asks that no copy of the skeleton turned a quarter or half a turn fits clearly better: wolf 0.75, bear 0.67 registered; 1.34 and 1.49 half a turn off |

## Clips

`idle`, `look`, `walk` from the creature kind's gait system on the fitted bones (plantigrade swing).

| Not played | Why |
|---|---|
| `trot`, `gallop` | they fold the plantigrade wrist and stretch the hips further than this skin takes (`DROPPED` in `surface.ts`) |
| `bite`, blink | the model's head is one fused surface: no jaw, no lids |

## Result (2026-11-17)

`t3d build`: **QA PASS**, 29 998 / 9 998 / 4 998 triangles, 1 draw per LOD, one 2048 texture set.
Tests: `bun test recipes/bear_hybrid`.

What the renders show (`out/bear_hybrid/`, read after the build):

| View | Seen |
|---|---|
| `hero.png` (¾) | reads as a brown bear: heavy forequarter, hump, dished face, pale fore claws |
| `sheet.png` side, rear | level stand, all four paws flat on the ground, LOD 2 holds the outline |
| `sheet.png` front, top | the head is carried cocked a little to its left, not square |
| pose strip (`t3d review`) | the walk moves as a heavy plantigrade stride, no torn sheets |

Honest limits: the ear rims are white (the model's texture, not a bear's); the coat is a painted
surface, not fur cards; the head tilt above; flat concept lighting still left the shoulders
lighter than the rump (no de-lighting step exists); no trot or gallop.

## Re-roll

As [wolf_hybrid](../wolf_hybrid/README.md#re-roll): change `concept.ts` or `surface.ts`, run
`t3d neural run recipes/bear_hybrid/bear_hybrid.ts` from a directory holding the adapter config,
`t3d build` until QA PASS, read the renders, adjust `steps.ts`, delete the key directories no
longer asked for, `bun run shots bear_hybrid`.
