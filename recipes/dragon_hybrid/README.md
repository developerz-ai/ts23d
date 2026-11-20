# dragon_hybrid — Emberwing, a drake, model-first

**The surface is an image-to-3D model's dragon, kept whole with its own textures on three LODs:
body, horns, claws and both membrane wings. Code keeps the animal: the design scale, a quadruped
skeleton with three bones a wing, the walk, the wing beat, mass, LOD budgets and QA.** Plan
[2026/11/16 101](../../docs/plans/2026/11/16/101-organic-model-first/overview.md) slice 11,
ADR 014 / 015 / 016. The code-built winged dragon stays [recipes/dragon](../dragon/README.md).
The pattern is [wolf_hybrid](../wolf_hybrid/README.md)'s and [bear_hybrid](../bear_hybrid/README.md)'s.

| File | What it holds |
|---|---|
| `spec.ts` | The design spec and the `CreatureSpec` (quadruped plan, digitigrade) |
| `concept.ts` | The concept image request: model, prompt, seed, size |
| `surface.ts` | The five-request chain, the mesh request, the clips dropped |
| `steps.ts` | The Blender program, built from the fitted rig; every step with its reason |
| `wings.ts` | The wing bones, found on the proxy mesh (shoulder, wrist, finger, tip), their limits and the `flap` design values |
| `wear.ts` | What the maps get after the bake: light and the wings' dapple out, keratin horns, roughness, soot, dust, scars on hide and membrane, their grooves in the normal map (run by [_lib/creature/texture-paint.ts](../_lib/creature/texture-paint.ts)) |
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
| Wings | the generator's × **1.4** about their roots (`WING_SCALE`), lowered **22°** (`WING_TILT`): 5.0 m tip to tip, the animal's own length | test |
| Box L × W × H | 5.0 × 5.0 × 3.2 m (nose to tail tip, wing tip to wing tip, ground to wing tips) ± 5 % | QA `proportions` |

Measured on the build: shoulder 1.71 m, head and body 3.24 m, tail bones 2.20 m. The rump is read on
the midline at the height of the first free tail joint: the wings' trailing membranes reach
further back than the croup, and the earlier reading (any skin above 0.775 of the shoulder height)
would now measure a wing's hem.

## The chain

Five cached requests, each naming the previous output by sha256 (kinds `modelChain`). A build
never calls a model or Blender; `t3d neural run` does.

The chain is `required: true`. The code quadruped this spec would give without the model is not this
asset (over 100 000 triangles at LOD 0 against a 30 000 budget, off the sourced box), so `t3d build`
with an output missing stops with one `T3D_NEURAL_MISSING` and builds nothing. The npm package does
not ship `neural/`: clone the repository to build this recipe, or copy the folder into your project
and run `t3d neural run` on the copy (GPU and Blender, below).

| # | Task | Tool (licence) | Output | In git |
|---|---|---|---|---|
| 1 | `image` | Z-Image-Turbo (Apache-2.0), seed 9, 1024² | concept PNG, 0.66 MB | yes |
| 2 | `mesh` | Pixal3D (MIT), 1536 cascade, 25 steps | 934 645-triangle GLB, 70 MB | no (`keep: 'local'`) |
| 3 | `blender` proxy | Blender 5.3.0: clean → 6 000-triangle shell | GLB, 0.11 MB | yes |
| 4 | `rig` | UniRig (MIT) on the proxy | its joints, 0.18 MB | yes |
| 5 | `blender` final | Blender 5.3.0: `steps.ts`, 238 s on an RTX 3090 (the bake) and one CPU thread | 3 LODs + maps + skin, 9.8 MB | yes |

Committed: 10.8 MB of the 12 MB cap (delete the superseded final key before a re-run: two finals do not fit).

## The Blender steps (`steps.ts`)

| Step | What it did here | Why |
|---|---|---|
| `transform` | the fit's matrix | everything after is in the asset frame, metres |
| `clean` | 934 645 → 929 049 triangles; 55 loose shells dropped | generator output |
| `script` (build) | wings × 1.4 about their roots and lowered 22° about the body's long axis through them (70 431 and 77 176 source vertices: what stands over 0.3 h off every trunk bone, above the back); upper and lower legs 10 % thicker about their bones; 4 480 faces cut out of the wings' trailing edges: a ragged notch 1.0 m deep and 32 cm wide at the hem in the right wing (the hero's side), one 58 cm deep in the left; the skin over each fore toe joint raised until the joint lies 2 cm inside | the generator's wings were small for a 600 kg body and raised in a narrow V (at × 1.25 the V still measured 3.3 m across a 4.9 m animal and read as decorative), its legs thin; a 54 cm notch 12 cm wide did not show in any render; the toe joints lay 1–2 cm outside the thin paws (QA `model`) |
| `unweb` | cut 420 web faces between limbs that touch, pushed 3.2 cm apart; 2.9 cm clearance measured | the fore feet stand toe to toe |
| `retopo` | closed shell at a 1.4 cm voxel → 29 998 triangles; density ×3 on head and hips, ×2 on feet | the wing membranes come through as closed slabs. The voxel is pinned (D72): the automatic one (2.03 cm) and its 4-voxel closing pass welded the cut fore toes back together, so the paws shared weights and dragged each other in the walk. 1.8 cm does not close, 2.0 cm fuses the paws, 1.5–1.6 cm sinks a hind claw 2.7 cm at LOD 1–2, 1.2 cm leaves the toe joints outside the paws |
| `uv` · `bake` | 499 islands; albedo 2048², normal and ORM 1024²; hit rate 0.998, nothing unfilled | |
| `bind` | bone heat, 35 bones (the plan's 29 and three a wing from `wings.ts`), no fallback needed, no bone unused | each wing follows its own shoulder, wrist and finger; where the two wings meet the back the skin shares both |
| `weights` | paw weights smoothed round each wrist (526 and 483 vertices) | the walk folds the wrist 146°; unsmoothed, the joint kept 27–52 % of its volume (limit 60 %) |
| `repose` | largest turn 24.4° | straight, symmetric rest; nothing is mirrored |
| `script` (paint) | `wear.ts`, below | a textured part takes no `paint`, `finish` or grime pass (ADR 016): wear has to be in its maps |
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

`idle`, `look`, `walk` from the creature kind's gait system on the fitted bones; `flap` from the
wing chains (kinds `ExtraChain.motion`). In `idle` the wings settle with the breath (± 1.2° at
the shoulder to ± 2° at the finger); in the walk they are carried, raised, and bounce twice a
stride (± 1.5° to ± 3°). They do not fold: the model's wings are open, and a fold would need
the membrane to pleat.

| Not played | Why |
|---|---|
| wing fold | the membrane is one open surface: folding the fingers together would pleat it, which linear-blend skinning on three bones cannot do |
| `trot`, `gallop` | only the walk was brought to a QA pass on this skin (`DROPPED` in `surface.ts`) |
| `bite`, blink | the model's head is one fused surface: no jaw, no lids |

## Wings

Scaled, not sourced: an invented animal. At 600 kg no wing this size flies (a 5 m span carries
a few tens of kilograms in any real flyer); like every heavy fantasy drake it is a display and
gliding surface. The scale answers the picture: the generator's 2.8 m V read as a hatchling's on
this body, and × 1.25, still raised 52° above the horizon, as decoration (3.3 m across a 4.9 m
animal). × 1.4 and lowered to 30°, the wings spread as wide as the animal is long.

### Wing bones (`wings.ts`)

UniRig returns a quadruped and no wing joints, so the bones are found on the proxy mesh, the
same mesh the skeleton is fitted into (kinds `modelChain({ extra })`):

| Joint | Where |
|---|---|
| tip | the wing's point farthest from its root: the end of the leading finger |
| line | the cheapest path through the solid from the tip to the withers (kinds `tracePath`, 2.5 cm cells): deep flesh is cheap and thin membrane dear, so it runs down the finger spar, through the wrist and down the arm |
| shoulder | where that line leaves the wing (0.3 h off the trunk's bones): the fixed end of the × 1.4 and of the 22° turn |
| wrist | the line's corner: its point farthest from the shoulder–tip chord, where the fingers meet |
| finger | half way along the line from the wrist to the tip |

Three bones a side, `wing_l_0..2` and `wing_r_0..2`, hung from `spine_2`, 1.0–1.3 m each. The
joints go to Blender scaled and turned about the same root as the build step moves the wing, so
they sit in the spars of the mesh it binds (QA `model` wants every joint inside). `repose` makes
the pair symmetric: the wings measure 4.99 m across and stand 3.20 m high.

### The beat (`FLAP` in `wings.ts`)

Every number is a design value: nothing about an invented animal's wing beat can be sourced. It
is a display beat on the ground, slow enough to read as heavy.

| Value | | |
|---|---|---|
| Rate | 0.9 beats a second (1.11 s loop) | |
| Stroke, degrees about the body's long axis from the rest | shoulder + 30 … − 8, wrist + 5 … − 16, finger + 4 … − 10 | the same arc in space as before the wings were lowered 22° (then + 8 … − 30): up into the V the generator drew, down to level with the back |
| Downstroke | 42 % of the beat | quicker down than up |
| Lag | each joint 7 % of the beat behind the one before | the tip follows the arm |
| Joint limits | shoulder − 10 … + 32, wrist − 18 … + 7, finger − 12 … + 6 | the stroke and 2° to spare; QA `deform` poses the skin at each |

Measured (`bun test recipes/dragon_hybrid`): each tip travels 2.25 m and 2.18 m over the beat; no
edge of the membrane stretches more than × 1.51 at any key. QA `deform` passes at the limits on
all three LODs (stretch limit × 4, volume ≥ 60 %, no triangle crossing).

## Paint and wear (`wear.ts`)

One `script` step after `repose`; masks are functions of each texel's position on the body, so
they never cross a UV seam, and all three LODs sample the same maps.

| Pass | What |
|---|---|
| De-light | brightness varying over 26 cm pulled towards the hide's value over 88 cm; on the wings a second pass (16 cm towards 1.1 m, 95 % of a lit blotch): the membranes kept a pale dapple that read as baked highlights |
| Horns | chalk grey → keratin: dark root, bone-pale tip, growth rings 4 cm apart |
| Roughness | scales 0.38–0.8 (pale crowns smoother), belly plates 0.5, wing leather 0.78, horn 0.3–0.42, claws 0.3, dust 0.95, soot 0.92, scars 0.38; was one flat 0.8 |
| Soot | black over the muzzle and jaw (to 24 % of the hide's value), fading down the throat to the chest and up to the horn roots; the scales' relief planed to 60 % under it |
| Dust | caked pale to the hocks and wrists, under the belly, along the tail that drags; 8.8 % of the surface, with its own grain in the normal map |
| Scars | on the right side, the hero's: three claw rakes across the flank (up to 48 cm long, 4.5 cm wide), two across the haunch, one across the neck; pale smooth skin in a groove 1 cm deep in the normal map, a dark lip each side |
| Wing | three slashes healed pale across the right wing's membrane (up to 83 cm), through the leather: they show on both faces; the hems darker in patches |

The hero camera stands on that side: `hero: { azDeg: -60, elDeg: 12 }` (`dragon_hybrid.ts`).

## Result (2026-11-19)

`t3d build`: **QA PASS**, 29 998 / 9 998 / 4 998 triangles, 1 draw per LOD, one 2048 texture set,
47 bones (35 and 12 half-angle helpers).
Tests: `bun test recipes/dragon_hybrid`.

What the renders show (read after the build):

| View | Seen |
|---|---|
| `hero.png` (right ¾) | reads as a dragon: horned head sooted dark, pale belly plates, clawed feet, two membrane wings with spars and thumb claws spread a body length across; the deep ragged tear in the near wing's hem and three pale slashes across its membrane; pale scars on the neck, flank and haunch; dusty feet and tail |
| `sheet.png` side | level stand, four feet on the ground, the tail resting low; the tear, the slashes and the flank scars |
| `sheet.png` front, top | symmetric; the wings half spread, 5.0 m tip to tip |
| limit poses (`t3d review`, `poses.png`) | at the shoulder's + 32° a wing stands in the V the generator drew, at − 10° a little under the rest; the membrane stays on the back and the arm, no fold through the body |

Honest limits: the wings beat but do not fold, and the beat is a design value; each wing is
three bones, so the three fingers of a wing move as one fan; no trot, gallop, jaw or blink; the horns and claws
are the generator's geometry in the one skin (repainted, not rebuilt as code parts: cutting them
off the fused head and seating new ones was not attempted); the scales are a baked surface with a
normal map, not geometry; de-lighting is a band filter, not an inverse render.

## Re-roll

As [wolf_hybrid](../wolf_hybrid/README.md#re-roll): change `concept.ts` or `surface.ts`, run
`t3d neural run recipes/dragon_hybrid/dragon_hybrid.ts` from a directory holding the adapter config,
`t3d build` until QA PASS, read the renders, adjust `steps.ts`, delete the key directories no
longer asked for, `bun run shots dragon_hybrid`.
