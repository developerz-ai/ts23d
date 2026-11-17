# Characters and creatures playbook

Humanoid busts and full bodies — human, orc, goblin, dwarf, elf — animals and fantasy
creatures. Status: busts ship today via the `head` kind builder; full-body humans ship on the model tier ([`ranger`](../../../recipes/ranger/README.md)); whole-body animals ship via the
`creature` kind ([`wolf`](../../../recipes/wolf/README.md)); bones as named parts, poses and fur
cards are **planned for M4** ([roadmap](../../plans/roadmap.md#m4-creatures)). Reference recipes:
[`human_head`](../../../recipes/human_head/README.md), [`orc_head`](../../../recipes/orc_head/README.md),
[`goblin_head`](../../../recipes/goblin_head/README.md), and the flagship design dossier
[`dragon`](../../../recipes/dragon/README.md). Original designs only — no characters, names or
designs from any game, film or book. **Scale from head height** (the artist's unit) and real
animal measurements for creatures.

**Two routes (As of 2026-11).** Stylised busts, creatures and fantasy beasts: code (`head`, `sculpt`,
`creature()`; sections above). Realistic animals and full-body humans: the **model tier**, because a body
sculpted from code primitives did not read as an animal or a person (owner review 2026-11-16). Model-tier
sections below; skills [creature-artist](../../../.claude/skills/creature-artist/SKILL.md) and
[character-artist](../../../.claude/skills/character-artist/SKILL.md); step reference
[examples/blender/README.md](../../../examples/blender/README.md).

## Research
Anthropometric data (ISO 7250-1 body measurements; national surveys such as ANSUR II for adult
ranges), anatomy references for artists (planes of the head, skeletal landmarks), zoological data
for animals (shoulder height, body length, mass), and for fantasy creatures a **design dossier**
built from real animals: which real animal each body part borrows from and why (see the dragon
dossier's reasoning column). Photos / drawings: front, side, 3/4 and top of the head; for
creatures, side and front skeletal diagrams.

Animals have their own research layer, the counterpart of [head-analysis](../../research/head-analysis.md):
[animal-anatomy](../../research/animal-anatomy.md) (landmarks, stance and limb segments, head and
eye rules, weight support, muscle masses, joint ranges, gaits, fur / feather / scale facts, each a
number with a source) and [animal-species-sheets](../../research/animal-species-sheets.md) (wolf,
dog, tiger, lion, cat, horse, cow, deer, bear, boar, eagle, crocodile).

| Proportion (adult human, typical) | Value | Notes |
|---|---|---|
| stature | 1.55–1.85 m (means ≈ 1.63 F / 1.76 M, varies by population) | ISO 7250 / ANSUR II |
| heads per height | 7–7.5 (realistic), 8 (heroic), 3–5 (stylised/chibi) | |
| head height (chin–crown) | 0.22–0.24 m | |
| head width | 0.14–0.16 m | |
| eye line | at the vertical middle of the head | |
| eye spacing | one eye width between the eyes; interpupillary 0.058–0.068 m | |
| nose base / mouth / chin | thirds of the lower face | |
| ear | from brow line to nose base | |
| shoulder width | ≈ 2 head heights (M), 1.75 (F) | |
| arm span ≈ stature; elbow at the waist; wrist at the crotch | | |
| hand length ≈ face height | 0.17–0.2 m | |

| Animal (typical adult) | Shoulder height | Body length (nose–rump) | Mass |
|---|---|---|---|
| grey wolf | 0.80–0.85 m | 1.05–1.60 m (+ tail 0.29–0.50) | mean 36–38.5 kg |
| domestic dog (Labrador-size) | 0.55–0.62 | 0.9–1.0 | 25–36 kg |
| horse (light riding) | 1.42–1.63 | ≈ 2.4 | 380–550 kg |
| chicken | 0.25–0.35 (back) | 0.4 | 2–3 kg |
| golden eagle | wingspan 1.80–2.34 m | 0.66–1.02 | ♂ 3.6 / ♀ 5.1 mean |

More species, with sources and derived ratios: [animal-species-sheets](../../research/animal-species-sheets.md).

Fantasy races in this repo are stylised from human anatomy: orc (heavy brow, wide jaw, tusks,
neck as wide as the head), goblin (big head ratio, long ears and nose, small jaw), dwarf (≈ 4
heads tall, broad), elf (long face, high cheekbones, pointed ears) — encoded as data in `HEADS`
and validated by `checkHead`.

## Part tree
```
bust (today, `head` kind): bust (on z = 0), head, jaw (pivot at the hinge; sway), eye_l / eye_r
                           (pivots at eyeball centres, looking +X)
creature (shipped, `creature` kind): parts body, head (pivot at the atlas), jaw (child of head,
     pivot at the hinge; LOD0/1), eye_l / eye_r, claws; an Armature via ctx.bone — spine_* (sacrum →
     withers), neck_*, head, jaw, tail_*, fore_l_* / fore_r_*, hind_l_* / hind_r_*, wing_l_* / wing_r_*
humanoid body (planned): upper_arm_l → forearm_l → hand_l → finger_*; thigh_l → shin_l → foot_l
sockets: attach 'hand_r' (weapons via ctx.use), camera 'eyes', audio 'voice'
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| jaw | sway | Y at hinge | 0–25° open (`jawSway`) |
| eyes | sway | Z / Y at eyeball centre | ±30° / ±20° |
| head (bust turn) | sway | Z at neck | ±60° |
| wings / tail (creatures) | sway | per bone | design-specific; bake an idle |

Full skinned animation is the engine's job; the asset ships the pose, bones and pivots.

## Signature details
1. Planes before features: brow ridge, cheekbones, jaw angle, the box of the skull.
2. Asymmetry: 1–3 % left/right variation, seeded — perfect symmetry reads as a mannequin.
3. Eyes set into sockets with lids that wrap the eyeball; never stuck on the surface.
4. Ears attached at the jaw hinge line, angled back ~15°.
5. Neck from behind the ears, trapezius sloping to the shoulders.
6. Skin tone variation: redder at nose, ears, cheeks; darker in creases (`bakeAo`).
7. Creatures: the borrowed animal anatomy is consistent (a wing is a bat hand or a bird arm, not both).
8. Silhouette at LOD2 must still name the race/species (ears, tusks, horns, tail).

### Quadruped muscle list (creature kind, `creature-muscle-map.ts`)
Bones first, muscles over them, tight blends (0.25 × width, C2, ≥ 2.5 % of the height so no
valley reads as glued blobs), each seated so `rise` × its thickness shows above the masses:
- bones: ribcage (superellipsoid n 2.2, deep and narrow), loin, pelvis block; scapula, withers
  (T1–T9 spines, the highest point of the back), ischial tuberosity, manubrium
- forequarter: supraspinatus, infraspinatus, triceps long head (caudal border = a crease),
  trapezius, latissimus dorsi, serratus ventralis, brachiocephalicus, splenius, superficial and
  deep pectorals; the legs carry deltoid, triceps, forearm extensors/flexors, small elbow and
  carpal points
- hindquarter: middle gluteal, tensor fasciae latae, biceps femoris, semitendinosus (their seam
  a crease); the legs carry quadriceps, hamstrings, gastrocnemius → Achilles, small stifle/hock
- separations (LOD0 crease strokes): behind the triceps, biceps femoris | semitendinosus, the
  flank fold
- checks: chest swell ≤ 6 % over the declared ribcage width (no barrel), canid depth ÷ width ≥
  1.25, the neck → skull axis inside body ∪ head; `build.muscle` 0..1 scales the bellies

## Materials
Skin via vertex colour on `plain` or a custom skin material (`defineMaterial`), `leather` for
clothing and creature hide, `canvas` cloth, `iron_cast` / `steel_galvanised` / `brass` armour and
jewellery, `glass` eyes (cornea) over a coloured iris, `plastic` for teeth/tusk enamel (tinted
ivory), bone via `plain` tinted. Hair and fur: cards (`cutout`) — planned as LOD-gated in M4.

## LOD policy
- LOD0: SDF sculpt at high resolution, eyes with lids, teeth, ear folds, `bakeAo`. Bust 20–60k;
  creature 60–150k.
- LOD1: half resolution, teeth merged. 5–12k / 15–30k.
- LOD2: silhouette features only. 500–1,500 / 1,500–4,000.
Sculpt `resolution` is the LOD knob.

## QA
```ts
real: { length: 0.3, width: 0.45, height: 0.55, measures: [
  { label: 'head height', axis: 'z', value: 0.23, parts: ['head'] },
  { label: 'eye spacing', axis: 'y', value: 0.063, between: ['eye_l', 'eye_r'] },
]},
checks: [touches('head', 'bust'), symmetric('_l', '_r', 'y'), /* checkHead via kind */],
```
Creatures: declare shoulder height, head length and wing span from the design dossier as `measures`
so later sculpt edits cannot drift. Shipped for animals: the `creature` kind's allometry and
wing-loading refusals, QA `balance`, `fore share` and `mass`, and per-`family` defaults (eye
orbit, cloven hooves, digit counts with dewclaws, tail length). Checklist from
[animal-anatomy](../../research/animal-anatomy.md) (judge on `t3d shot` / `blueprint` or write a
recipe test; the items without a check above are **planned**, §9 there):
- [ ] stance matches the family; hock and carpus heights inside its band (§2);
- [ ] elbow at the brisket ± 5 % H; stifle forward, hock back (§1);
- [ ] cloven hooves (two digits + dewclaws) on cattle, deer and pigs; one hoof on horses (§2);
- [ ] eye apertures face the family's orbit angle: cat ≈ 25°, dog ≈ 40°, horse ≈ 65° off +X (§3);
- [ ] pupil shape fits the ecology: slit for small ambush predators, horizontal for grazers (§3);
- [ ] centre of mass gives the fore-limb share: dog ≈ 0.60, horse ≈ 0.58 (§4);
- [ ] baked walk follows LH → LF → RH → RF with duty factor > 0.5; joints inside their range (§6–7).

## Model tier: creature
Quadruped on a model surface, our sourced skeleton and gait clips (kinds `modelChain` + `defineModelCreature`).
Status (As of 2026-11): `recipes/wolf_hybrid` ships on it (QA PASS; idle, look, walk, trot); the
`recipes/brown_bear` and `recipes/dragon` model tiers are planned.

| Stage | What to do | Why / check |
|---|---|---|
| Research | Species sheet numbers ([animal-species-sheets](../../research/animal-species-sheets.md)) into the recipe's `CreatureSpec`; `real` + `sources` + `measures`; the model is registered to THESE numbers | `proportions` and `measures` gates |
| Concept | Exact side profile, head straight, legs apart, tail clear, flat light, plain grey; READ it before any mesh call | A turned head and an invented far side gave a two-headed wolf; baked light stays in the albedo |
| Mesh | `mesh` request on the concept sha256, `keep: 'local'`; `pixal3d` (165-187 s) or `trellis2` locally, Meshy hosted | raw outputs are 70-100 MB: never committed |
| Proxy + fit | Blender proxy (~6 000 triangles) committed; TS registers it (`modelFit`) and fits the plan's skeleton (`fitSkeleton`); `rig: 'unirig'` optional | joints inside the mesh; mesh hugs the bones |
| Steps | `clean` -> `unweb` (tail fused to hocks) -> `amputate` + `symmetrize` (profile models: keep the near half) -> `retopo` shell with `focus` on head and paws -> `uv` -> `bake` -> `bind` -> `repose` -> `lods` -> `export` | each op's trick: [creature-artist](../../../.claude/skills/creature-artist/SKILL.md) |
| Look | `t3d blender review recipes/<name>/<name>.ts --out review`: clay, wire, weights, poses | adjust, look again |
| Import | `importModel` -> ONE skinned textured part per LOD; `bite` and `blink` dropped | fused head: no jaw, no lids |
| QA | `model` (`T3D_MODEL_TEXTURE`, `T3D_MODEL_SKELETON`, `T3D_MODEL_FIT`, `T3D_MODEL_DOUBLED`), `skin`, `deform`, `gait` | `drop: ['gallop']` when the skin cannot take it |

Budget: triangles about 30 000 / 10 000 / 2 500-6 000; one texture set 2048 (albedo) with normal and ORM at
1024; committed cache <= 12 MB. No GPU and no key: the code creature builds (CPU tier), with the look of a code
sculpt, not a photographed animal. Measured Pixal3D wolf on Blender 5.3: 955 337 -> 29 994 triangles, 226 UV
islands, no open edge on any LOD, 52 s.

## Model tier: humanoid
Rigged human on a model surface (kinds `riggedChain` + `defineModelCharacter`). Shipped:
[`recipes/ranger`](../../../recipes/ranger/README.md) (As of 2026-11: QA PASS, 44 Meshy credits, 7 min 41 s,
11.09 MB committed).

| Stage | What to do | Why / check |
|---|---|---|
| Research | Stature, mass, segment shares (Drillis and Contini, ANSUR II) into `real` and a table of built versus sourced; say which rows the rig misses | the rig service places hip and ankle by its own template: honest misses, not gated |
| Concept | Front view, A-pose, empty hands, flat light, plain grey, original design | limbs clear of the torso for the rigger; no baked shadows |
| Mesh + rig | `mesh` (`pose: 'a-pose'`, <= 300 k triangles) then `rig` (`height`, library clips by name), both `keep: 'local'` | a hosted rig refuses over 380 000 triangles and non-humanoids (HTTP 422, not charged) |
| Steps | `clean` -> `retopo` shell (`focus` head x4, hands x3) -> `uv` -> `bake` -> `bind` `from: 'source'` -> `lods` -> `export` | the model's skin and clips are kept; no `transform` on a rigged source |
| Import | `importModel` closes a loop clip one frame short; `riggedBody` folds leaf bones no clip moves; clips renamed `idle`, `walk`, `jog` | `run` is reserved for part motions (ADR 013) |
| QA | `model`, `skin`, `deform`, `gait` (in-place: skin of a foot <= 3 mm under the floor; `lift` the root) | the ranger's `idle` is lifted 6 mm |

Honest limits (ranger): fingers are a closed paddle (no finger bones); hair is sculpted clumps; eyes painted,
no blink or jaw; a jerkin skirt skinned to the thighs stretches on a high knee; the albedo has invented
blotches. Planned: finger bones, jaw and blink, hair cards on a model head, AI motion with commercial-use
weights. No GPU and no key: `mannequin` fallback (grey, no face, bones or clips): buildable, not the character.

## Common mistakes
- Eyes too high (in the upper third) — the commonest beginner error.
- Neck a cylinder from under the chin; ears at the top of the head.
- Mirror-perfect faces; single flat skin colour.
- Fantasy creatures that borrow from a famous IP design.
- Prey animals with forward-facing eyes; one hoof on a cow or deer; a bear with four toes.
- The generic quadruped tail (0.37 L) left on a bear, deer or boar (real ≈ 0.05–0.1 L): set `family`.
- Realistic people or animals sculpted from code primitives: use the model tier above
  ([08](../../idea/08-neural-adapters.md) for the adapters).
- Model tier: a 3/4 or turned-head concept, a concept with cast shadows, mirroring a turned head instead of
  `repose`, collapsing the raw scan instead of the shell `retopo`, spending paid credits before reading the concept.

## Reuse
`head` kind builder (`race`, `params`, `jawSway`), `HEADS`, `checkHead`, `sculpt`, `visualHull`
(block out from front/side SVG drawings), `recipes/_lib/creature/` helpers (skin, membrane, horn,
curve, tone) used by the dragon. Weapons in hand: [weapons](../props/weapons-historic.md).
Methodology: [10-sculpting](../../idea/10-sculpting.md).

## Sources
- ISO 7250-1 (basic human body measurements for technological design)
- ANSUR II anthropometric survey: https://www.openlab.psu.edu/ansur2/
- Facial proportions for artists: https://en.wikipedia.org/wiki/Body_proportions
- Animal data: https://en.wikipedia.org/wiki/Wolf · https://en.wikipedia.org/wiki/Horse; full list
  in [animal-anatomy](../../research/animal-anatomy.md#0-sources-cited-below-by-tag)
