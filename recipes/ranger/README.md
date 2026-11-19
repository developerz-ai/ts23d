# Ranger — a full-body humanoid, model-first

The first full-body human in the gallery (plan 2026/11/16/101 slice 09). The surface, the skin and
the motion come from a cached chain of model requests; code keeps the real scale, the LOD budgets,
the mass, the clip names and QA. With no cache the asset is a grey CPU mannequin.

## Design brief (original design)

A woodland ranger: a lean man in his thirties, 1.78 m, short brown hair and beard. No existing
character, costume or emblem was named in the prompt or used as a reference.

| Feature | What it is | Reference (garment type, not a design to copy) |
|---|---|---|
| Jerkin | hip-length dark-green leather, front studs, standing collar, short shoulder capes | [Jerkin](https://en.wikipedia.org/wiki/Jerkin) |
| Trousers | loose brown wool, tucked into the boots | [Braies](https://en.wikipedia.org/wiki/Braies) · [Hose](https://en.wikipedia.org/wiki/Hose_(clothing)) |
| Bracers | laced leather forearm guards | [Bracer](https://en.wikipedia.org/wiki/Bracer) |
| Baldric and belt | one strap across the chest, a buckled waist belt | [Baldric](https://en.wikipedia.org/wiki/Baldric) |
| Boots | knee-high leather with a turned cuff | [Riding boot](https://en.wikipedia.org/wiki/Riding_boot) |

Pose: a-pose, empty hands (what a rigging service needs: limbs apart, nothing fused to the body).
The prompt asked for no weapons and a belt pouch; the image model drew a sheathed knife on the
right hip and no pouch. It is kept as drawn (it is fused to the belt in the mesh).

## Proportions

Stature 1.78 m: a little over the ANSUR II male mean (1.756 m). Artists' canon: 7.5 heads
([Body proportions](https://en.wikipedia.org/wiki/Body_proportions)). Segment heights are shares of
stature H from Drillis & Contini 1966, as tabulated in D. A. Winter, *Biomechanics and Motor
Control of Human Movement*, 4th ed., fig. 4.1; breadths from ANSUR II male means (Gordon et al.
2014, [NATICK/TR-15/007](https://apps.dtic.mil/sti/citations/ADA611869), data at the
[Penn State OPEN Design Lab](https://www.openlab.psu.edu/ansur2/)).

| Measure | Source | Sourced (m) | Built (m) | Checked by |
|---|---|---|---|---|
| Stature | brief | 1.780 | 1.780 | `real.height`, test ± 2 % |
| Head count | canon 7.5 | 7.5 | 7.15 (neck joint → crown 0.249 m, hair included) | read here |
| Knee joint height | 0.285 H | 0.507 | 0.498 (0.280 H) | `LANDMARKS` check ± 8 % |
| Shoulder joint height | acromion 0.818 H; joint centre ≈ 0.80 H | 1.424 | 1.402 (0.788 H) | `LANDMARKS` check ± 5 % |
| Shoulder joints apart | biacromial breadth 0.415 | 0.415 | 0.411 | read here |
| Shoulder → fingertip | 0.186 H + 0.146 H + 0.108 H = 0.44 H | 0.783 | 0.744 (−5 %) | read here |
| Hip joint height | greater trochanter 0.530 H | 0.943 | 0.872 (0.490 H) | read here: 7 cm low |
| Ankle joint height | 0.039 H + a 3 cm boot heel | 0.099 | 0.141 | read here: 4 cm high |
| Foot (boot) length | 0.152 H = 0.271, + boot | ≈ 0.30 | 0.294 | read here |

`real.width` 1.02 m and `real.length` 0.36 m are the box of THIS a-pose, measured on the build, not
anatomy: the arms hang 26.5° out from vertical, so sourced segments would give 0.415 + 2 × 0.783 ×
sin 26.5° = 1.11 m; the model is 8 % narrower (arms 5 % short, elbows bent forward). The rig
service places hip and ankle joints by its own template, not on the anatomical landmarks: the two
"read here" rows above are honest misses and are not gated.

Mass: body 75 kg (BMI 23.7 at 1.78 m) + 6 kg of clothing (leather jerkin ≈ 2.5 kg, boots ≈ 2 kg,
belts, bracers, trousers) = 81 kg. The closed mesh encloses 0.112 m³ (loose clothes count as
solid), so the part's density is derived: 726 kg/m³.

## The chain

| # | Request | Model | Output | Kept |
|---|---|---|---|---|
| 1 | `image`: `CONCEPT` (concept.ts), seed 42, 1024² | `z-image` (Z-Image-Turbo, Apache-2.0), local GPU | PNG, 0.94 MB | committed |
| 2 | `mesh`: `SURFACE` (surface.ts) on that PNG: a-pose, ≤ 300 k triangles, 2K PBR texture | `meshy-7.1` (Meshy image-to-3D, hosted, paid) | GLB, 279k triangles, 20.4 MB | local |
| 3 | `rig`: `RIG` on that mesh: height 1.78 m, clips `Idle`, `Casual Walk`, `Run 2` | `meshy-rigging` (hosted, paid) | the mesh skinned to 24 bones + 3 clips at 30 fps, 26.7 MB | local |
| 4 | `blender`: `STEPS` (steps.ts) on the rigged GLB | Blender 5.3.0 headless, RTX 3090 OptiX bake | game GLB: 29,998 / 9,998 / 3.9k triangles, albedo 2048², normal and ORM 1024², one skin, 3 clips, 10.39 MB | committed |
| 5 | `importModel` → `defineModelCharacter` (kinds: `riggedChain`, `riggedBody`) | TypeScript, at build | one skinned textured part per LOD, 22 bones, clips `idle`, `walk`, `jog` | — |

Local outputs (`keep: 'local'`) stay on the machine that made them; `record.json` commits their
sha256, so a fresh clone resolves the chain from the committed Blender output. Committed bytes:
11.33 MB of the 12 MB per-recipe cap (delete the superseded Blender key before a re-run: two do not fit).

Blender program: `clean` → `retopo` 30,000 (closed shell, default 5.5 mm voxel; focus on the head
× 4 and hands × 5; it was 39,000 / 11,800, over the playbook's model-tier band of 30,000 / 10,000) → `uv` smart (532 islands) → `bake` albedo, normal, AO, roughness (cage 12 mm,
max ray 30 mm; hit rate 0.995, nothing unfilled) → `bind from: 'source'` (weights transferred, no
vertex unweighted) → `script` (the wear and the roughness contrast painted into the maps, below)
→ `lods` → `export`.

## Paint and wear (`wear.ts`)

One `script` step after the bind, run by [_lib/creature/texture-paint.ts](../_lib/creature/texture-paint.ts): the
shell's triangles are rasterised in UV space, so every texel knows where it stands on the figure.
Masks are height bands and balls in metres, materials are told by colour (the jerkin is the only
green, belts and boots the only saturated brown), edges are broken by seeded noise. A textured part
takes no `paint`, `finish` or grime pass (ADR 016), so the wear is in the maps, and all three LODs
sample the same maps.

| Pass | What |
|---|---|
| Roughness | wool trousers held at ≥ 0.93; boot leather waxed, 0.36–0.55 (the model's map had them alike) |
| Mud | wet and dark on the soles and welts (roughness 0.5), a paler cracked crust to mid-boot (0.97), fine splashes to the knee |
| Dust | the trouser legs above the boots and the jerkin's hem |
| Straps | belt and baldric scuffed pale along their length |
| Jerkin | leather rubbed matt on the elbows and the shoulder capes |

What code does to the import (the library: `importModel`, kinds `defineModelCharacter`):

- Fit to 1.78 m, feet on z = 0, +X front.
- `Casual_Walk` (4.1667 s) and `Run_02` (0.7 s) arrive one frame short of their period: the last
  key is one frame before the first. `importModel` recognises the cycle and appends key 0 one
  frame later (4.2 s, 0.7333 s), which closes the loop with no blending; it says so in
  `ImportedModel.warnings`. `Idle` (4.0 s) already closes.
- `head_end` and `headfront` (leaf bones no clip moves; `headfront` sits in front of the chin,
  outside the mesh) fold into their parent: 24 → 22 bones, exact, since they never move.
- Clip names: `idle`, `walk`, `jog`. `run` is reserved for part motions (ADR 013); "Run 2" is 164
  steps per minute, an easy run, so `jog`.
- `idle` is raised 6 mm (`LIFT`, ranger.ts): see QA below.

## Cost and time (run of 2026-11-16)

Meshy is a hosted, paid service: credits per request, no seed (a re-run is a new sample), files
kept 3 days on their side.

| Stage | Credits | Wall time |
|---|---|---|
| concept image (local GPU, model load included) | 0 | 1 min 36 s |
| image-to-3D (2K PBR texture) | 30 | ≈ 2 min 30 s |
| rigging (5) + three library clips (3 × 3) | 14 | ≈ 4 min |
| Blender steps | 0 | ≈ 1 min 20 s (bake 34 s) |
| **Total** | **44** (balance 2,926 → 2,882) | 7 min 41 s for stages 2–4 in one `t3d neural run` |

One free Blender re-run tried a 3.5 mm shell voxel to separate the fingers: no visible gain, 0.44 MB
more, not kept.

## QA

`t3d build` passes every gate on the three LODs (skin, deform, gait, model, mass, proportions,
budgets). Declared rather than silent:

- **Crease `model_surface`** over the whole part (declared by `defineModelCharacter`): QA
  `connections` looks for two code forms pushed together without a blend; cloth folds, belts and
  hair on a model surface are its relief.
- **`idle` lifted 6 mm.** QA `gait` poses the skin of each foot through every in-place clip. As
  the rig service returned it, `idle` (a wide staggered stance) put the left toe cap 5.8 mm and
  the right 3.1 mm under the floor (limit 3 mm). The clip's root is raised 6 mm, so its lowest sole
  vertex rests on z = 0. `walk` and `jog` needed nothing: their lowest sole vertex is 3.3 mm and
  0.4 mm above the floor.

The concept image now passes the input-image rules as it is: the `cropped` rule used to fire on
the studio floor's darker band, which reaches the frame edge; it reads only a subject cut by the
frame (the committed `record.json` of the mesh request still records the override it needed then).

Not gated, known: these clips are in place, and foot slide is only read on clips whose root
travels. In `walk` a planted boot rides 6–10 mm above the floor (the library clip retargeted to
these legs) and, measured against a root travelling at the stride speed, slides up to 24 mm per
frame. The toe bones' tips drop 14–27 mm below their rest height at toe-off (rigid toes); the skin
stays above the floor.

## Honest state

Read on `out/ranger/hero.png`, `sheet.png` and the review pack's pose strip:

- Reads as a game character at hero distance: face, beard, leather sheen, stitching and buckles hold.
  Far better than the block figures in `recipes/rts_soldier`.
- Hands are clean (no bake speckles) but the fingers are a closed paddle: no finger bones (the rig
  has one hand bone), no gaps between fingers.
- Hair is sculpted clumps, not cards. Eyes are painted, not separate parts: no blink, no jaw.
- The jerkin's albedo has soft camouflage-like blotches the image model invented.
- The skirt of the jerkin is skinned to the thighs: it stretches with a high knee (visible in
  `jog`), no cloth simulation.
- `idle` is the library's "Idle": a wide, staggered stance that turns the torso to look around,
  not a neutral stand.
- Rest pose is the a-pose; an engine should play `idle` by default.

## CPU tier

No `neural/` (or a changed request that was not re-run): `mannequin.ts` builds one grey SDF
surface of capsules in the same a-pose and box, 1.78 m, 81 kg. No face, no costume, no skeleton,
no clips. It keeps the asset buildable everywhere; it is not the ranger.

## Re-roll

1. Adapters in a local, uncommitted `t3d.config.ts` (see `t3d.config.example.ts`): `image` →
   `http(url, 'z-image')`; `mesh` and `rig` → ONE `meshyAdapter({ apiKey: process.env.MESHY_API_KEY })`;
   `blender` → `blenderAdapter()`. Never commit the key.
2. Concept only first: leave `mesh` / `rig` unbound, run `t3d neural run recipes/ranger/ranger.ts`,
   READ the PNG. A new seed or prompt changes every key after it.
3. Bind Meshy and run again. The run prints the balance and an estimate per request (30 + 14) and
   refuses above 50 credits without `--yes-spend`. After a failed POST do not retry by hand: the
   adapter resumes from its pending file (docs/research/meshy.md §1).
4. Blender only (free): edit `steps.ts`, run again; look with
   `t3d blender review recipes/ranger/ranger.ts --out <dir> --pose LeftArm:z:50` (set the rig key
   directory in `BLENDER_REVIEW`, ranger.ts). The focus balls in `steps.ts` are where THIS sample's
   head and hands are.
5. Delete the replaced `neural/<key>/` directories (the cap counts all committed bytes), then
   `t3d build`, `bun run shots ranger`, `bun test recipes/ranger`, and update the numbers above.

## Library gaps met here

Closed by plan 2026/11/16/101 slice 16: rigged models no longer need a `CreatureSpec`
(`defineModelCharacter`), the `cropped` input rule, clip loop closing at import, and a sink check
for in-place clips. Still open: the Blender review's "rest" tile shows the active clip's pose.

## Parts the engine needs

`clothed_body` (skinned, texture set, one draw) on bones `hips`, `spine02`, `spine01`, `spine`,
`neck`, `head`, `left_/right_` `shoulder`, `arm`, `fore_arm`, `hand`, `up_leg`, `leg`, `foot`,
`toe_base`. Clips `idle` 4.0 s, `walk` 4.2 s, `jog` 0.733 s, all looping, in place.
