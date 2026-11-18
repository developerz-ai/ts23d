# dragon_hybrid — Emberwing, a drake, model-first

**The surface is an image-to-3D model's dragon, kept whole with its own textures on three LODs:
body, horns, claws and both membrane wings. Code keeps the animal: the design scale, a quadruped
skeleton, the walk, mass, LOD budgets and QA.** Plan
[2026/11/16 101](../../docs/plans/2026/11/16/101-organic-model-first/overview.md) slice 11,
ADR 014 / 015 / 016. The code-built winged dragon stays [recipes/dragon](../dragon/README.md).
The pattern is [wolf_hybrid](../wolf_hybrid/README.md)'s and [bear_hybrid](../bear_hybrid/README.md)'s.

| File | What it holds |
|---|---|
| `spec.ts` | The design spec and the `CreatureSpec` (quadruped plan, digitigrade) |
| `concept.ts` | The concept image request: model, prompt, seed, size |
| `surface.ts` | The five-request chain, the mesh request, the clips dropped |
| `steps.ts` | The Blender program, built from the fitted rig; every step with its reason |
| `dragon_hybrid.ts` | `defineModelCreature`: box, budget, the design-measures check |
| `neural/<key>/` | Model and Blender outputs + `record.json`; the raw mesh is `local-0.glb` (git-ignored) |

## Design brief

Invented, so nothing is sourced: an original western drake, four legs and two wings, standing
square with the wings raised in a V. Function first: a heavy ambush predator that walks like a
monitor lizard and carries its wings folded up off the ground.

| Borrowed from | What |
|---|---|
| Monitor lizard (Varanus) | horizontal trunk, sprawl-free square stand, long tapering tail resting low |
| Nile crocodile | belly plates, dorsal crest, mass for a 3.2 m body (400–700 kg) |
| Bat | wing: arm and finger spars with membrane between them, thumb claw at the wrist |
| Big cat | digitigrade paws with hooked claws |

## Scale

| Measure | Design spec (`spec.ts`) | Held by |
|---|---|---|
| Head + body (nose → rump) | **3.2 m** ± 5 % | `checks` (`sourced`), test |
| Shoulder | **1.6 m**, − 6 % … + 10 % (the dorsal crest rides above the joint) | `checks`, test |
| Tail | **2.6 m**; its bones span 85 % of it (the thin tip carries no joint), so 75–100 % | `checks`, test |
| Mass | **600 kg** ± 25 % | QA `mass` |
| Box L × W × H | 5.0 × 2.8 × 3.3 m (nose to tail tip, wing tip to wing tip, ground to wing tips) ± 5 % | QA `proportions` |

Measured on the build: shoulder 1.71 m, head and body 3.24 m, tail bones 2.20 m.

## The chain

Five cached requests, each naming the previous output by sha256 (kinds `modelChain`). A build
never calls a model or Blender; `t3d neural run` does.

| # | Task | Tool (licence) | Output | In git |
|---|---|---|---|---|
| 1 | `image` | Z-Image-Turbo (Apache-2.0), seed 9, 1024² | concept PNG, 0.66 MB | yes |
| 2 | `mesh` | Pixal3D (MIT), 1536 cascade, 25 steps | 934 645-triangle GLB, 70 MB | no (`keep: 'local'`) |
| 3 | `blender` proxy | Blender 5.3.0: clean → 6 000-triangle shell | GLB, 0.11 MB | yes |
| 4 | `rig` | UniRig (MIT) on the proxy | its joints, 0.18 MB | yes |
| 5 | `blender` final | Blender 5.3.0: `steps.ts`, 263 s on an RTX 3090 | 3 LODs + maps + skin, 9.1 MB | yes |

Committed: 10.1 MB of the 12 MB cap.

## The Blender steps (`steps.ts`)

| Step | What it did here | Why |
|---|---|---|
| `transform` | the fit's matrix | everything after is in the asset frame, metres |
| `clean` | 934 645 → 929 049 triangles; 55 loose shells dropped | generator output |
| `unweb` | cut 423 web faces between limbs that touch, pushed 3.2 cm apart; 2.9 cm clearance measured | the fore feet stand toe to toe |
| `retopo` | closed shell at a 1.4 cm voxel → 29 998 triangles; density ×3 on head and hips, ×2 on feet | the wing membranes come through as closed slabs. The voxel is pinned (D72): the automatic one (2.03 cm) and its 4-voxel closing pass welded the cut fore toes back together, so the paws shared weights and dragged each other in the walk. 1.8 cm does not close, 2.0 cm fuses the paws, 1.5–1.6 cm sinks a hind claw 2.7 cm at LOD 1–2, 1.2 cm leaves the toe joints outside the paws |
| `uv` · `bake` | 257 islands; albedo 2048², normal and ORM 1024²; hit rate 0.977, 0.09 % unfilled | |
| `bind` | bone heat, 29 bones, no fallback needed | the wings take the chest and spine |
| `weights` | paw weights smoothed round each wrist (538 and 498 vertices) | the walk folds the wrist 146°; unsmoothed, the joint kept 27–52 % of its volume (limit 60 %) |
| `repose` | largest turn 24.4° | straight, symmetric rest; nothing is mirrored |
| `lods` | 9 998 and 4 998 triangles | |
| `export` | one GLB | |

What this dragon needed that the wolf and the bear did not, all in the library now and all
opt-in (the wolf's and the bear's cache keys are unchanged):

| Need | What |
|---|---|
| Registration | The surface registration refused the model (13.5 % off the plan's flesh: the plan has no wings). `modelChain({ register: 'joints' })` registers on the rigger's joints instead: yaw from hips to shoulders, scale from their height, level on the skin under the four feet |
| The tail | The traced tail ran outside the thin tail. `take: [..., 'tail']` lays the plan's tail bones along the rigger's tail chain, each joint pulled back inside the mesh, the last 15 % left without a joint |
| The feet | Spread claws touch on the ground: the leg trace now tells the legs apart at the lowest slab that shows all four (up to six slabs) |
| QA `model` | A tail resting on the ground is not a fifth foot; leg outlines are counted apart from those on the tail's bones; the ground tolerance is 1 cm or 1.2 % of the skeleton's height (2.6 cm here) |

## Clips

`idle`, `look`, `walk` from the creature kind's gait system on the fitted bones.

| Not played | Why |
|---|---|
| wing flap, fold | UniRig returns a quadruped's skeleton with no wing bones: the wings are skinned to the chest and spine and ride with them |
| `trot`, `gallop` | only the walk was brought to a QA pass on this skin (`DROPPED` in `surface.ts`) |
| `bite`, blink | the model's head is one fused surface: no jaw, no lids |

## Result (2026-11-17)

`t3d build`: **QA PASS**, 29 998 / 9 998 / 4 998 triangles, 1 draw per LOD, one 2048 texture set.
Tests: `bun test recipes/dragon_hybrid`.

What the renders show (`out/dragon_hybrid/`, read after the build):

| View | Seen |
|---|---|
| `hero.png` (¾) | reads as a dragon: horned head, pale belly plates, clawed feet, two membrane wings with spars and thumb claws |
| `sheet.png` side | level stand, four feet on the ground, the tail resting low and curling up at the tip |
| `sheet.png` front, top | symmetric; the wings open in a V, 2.8 m tip to tip |
| pose strip (`t3d review`) | the walk steps cleanly; the wings stay rigid on the chest through every pose. From the front the fore paws are two feet with a gap between them in every walk frame (before D72 they shared weights and dragged each other) |

Honest limits: the wings do not move; no trot, gallop, jaw or blink; the horns and claws are part
of the one skin (no separate parts to swap); the scales are a baked surface with a normal map, not
geometry; flat concept lighting is baked into the albedo (no de-lighting step exists).

## Re-roll

As [wolf_hybrid](../wolf_hybrid/README.md#re-roll): change `concept.ts` or `surface.ts`, run
`t3d neural run recipes/dragon_hybrid/dragon_hybrid.ts` from a directory holding the adapter config,
`t3d build` until QA PASS, read the renders, adjust `steps.ts`, delete the key directories no
longer asked for, `bun run shots dragon_hybrid`.
