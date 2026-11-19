---
name: creature-artist
description: A creature artist's workflow for ts23d — animals and original fantasy creatures (dragons, wyverns, beasts, insects, elementals) designed from real anatomy. Function-first design, borrowed-animal dossier, stance (plantigrade/digitigrade/unguligrade), weight support and centre of mass, skeleton-then-flesh sculpting, scales/fur/skin surfaces. Use when building or reviewing any animal, monster, beast or creature recipe, or `sculpt`/`visualHull` for a non-human body.
---

# Creature artist

Use with the [author-recipe loop](../author-recipe/SKILL.md), the
[characters & creatures playbook](../../../docs/playbooks/characters/characters-creatures.md) and the
flagship dossier [`recipes/dragon`](../../../recipes/dragon/README.md). Definitions:
[16-art-as-text](../../../docs/idea/16-art-as-text.md). Surfaces:
[surfaces-volumes](../../../docs/research/surfaces-volumes.md), [hair](../../../docs/research/hair.md).
Biology: [animal-anatomy](../../../docs/research/animal-anatomy.md) (measurable rules with sources)
and [animal-species-sheets](../../../docs/research/animal-species-sheets.md) (12 species' numbers).
Original designs only; never a named creature from any IP.

## When
- Any animal, beast, monster, insectoid, serpent, winged or elemental creature.
- A body that is not four legs and a head (fish, shark, octopus, snake, many-necked beast): start from [Bodies built from chains](#bodies-built-from-chains).
- A humanoid that departs from human proportions far enough that animal anatomy rules (a
  digitigrade-legged brute, a hybrid). Pure humanoids: [character-artist](../character-artist/SKILL.md).

## Model-first path (As of 2026-11; the default for realistic animals and beasts)
Code-sculpted organics did not read as animals (owner review 2026-11-16: trains and tanks pass, wolf, bear,
dragon did not). The surface now comes from an image-to-3D model, finished by Blender steps you write in
the recipe; code keeps scale, skeleton, clips, LOD budgets and QA. The code creature stays as the CPU
fallback and the source of the skeleton plan and gait clips. Playbook:
[characters-creatures](../../../docs/playbooks/characters/characters-creatures.md#model-tier-creature).

**1. Concept image (the one input that decides everything).** Rules, checked by `t3d neural run` before
anything is sent (`T3D_NEURAL_INPUT`; override only with `--allow-bad-input`):
| Rule | Why |
|---|---|
| Quadruped: exact side profile, head straight (no turn, no 3/4), legs apart, tail clear of the legs | Image-to-3D invents the far side; mirrored halves and a turned head gave a two-headed wolf |
| Flat, even light, plain light-grey background, no shadows or rim light | Baked lighting ends up in the albedo (de-lighting is not shipped) |
| One animal, fills >= 60 % of the frame, not cut by the frame, >= 512 px, sharp | Input-image rules `background`, `subjects`, `fill`, `cropped`, `resolution`, `sharpness` |
| Bind only the `image` task first, run, READ the PNG, re-roll the seed | Mesh and rig calls are slow or paid; every key after the image changes with it |

**2. The chain** (kinds `modelChain` + `defineModelCreature`, `/kinds`): image -> mesh (`keep: 'local'`, 70-100 MB,
never committed) -> Blender proxy pass (~6 000 triangles, committed) -> optional `rig: 'unirig'` (joints) ->
TS fit (`modelFit`, `fitSkeleton`: yaw, scale, joints inside the mesh) -> Blender final pass (your steps, built
FROM the fit) -> `importModel` -> one textured part per LOD. Any cache miss builds the code creature.
```sh
bun run t3d neural run recipes/<name>/<name>.ts     # fills neural/<key>/; up to 5 rounds; GPU or Blender jobs one at a time
```

**3. Step vocabulary** (the artist trick behind each op; fields and gates: [examples/blender/README.md](../../../examples/blender/README.md)):
| Op | Artist trick | Use it when |
|---|---|---|
| `clean` | merge by distance, drop floaters and loose bits, fill holes | always first |
| `retopo` (shell, default) | voxel-remesh to ONE solid surface, reduce that, let the normal map bring the fur back; never collapse the noisy scan | always; fails with the measures when no radius closes the crust |
| `retopo.focus` | spend vertices where the eye goes: `{ at, r, weight }` balls on face and paws | head x3-4, paws x2-3 (take the points from `rig.bones`) |
| `unweb` | cut geometry that bridges limbs separate in the animal (tail fused to hocks), cap each side, push apart | before `retopo`; keep its voxel under `gap / 1.5` |
| `amputate` + `symmetrize` | delete the bad half (far legs of a profile model) and mirror the good one | profile concepts; side from `rig.side` |
| `repose` | pose the bound armature to a straight, symmetric rest and keep the deformed mesh, instead of mirroring a turned head | after `bind`; a bone may turn at most `REPOSE_LIMIT` degrees, else it is another pose: re-roll |
| `uv` | seams where hidden; Smart UV with a wide angle (about 83 deg) on noisy fur | after `retopo`, before `bake` |
| `bake` | detail into the normal map; albedo baked as EMIT (a DIFFUSE bake of a metallic source is black); AO into ORM | 2048 albedo; check `hitRate` >= 0.98, `albedoUnfilled` < 2 % |
| `bind` | bone-heat weights; falls back to a voxel proxy + weight transfer, reported | after the fit; `weights` fixes by mask, `joint` moves a bone end before it |
| `displace`, `inflate`, `smooth` | the sculptor's global filters, by mask | fix a thin neck or a lumpy flank without leaving code |
| `skinBody`, `metaballs` | block-out from an edge skeleton or blobs (first step, no input mesh) | no GPU and no key: a Blender-only body |
| `script` | inline bpy for what no op does; `why` is required, the report keeps its hash | last resort |
| `lods` | gated decimate that keeps UVs, weights, material | `[lod1, lod2]` triangles |

**4. Look, adjust, look.**
```sh
bun run t3d blender review recipes/<name>/<name>.ts --out review --views clay,wire,weights,poses,turnaround
```
READ `review/*.png` and `review.md` (the module exports `BLENDER_REVIEW = { mesh, steps, skeleton? }`; needs
Blender, never cached, never in a build). Clay = form, wire = topology (loops at joints), weights = one tile
per bone (blue 0 -> red 1, grey none), poses = `--pose neck:x:-30` shows the deformation. Fix by editing the
recipe: `weights` (assign / scale / smooth one bone in a mask), `joint`, `script`; re-run; compare; stop when
the next sheet shows no change you care about.

**5. QA gates and what a finding means.**
| Code | Means | Fix |
|---|---|---|
| `T3D_MODEL_FIT` | mesh not registered to the skeleton (wrong yaw/scale), or a foot's skin ends > 1 cm off z = 0 | `modelFit` first; re-roll a concept with a raised paw |
| `T3D_MODEL_SKELETON` | a joint lies outside the mesh, or a fitted leg bone stretched | correct the plan's limbs to the model's, or re-roll |
| `T3D_MODEL_TEXTURE` | albedo blank under the UVs | re-bake: `uv` before `bake`, EMIT albedo, hit rate |
| `T3D_MODEL_DOUBLED` | two muzzles or a leftover far-side leg | `repose` instead of mirroring; drop `symmetric`; `amputate`; re-roll |
| `T3D_QA_GAIT` (in-place) | a foot's skin dips > 3 mm under the floor in a clip | raise the clip root by the stated amount, or fix the stance |
| `skin`, `deform` | weights tear at a joint limit | `weights` by mask, narrower clip limits, `drop: ['gallop']` |

**6. Budgets and costs.** Budget: `triangles` about 30 000 / 10 000 / 2 500-6 000 for a quadruped,
`textureSets { count: 1, size: 2048 }` (albedo 2048, normal and ORM 1024), committed neural cache <= 12 MB per
recipe (`bun run verify --only recipes`), `draws` one per skinned part.
| Stage | Measured (2026-11-16, RTX 3090) |
|---|---|
| Concept, `z-image` 1024 | 39-97 s (warm / cold) |
| Mesh, `pixal3d` | 165-187 s, 18.5 GB VRAM; `trellis2` 264 s, 23 GB |
| Rig, `unirig` | about 60 s, 27 bones on a bear |
| Blender steps | 52-138 s per model (bake 14-41 s) |
| Hosted option, Meshy (paid) | image-to-3D 30 credits; rig 5 + 3 per library clip ([meshy.md](../../../docs/research/meshy.md)); `--yes-spend` above 50 |
Sources: [examples/neural-server/README.md](../../../examples/neural-server/README.md), [examples/blender/README.md](../../../examples/blender/README.md).

**7. Honest limits (state them in the recipe README).** The model head is fused: no jaw, no blink (`bite` and
`blink` are dropped). Fingers and toes are paddles. Fur is sculpted clumps in the normal map, not cards.
Albedo keeps the generator's baked light. A gallop can exceed what the skin takes: drop it and let QA `deform`
judge. Outputs are not bit-identical between GPU runs: the committed output is the input to the build. As of
2026-11 the quadruped example is [`recipes/wolf_hybrid`](../../../recipes/wolf_hybrid/README.md) (read its steps table), and
[`recipes/bear_hybrid`](../../../recipes/bear_hybrid/README.md) for a heavy plantigrade build (`nose: true`, wrist weights); [`recipes/dragon_hybrid`](../../../recipes/dragon_hybrid/README.md) for an invented winged body the plan cannot describe (`register: 'joints'`, `take` with `'tail'`, wings as `extra` bone chains with a `flap` clip: `wings.ts`); the humanoid example is [`recipes/ranger`](../../../recipes/ranger/README.md).

## Bodies built from chains
For bodies the creature kind cannot describe, write a `defineBodyPlan` spec: a trunk chain plus child chains, `repeat: { kind: 'mirror' }` for paired fins and `{ kind: 'radial', count: 8, ... }` for arms. Declare `medium: 'water'` for swimmers. Motion comes from sourced numbers, not by eye ([research](../../../docs/research/swim-and-tentacle-animation.md)).

| Body | Clips | The check that matters |
|---|---|---|
| Shark, tuna, trout, eel | `swimClips(plan, { chain: 'spine', preset })` | QA `swim`: Strouhal 0.20 to 0.40, stride 0.40 to 0.80, slip 0.50 to 0.90, tail 0.13 to 0.24 L, wave runs head to tail |
| Snake | `snakeClips(plan, { chain: 'spine' })` | no sliding on `slither`; `sidewind` still misses its foot-lock target, so do not ship it |
| Many necks | `hydraClips(plan, { necks, heads, seed })` | QA `chain-cross`: necks never pass through each other |
| Octopus | `octopusClips(plan, { arms, seed, mantle })` | `chain-cross`, and `T3D_DEFORM_TWIST`: at most 45.6 degrees of twist per joint |

Speed comes from tail-beat frequency, never from a bigger swing. A shark's upper jaw moves forward while the mouth closes.

## Workflow (code route: stylised creatures, the CPU fallback)
| # | Creature-design stage | ts23d | Exit |
|---|---|---|---|
| 1 | Purpose first: what it eats, how it moves, where it lives, how it fights (Whitlatch: purpose before form) | dossier "design intent" section | one sentence of function per body part |
| 2 | Borrowed anatomy: each part maps to a real animal (wing from bat, neck from heron, hind leg from big cat) with measurements | dossier "reasoning" table; start from [animal-species-sheets](../../../docs/research/animal-species-sheets.md) (shoulder height, body length, mass) | every borrowed part sourced |
| 3 | Skeleton and stance | joint positions as `Vec3` constants; `ctx.group` per bone pivot; stance chosen | side view skeleton drawn as SVG |
| 4 | Silhouette from drawings | `visualHull({ front, side, top })` spread into a `sculpt` edit | side silhouette names the creature |
| 5 | Bones: ribcage (deep, narrow superellipsoid), loin, pelvis, limb chains, neck of oval section, tail; the skeleton as an Armature | `sculpt` edits (`superellipsoid`, `ellipsoid`, `roundCone`), tight blends 0.15–0.3 × radius, `kernel: 'cubic'`; `ctx.bone` (the `creature` kind declares spine_*, neck_*, head, jaw, tail_*, fore/hind_l/r_*) | chest swell ≤ 6 %, canid depth ÷ width ≥ 1.25; `assertCentreOfMassInside`, `assertUprightOnGround` PASS |
| 6 | Muscles: 15–25 fibre-aligned bellies origin → insertion, seated on the bones; bony landmarks (scapula, withers, elbow, ischium); separations as `crease` strokes; the neck growing into the skull behind the jaw; jaw its own part | `creature-muscle-map.ts` / your own `FibreMuscle` list, `stroke: 'crease'`, `detail` boxes on face and paws | raking light shows landmarks; QA `connections` finds no seam |
| 7 | Surface: scales, plates, fur, skin folds | `CREATURE_MATERIALS` strips (`dragon_scales`, `reptile_scales`, `fur`, `hair`), `tex.scales`, `tex.strands` | scale size grades dorsal → ventral |
| 8 | Wear and story: scars, chipped horns, dust on belly | `grime({ ground })`, edits | tells where it lives |
| 9 | Present and critique | `t3d shot / hero / blueprint / critique` | every score ≥ 8 |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Plantigrade | heel on the ground (bear, human); short foot, stable | foot sole touches ground: `touches('foot_*', …)` / floating-parts |
| Digitigrade | walks on toes, heel raised (cat, dog, bird); hock visible above ground | hock ≈ 0.25–0.3 H, carpus ≈ 0.13 H (kind defaults; [animal-anatomy §2](../../../docs/research/animal-anatomy.md#2-stance-and-limb-segments)) |
| Unguligrade | on hoof tips (horse, deer); long metapodials | hoof is the only contact; artiodactyls stand on **two** hoofed digits + dewclaws |
| Orbit convergence | angle of the orbit rim plane to the midline: cat 65°, dog 50°, horse 24° (Heesy 2004) | lid aperture faces 90° − convergence off +X; shipped in the `creature` kind (`family` / `face.orbit`); no QA check yet |
| Fore share | fraction of standing weight on the forelimbs: dog 0.60, horse 0.57–0.60 | from CoM and feet x; shipped: `foreShareCheck` runs on every `defineCreature` quadruped (finding prefix `fore share:`) |
| Duty factor | fraction of a stride a foot is down; > 0.5 walk, < 0.5 run (Hildebrand) | baked clips **planned**; walk order LH → LF → RH → RF |
| Support polygon | convex hull of ground contacts; the CoM must project inside it | `assertCentreOfMassInside`, `assertUprightOnGround` |
| Allometry | limb cross-section grows faster than length as mass grows; a giant needs columnar legs | `T3D_ALLOMETRY` **planned**; size limbs by hand, record in dossier |
| Mass | volume × density ≈ real animal mass | `real.mass` + `physics` → QA `mass` (±15 %) |
| Wing loading | mass ÷ wing area; flyers need plausible area | **planned**; compute in a test with `ruler` |
| Line of action | one dominant curve through spine and neck | judge on side view of `sheet.png` |
| Shape language | aggressive = acute angles + taper; friendly = rounds | **planned** metric; state intent in dossier |
| Silhouette reads | LOD2 IoU ≥ 0.85 vs LOD0 | `assertLodSilhouette(asset, 0.85)` |

## Quality bar
- [ ] Dossier names the real animal behind every part, with measurements.
- [ ] Stands: CoM inside the support polygon; every foot touches the ground at LOD0–2.
- [ ] Joints sit at real pivots (knee forward, hock backward on digitigrade hind legs); elbow at the
      brisket ± 5 % H.
- [ ] Dimensions match the species sheet or the dossier's own sources; disagreements written down.
- [ ] Eyes face the family's orbit angle; pupil shape fits the ecology (slit: small ambush
      predator; horizontal: grazer; round: pursuit predator).
- [ ] Feet fit the family: digit count, cloven hoof + dewclaws on artiodactyls, 5 toes on bears.
- [ ] Centre of mass gives a plausible fore share (quadruped mammals ≈ 0.55–0.65).
- [ ] Limb thickness scales with mass; a 4 t creature has no deer legs.
- [ ] Head, horns, wings attach with `ctx.joint` (`flush` or `socket`), `joints` PASS.
- [ ] Surface detail sized to the body: scales grade, fur parts by flow, rest areas on the flank.
- [ ] Symmetric base (`mirror: 'y'`, `symmetric('_l', '_r')`) plus deliberate asymmetry at LOD0.
- [ ] LOD2 keeps outline and big colour blocks; budget met.

## Common mistakes
- Bolting parts of many animals together with no functional reason: reads as a collage.
- Knees bending the wrong way on a digitigrade hind leg (the hock is the ankle, not a knee).
- Prey animals with forward-facing eyes; a single hoof on a cow or deer; the generic default tail
  (0.37 L) left on a short-tailed species: set `family` or `tail`.
- Wings too small to lift the body; necks too thin to hold the head.
- Uniform scale size everywhere; no gradient, no rest area.
- Floating claws/teeth: they must sink into gum or toe (`touches`).
- Using a famous creature's silhouette or colour scheme.

## Test it
```ts
import { assertCentreOfMassInside, assertLodSilhouette, assertUprightOnGround } from '@developerz.ai/ts23d/testing';
it('does not tip over', () => assertUprightOnGround(wyvern));
it('centre of mass over the feet', () => assertCentreOfMassInside(wyvern));
it('LOD2 keeps the outline', () => assertLodSilhouette(wyvern, 0.85));
```

## Run order
```sh
bun run t3d neural run recipes/<name>/<name>.ts             # model tier only: fill the cache
bun run t3d blender review recipes/<name>/<name>.ts --out review  # model tier only: READ the PNGs
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun test recipes/<name>/            # stability + silhouette tests
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [character-artist](../character-artist/SKILL.md): humanoid heads and faces.
- [concept-artist](../concept-artist/SKILL.md): purpose, silhouette options.
- [material-artist](../material-artist/SKILL.md): scales, fur, skin strips.
- [rigger-animator](../rigger-animator/SKILL.md): pivots at real joints.
- [blender-artist](../blender-artist/SKILL.md): finishing a generated body in one open Blender.
- [art-director](../art-director/SKILL.md): bestiary consistency.

## Tool status
Shipped: `sculpt`, `sculptField`, `visualHull`, `sd.*`, `loft`/`ringXY`, `sweep`, creature strips
(`fur_neutral` for tinted coats), `tex.scales`/`tex.strands`, stability helpers, `real.mass` + QA
`mass`, `ctx.joint`, QA `connections`, the `creature` kind (`creature()` / `defineCreature`: six
skeleton types, staged sculpt, patterns, allometry and wing-loading checks — `recipes/wolf`).
Shipped too: the kind's Armature (`ctx.bone`), a `jaw` part, fibre muscles (`build.muscle`).
Planned (M4, [roadmap](../../../docs/plans/roadmap.md#m4-creatures)): tail and limbs as moving
parts, `pose`/`warp`/`ffd`, fur shells and cards, skins and morph targets.
Model tier shipped (As of 2026-11): textured parts (ADR 016), the `blender` step task, `importModel`, `modelChain` / `defineModelCreature`, QA `model`. Bones the plan lacks (wings, fins, a second tail) are `extra` chains on `modelChain` (joints along the mesh, limits with a source, a `motion` clip). Planned: gallop, jaw and blink on a model body, finger bones.
Neutral positioning: the free code-based option, no claims against other tools.
