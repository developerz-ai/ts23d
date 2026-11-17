# wolf_hybrid — the grey wolf, model-first

**The surface is an image-to-3D model's wolf, kept whole with its own textures on three LODs; code
keeps the animal: sourced scale, skeleton, walk and trot, mass, LOD budgets and QA.** Plan
[2026/11/16 101](../../docs/plans/2026/11/16/101-organic-model-first/overview.md) slice 08,
ADR 014 / 015 / 016. The dossier (measurements, coat, photo links) is
[recipes/wolf/README.md](../wolf/README.md); `spec.ts` is the same sourced `CreatureSpec`.

It replaces the earlier blend (a model's surface shrink-wrapped onto the code wolf, its colour in
vertex colour), which lost the model's look: see "Why the blend went" below.

| File | What it holds |
|---|---|
| `spec.ts` | The sourced `CreatureSpec` (as `recipes/wolf`) |
| `concept.ts` | The concept image request: model, prompt, seed, size |
| `surface.ts` | The five-request chain, the mesh request, the clips dropped |
| `steps.ts` | The Blender program, built from the fitted rig; every step with its reason |
| `wolf_hybrid.ts` | `defineModelCreature`: real box, budget, the sourced-measures check |
| `neural/<key>/` | Model and Blender outputs + `record.json`; the raw mesh is `local-0.glb` (git-ignored) |

## Scale

| Measure | Sourced (dossier) | Built (LOD 0) | Held by |
|---|---|---|---|
| Withers | 0.80–0.85 m | inside 0.80–0.86 | `checks` (`sourced`), test |
| Head and body | 1.05–1.60 m; this spec 1.15 | 1.15 ± 5 % | `checks`, test |
| Tail along its bones | 0.29–0.50 m | inside | `checks`, test |
| Box L × W × H | 1.24 × 0.32 × 0.95 m (1.15 + 0.09 of tail brush behind the rump; 0.22 chest + winter mane; 0.82 + ears) | ± 5 % | QA `proportions` |
| Mass | 40 kg | density solved from it | QA `mass` |

The check reads LOD 0, like `real.measures`: a decimated far LOD loses a millimetre of coat.

## The chain

Five cached requests, each naming the previous output by sha256 (kinds `modelChain`). A build
never calls a model or Blender; `t3d neural run` does.

| # | Task | Tool (licence) | Output | In git | Time (RTX 3090) |
|---|---|---|---|---|---|
| 1 | `image` | Z-Image-Turbo (Apache-2.0), seed 9, 1024² | concept PNG, 0.96 MB | yes | 1 min 58 s (41 s of it loading the model) |
| 2 | `mesh` | Pixal3D (MIT), 1536 cascade, 25 steps | 904 626-triangle GLB, 61 MB | no (`keep: 'local'`) | 4 min 56 s |
| 3 | `blender` proxy | Blender 5.3.0: clean → 5 998-triangle shell | GLB, 0.11 MB | yes | 19 s |
| 4 | `rig` | UniRig (MIT) on the proxy | its joints, 0.18 MB | yes | 75 s |
| 5 | `blender` final | Blender 5.3.0: `steps.ts` | 3 LODs + maps + skin, 9.3 MB | yes | 73 s |

Committed: 10.56 MB of the 12 MB cap. Between 4 and 5 TypeScript registers the proxy on the
creature plan, maps UniRig's joints onto the plan's bone names by topology (four 4-bone limbs,
trunk, head; tail and scapulae from the geometric fit) and derives the straight, symmetric rest
pose the mesh is reposed to.

## The Blender steps (`steps.ts`)

| Step | What it did here | Why |
|---|---|---|
| `transform` | the fit's matrix | everything after is in the asset frame, metres |
| `clean` | welded duplicates, dropped loose shells | generator output |
| `unweb` | cut 747 web faces: 58 between two legs, 313 + 376 between the tail and two legs; 2 cm gap | the tail was generated lying on the hocks |
| `retopo` | closed shell → 29 998 triangles; density ×3 on the head, ×2 on paws and hips | never collapse a noisy scan directly; edge loops where it bends |
| `uv` · `bake` | 180 islands; albedo 2048², normal and ORM 1024²; hit rate 0.998, 0 unfilled | fur detail lives in the normal map |
| `bind` | bone heat, 29 bones, no fallback needed | |
| `isolate` | 881 vertices: the tail's skin takes only tail bones | bone heat reads nearness; a tail on the hocks is near the leg bones |
| `repose` | largest turn 27.8° (head) | the "profile" concept still turned its head; nothing is mirrored |
| `lods` | 9 998 and 4 998 triangles, same UVs, maps and weights | |
| `export` | one GLB | |

Look at any change with `bun run t3d blender review recipes/wolf_hybrid/wolf_hybrid.ts --out review`.

## Clips

`idle`, `look`, `walk`, `trot` from the creature kind's gait system on the fitted bones.

| Not played | Why |
|---|---|
| `gallop` | it streams the tail out behind; this model's tail was generated on the rump and hocks (`DROPPED` in `surface.ts`) |
| `bite`, blink | the model's head is one fused surface: no jaw, no lids |

## Result (2026-11-16)

`t3d build`: **QA PASS**, 29 998 / 9 998 / 4 998 triangles, 1 draw per LOD, 41 bones (29 +
12 mid-limb helpers), one 2048 texture set. Tests: `bun test recipes/wolf_hybrid`.

What the renders show (`out/wolf_hybrid/`, read after the build):

| View | Seen |
|---|---|
| `hero.png` (¾) | one straight head, four separate legs, a grey-and-ochre winter coat; reads as a wolf |
| `sheet.png` front, top | head centred and forward, body straight, no mirror seam |
| pose strip (`t3d review`) | walk and trot frames move as a wolf, no torn sheets between tail and hind legs |
| `portrait.png` | the face is soft at close range; an ochre streak runs down the neck behind the ear where the head was turned straight |

Honest limits: the belly is smooth and plastic (the concept never showed it); the coat is a
painted surface with a ripple pattern, not fur cards; the tail swings only ± 11°; flat concept
lighting still left the chest lighter than the flanks (no de-lighting step exists).

Three near-misses on the way, each fixed at its cause: scapula tops outside the skin (the joint
mapping now pulls them under it), a hip edge stretching ×4.1–4.2 on LOD 1 and 2 (density ×2 round
the hips), withers 1 mm under the sourced minimum on LOD 2 only (the check reads LOD 0).

## Why the blend went

| | Blend (0.9.0) | Model-first |
|---|---|---|
| Surface | code body moved ≤ 12 mm toward the model, colour by closest point | the model's own mesh, retopologised |
| Texture | vertex colour | baked albedo, normal, ORM |
| Joints | plan | UniRig, mapped to the plan |
| Fallback | code wolf | code wolf (unchanged) |

## Re-roll

1. Change the seed or prompt in `concept.ts` (side profile, head forward, legs apart, tail clear,
   flat light) or the mesh request in `surface.ts`.
2. From a directory holding a `t3d.config.ts` that routes `image`, `mesh` (`maxBytes` ≥ 128 MB)
   and `rig` to the reference server and `blender` to `blenderAdapter()`:
   `t3d neural run recipes/wolf_hybrid/wolf_hybrid.ts`. One model on the card at a time.
3. A new mesh is a new sample: `t3d build` until QA PASS, read `t3d shot`, `t3d hero` and the
   review pose strip, adjust `steps.ts`.
4. Delete the key directories under `neural/` the recipe no longer asks for (the cap counts
   them), then `bun run shots wolf_hybrid`.
