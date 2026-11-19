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
| `wear.ts` | What this wolf's maps get after the bake: light and orange cast out, haunch stripes and bake holes repainted, roughness, mud, scars (run by [_lib/creature/texture-paint.ts](../_lib/creature/texture-paint.ts)) |
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

The chain is `required: true`. The code wolf this spec would give without the model is not this
asset (over 100 000 triangles at LOD 0 against a 30 000 budget, off the sourced box), so `t3d build`
with an output missing stops with one `T3D_NEURAL_MISSING` and builds nothing. The npm package does
not ship `neural/`: clone the repository to build this recipe, or copy the folder into your project
and run `t3d neural run` on the copy (GPU and Blender, below).

| # | Task | Tool (licence) | Output | In git | Time (RTX 3090) |
|---|---|---|---|---|---|
| 1 | `image` | Z-Image-Turbo (Apache-2.0), seed 9, 1024² | concept PNG, 0.96 MB | yes | 1 min 58 s (41 s of it loading the model) |
| 2 | `mesh` | Pixal3D (MIT), 1536 cascade, 25 steps | 904 626-triangle GLB, 61 MB | no (`keep: 'local'`) | 4 min 56 s |
| 3 | `blender` proxy | Blender 5.3.0: clean → 5 998-triangle shell | GLB, 0.11 MB | yes | 19 s |
| 4 | `rig` | UniRig (MIT) on the proxy | its joints, 0.18 MB | yes | 75 s |
| 5 | `blender` final | Blender 5.3.0: `steps.ts` | 3 LODs + maps + skin, 10.4 MB | yes | about 3 min (the paint step rasterises 2048² texels on one thread) |

Committed: 11.66 MB (11.12 MiB of the 12 MiB cap) (move the superseded final key out before a re-run: two finals
do not fit, and the run fails only at its end). Between 4 and 5 TypeScript registers the proxy on the
creature plan, maps UniRig's joints onto the plan's bone names by topology (four 4-bone limbs,
trunk, head; tail and scapulae from the geometric fit) and derives the straight, symmetric rest
pose the mesh is reposed to.

## The Blender steps (`steps.ts`)

| Step | What it did here | Why |
|---|---|---|
| `transform` | the fit's matrix | everything after is in the asset frame, metres |
| `clean` | welded duplicates, dropped loose shells | generator output |
| `unweb` | cut 747 web faces: 58 between two legs, 313 + 376 between the tail and two legs; 2 cm gap | the tail was generated lying on the hocks |
| `script` (haunches) | 80 passes of neighbour averaging over the skin within 0.13 h of each hip → stifle bone (not within 0.05 h of a tail bone) and in a 0.09 h ball under the mane's rear edge: 124 474 source vertices | the generator drew rib-like ridges 2–3 cm apart across both thighs (they read as a starved animal) and left a row of pits under the mane; smoothed on the source, neither the shell nor the baked normal map carries them |
| `script` (tufts) | locks of coat raised out of the outline, each lock's tip drooping down and back: ruff and throat 2.4 cm, back 1.6 cm, brisket and belly 2.2 cm, trousers 1.6 cm, the tail's brush 2 cm; never on the flanks (the box's width holds) or the head | the outline was one smooth hull; on the source, so the shell and the bake carry them |
| `retopo` | closed shell → 29 998 triangles; density ×3 on the head, ×2 on paws and hips | never collapse a noisy scan directly; edge loops where it bends |
| `uv` · `bake` | albedo 2048², normal and ORM 1024²; hit rate 0.997, 0 unfilled | fur detail lives in the normal map |
| `bind` | bone heat, 29 bones, no fallback needed | |
| `isolate` | 740 vertices of tail skin take only tail bones; 601 of the rump are refilled from the body; `contact: 0.04` blends the 374 vertices within 4 cm of the 84 edges that join tail skin to thigh skin | bone heat reads nearness; a tail on the hocks is near the leg bones. The tail was also generated fused to both thighs ("The tail on the thighs" below) |
| `repose` | largest turn 27.8° (head) | the "profile" concept still turned its head; nothing is mirrored |
| `script` (paint) | `wear.ts`, below | a textured part takes no `paint`, `finish` or grime pass (ADR 016): de-lighting and wear have to be in its maps |
| `lods` | 9 998 and 4 998 triangles, same UVs, maps and weights | |
| `export` | one GLB | |

Look at a change with `bun run t3d review recipes/wolf_hybrid/wolf_hybrid.ts --out review` (pose strip, LODs) after `t3d neural run`, and at each step's numbers in the final key's `output-1.json`. `t3d blender review <recipe>` does not work here yet: it needs a `BLENDER_REVIEW` export, and this program is built from the fit (planned); `--mesh` / `--program` take any GLB and step list.

## Paint and wear (`wear.ts`)

One `script` step after `repose`. The shell's triangles are rasterised in UV space, so every texel
knows where it lies on the body; masks are functions of position (a height band, a capsule round a
bone, a thin slab cutting the surface, seeded value noise), never of UV islands, and every LOD
samples the same maps. The story: a wolf that has crossed a peat bog, with a rival's marks on it.

| Pass | What | Measured on the run |
|---|---|---|
| De-light | brightness varying over 13 cm pulled towards the coat's value over 44 cm (85 % of a lit blotch, 70 % of a shaded one); the white streaks left along the top of the back shaded to 62 % | mean gain × 1.09 either way |
| Orange cast | texels whose chroma passes 0.42–0.62 (flank, ears, tail root; not the irises) lose 55 % of it and move 40 % towards tawny grey | 8.2 % of the vertices had chroma over 0.45 before, 0.4 % after (test) |
| Bake holes | black texels round the hocks and stifles (the faces `unweb` cut) and under the mane's rear edge take their neighbourhood's colour | 0.17 % of the coat |
| Haunch stripes | on both thighs' outer faces colour is averaged 7 cm up and down but 1.6 cm along, with fresh fine grain: a level stripe goes, the coat's pattern stays | |
| Roughness | coat 0.72–0.97 (paler guard hair drier), nose 0.26, dried mud 0.96, wet mud 0.5, scars 0.5 | was one flat 0.8; spread 30 of 255 (test) |
| Mud | wet and black to the pasterns (relief planed to 30 %), a paler cracked crust to the wrists and hocks, flecks a centimetre across up the legs, the belly and the chest, thinning out upwards; the crust and flecks carry their own grain in the normal map | 14 % of the coat crusted, 10 % flecked, 7 % wet |
| Scars | three healed rakes across the right shoulder (to 13 cm, 1.4 cm wide) and one across the right side of the muzzle: grey-pink skin in a groove 3 mm deep in the normal map, a darker lip each side. The right side is the one the hero shot shows | |

## Clips

`idle`, `look`, `walk`, `trot` from the creature kind's gait system on the fitted bones.

| Not played | Why |
|---|---|
| `gallop` | it streams the tail out behind; this model's tail was generated on the rump and hocks (`DROPPED` in `surface.ts`) |
| `bite`, blink | the model's head is one fused surface: no jaw, no lids |

## Result (2026-11-19)

`t3d build`: **QA PASS** with no declared tolerance, 29 998 / 9 998 / 4 998 triangles, 1 draw
per LOD, 41 bones (29 + 12 mid-limb helpers), one 2048 texture set. Tests:
`bun test recipes/wolf_hybrid` (the D253 edge test and the zero-tolerance deform gate hold on the
re-made shell).

What the renders show (`out/wolf_hybrid/`, read after the build):

| View | Seen |
|---|---|
| `hero.png` (¾) | one straight head, four separate legs, a grey saddle over tawny flanks and a pale chest; legs black with wet mud to the pasterns and crusted above, flecks up the chest; three rakes on the shoulder and a cut on the muzzle; reads as a wolf that lives outdoors |
| critique `raking.png` | the haunches are smooth muscle (the rib-like ridges are gone but for a faint trace mid-thigh); the pits under the mane are closed |
| `sheet.png` front, top | head centred and forward, body straight, no mirror seam |
| pose strip (`t3d review`) | walk and trot frames move as a wolf; at the hip's limits the tail's upper part leans with the thigh it lies on ("The tail on the thighs") |
| `portrait.png` | the face is soft at close range; an ochre streak runs down the neck behind the ear where the head was turned straight |

Honest limits: the belly is smooth and plastic (the concept never showed it); the coat is a
painted surface with a ripple pattern, not fur cards (the locks on the outline are 2 cm of
geometry, not strands); the tail swings only ± 11°; de-lighting is a band filter, not an inverse
render: the saddle's own black-and-white grizzle is kept as the generator drew it, and the
haunches, repainted over the stripes, are plainer than the rest of the coat; the scars are paint
and a normal-map groove, the ears are whole.

Three near-misses on the way, each fixed at its cause: scapula tops outside the skin (the joint
mapping now pulls them under it), a hip edge stretching ×4.1–4.2 on LOD 1 and 2 (density ×2 round
the hips), withers 1 mm under the sourced minimum on LOD 2 only (the check reads LOD 0).

## The tail on the thighs (D253, fixed 2026-11-19)

The generator laid the hanging tail against both thighs as one surface with them, from 0.36 to
0.52 m up: the inner face of the right thigh and the back of the left. `unweb` cuts the tail only
from the *free* legs, below the stifle, so above it tail skin and thigh skin share edges. With
`isolate`'s hard split (tail skin on tail bones only) those edges had one end on the tail and the
other on the leg, and at the hip's limits (`hind_r_0` and `hind_l_0`, −31° / +46.5°: the
limits the creature kind sets, unchanged) each stretched by the whole motion between the two.

| QA `deform` stretch (limit ×4), worst of the two limits | LOD 0 | LOD 1 | LOD 2 |
|---|---|---|---|
| `hind_r_0` before | ×3.63 | ×5.66 | ×5.10 |
| `hind_r_0` now | ×2.24 | ×2.22 | ×2.18 |
| `hind_l_0` before | ×2.64 | ×4.19 | ×3.62 |
| `hind_l_0` now | ×2.19 | ×2.18 | ×2.18 |
| Worst single edge before → now | ×10.7 → ×6.4 | ×9.4 → ×4.0 | ×8.5 → ×3.3 |

The fix is in the weights, not the gate: `isolate`'s `contact: 0.04` (`steps.ts`) relaxes the
weights within 4 cm of every edge that joins tail skin to thigh skin, so the motion is shared by
the edges across that band. Both `limitTolerances` are gone; `wolf_hybrid.test.ts` holds zero
tail-only ↔ leg-only edges on every LOD and zero declared tolerances. Stifle volume at full
flexion is 0.84–0.86 (was 0.88–0.91; limit 0.6), the tail's own limits read ×1.2.

Still true: the tail is one surface with the thighs there. Nothing tears or webs past the gate,
but the upper tail leans a little with whichever thigh swings, and a tail that streams free (the
gallop) needs a mesh generated with the tail clear of the legs.

Tried and dropped: cutting the thighs from the tail in `unweb` and cutting `isolate` below the
tail root (baked the tail's dark fur onto the right thigh, visible at rest); a wider global
`feather` (helps one side only); `bake.cageFit` (×4.1–4.6); a re-generated mesh with the tail
swept back (free of the hocks, not of the thighs, hips ×4.2–5.2, stifle volume 26–53 %); a
`contact` of 8 cm (reaches the stifle: its volume drops to 0.73).

## Why the blend went

| | Blend (0.9.0) | Model-first |
|---|---|---|
| Surface | code body moved ≤ 12 mm toward the model, colour by closest point | the model's own mesh, retopologised |
| Texture | vertex colour | baked albedo, normal, ORM |
| Joints | plan | UniRig, mapped to the plan |
| Without the cache | code wolf | `T3D_NEURAL_MISSING` in a build (the chain is required) |

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
