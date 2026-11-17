---
name: character-artist
description: A game character artist's workflow for ts23d — humanoid heads, busts and (planned) bodies of humans, orcs, goblins, dwarves, elves. Proportion systems (heads-per-height), planes of the head, primary/secondary/tertiary forms, silhouette and value focus, joints that fit, LOD-gated detail. Use when building or reviewing any humanoid, bust, face, head, hand, costume, armour on a body or anything with `head(ctx, …)` / `sculpt` for a person.
---

# Character artist

Use with the [author-recipe loop](../author-recipe/SKILL.md) and the
[characters playbook](../../../docs/playbooks/characters/characters-creatures.md). Soft words below
get numbers from [16-art-as-text](../../../docs/idea/16-art-as-text.md). Original designs only:
no character, name, costume or face from any game, film, book or real person.

## When
- A head, bust, hand, full figure or worn gear (helmet, pauldron, beard, hair) is the asset.
- A creature is humanoid enough that a human proportion system is the base (orc, goblin, troll).
- Reviewing a character's contact sheet or critique.

## Workflow (studio pipeline → ts23d)
| # | Studio stage | ts23d | Exit |
|---|---|---|---|
| 1 | Brief + reference: role, race, age, build, era; anatomy refs, front/side/3/4 photos of similar real people | dossier `recipes/<name>/README.md`; [reading list](../../../docs/research/reading-list.md) (Bridgman, Gray's) | proportion table with declared exaggerations |
| 2 | Turnaround drawing | inline SVG front + side (+ top); `visualHull({ front, side, top, scale, round })` | silhouette in both views matches the drawing |
| 3 | Block-out from separate masses (cranium, jaw, neck, torso, limbs) | `sculpt({ edits, resolution: ctx.pick([…]), mirror: 'y' })`; preset start `head(ctx, { race: 'orc' })`, tweak `HEADS.orc` | big masses read from 32 px away |
| 4 | Primary forms: planes of the head, brow ridge, cheek, jaw corner | `sculpt` edits with `blend`; `checkHead` for head ratios | front / side / 3/4 all read; ratios within tolerance |
| 5 | Secondary forms: eyelids, lips, ears, nasolabial fold, knuckles | more edits, LOD0 only (`ctx.lod === 0`) | `t3d review` close-ups show forms, not noise |
| 6 | Tertiary: pores, wrinkles, scars | `valueNoise` displacement in edits, or `tex.*` / creature strips | rest areas left untouched (≥ 25 % of visible surface) |
| 7 | Gear and props in their own files | `recipes/<name>/helmet.ts` etc.; `ctx.joint('grip', { kind: 'grip' })`, `ctx.joint('neck', …)` | `joints` gate PASS, `assertJointsFit` |
| 8 | Tone: skin value and hue zones, darker feet → lighter head | sculpt edit `color`, `paint` slots, `grime({ ground })` | greyscale hero: highest contrast at face |
| 9 | Present | `t3d shot`, `t3d hero`, `t3d blueprint` (1.8 m figure), `t3d critique` | every critique score ≥ 8 |

## Full-body humanoids: model-first (As of 2026-11; the route for realistic bodies)
A whole body sculpted from code primitives did not read as a person (`recipes/rts_soldier` is blocks). Heads
and busts below stay code (`head`, `sculpt`). For a full figure the surface, skin and clips come from a cached
model chain and code keeps scale, mass, clip names, budgets and QA. First shipped asset:
[`recipes/ranger`](../../../recipes/ranger/README.md) (QA PASS; its README holds every number and flaw).
Playbook: [characters-creatures](../../../docs/playbooks/characters/characters-creatures.md#model-tier-humanoid).

**1. Concept image.**
| Rule | Why |
|---|---|
| Front view, A-pose (the ranger: arms about 26 deg from vertical), legs apart, empty hands, no cape, no loose weapon | A rigger needs limbs clear of the body; anything touching the torso is fused in the mesh |
| Flat even light on a plain light-grey background; one figure, >= 60 % of the frame, not cropped | Light is baked into the albedo; input-image rules (`T3D_NEURAL_INPUT`) |
| Original design, no named character or costume | Licence and house rule |
| READ the PNG before spending (bind only `image`, `t3d neural run`) | Every key after the image changes with it |

**2. Chain** (kinds `riggedChain` + `defineModelCharacter`): `image` (local GPU `z-image`, or kubeez) -> `mesh`
(`pose: 'a-pose'`, hosted Meshy or local `pixal3d` / `trellis2`; kept local) -> `rig` (hosted: `height`, library
clips by name; local: `unirig` returns a skin, no library clips (not run on a humanoid here)) -> `blender` steps with `bind: { from: 'source' }`
(keeps the model's skin and clips) -> `importModel` -> ONE skinned textured part per LOD. No GPU and no key: the
`fallback` builds a grey mannequin (no face, bones or clips): honest, buildable everywhere, not the character.
```sh
bun run t3d neural run recipes/<name>/<name>.ts            # prints the credit estimate; --yes-spend above 50 credits
bun run t3d blender review recipes/<name>/<name>.ts --out review --pose LeftArm:z:50   # READ the PNGs
```

**3. Steps for a human** (ops and fields: [examples/blender/README.md](../../../examples/blender/README.md)):
| Op | Artist trick | Ranger value |
|---|---|---|
| `clean`, `retopo` shell | one solid surface, normal map carries the detail | 39 000 triangles, 5.5 mm voxel |
| `retopo.focus` | density on face and hands | head x4, hands x3 |
| `uv` smart, `bake` | albedo (EMIT), normal, AO, roughness; cage 12 mm, max ray 30 mm | 532 islands, hit rate 0.995 |
| `bind` from `'source'` | transfer the rigger's weights onto the shell; no `transform` on a rigged source (scale at import) | 0 vertices unweighted |
| `weights`, `joint` | fix a stretching skirt or shoulder by mask; move a bone end before `bind` | not needed |
| `lods` | gated decimate keeping weights | 38 998 / 11 798 / 3 898 |

Look with `t3d blender review` (clay, wire, `weights`, `poses`, `turnaround`); edit steps; look again.

**4. Gates.** QA `model` (`T3D_MODEL_TEXTURE`: blank albedo; `T3D_MODEL_FIT` / `T3D_MODEL_SKELETON`: wrong scale
or a joint outside the mesh), `skin`, `deform`, `gait` (in-place clips: skin of a foot may not go > 3 mm under
the floor; fix with the kind's `lift`). `importModel` closes a loop clip that ends one frame short of its
period and says so in `warnings`; `run` is reserved for part motions (ADR 013), name a run clip `jog`.

**5. Budget and cost.** Triangles about 39 000 / 12 000 / 4 000; `textureSets { count: 1, size: 2048 }`;
committed cache <= 12 MB (ranger: 11.09 MB). Ranger run 2026-11-16: image 0 credits 1 min 36 s; mesh 30 credits
about 2 min 30 s; rig 5 + 3 x 3 clips = 14 credits about 4 min; Blender 1 min 20 s; total 44 credits. Meshy is a
hosted, paid option: no seed, a re-run is a new sample ([meshy.md](../../../docs/research/meshy.md) section 8).

**6. Honest limits.** Fingers are a closed paddle (one hand bone, no finger bones). Hair is sculpted clumps, not
cards. Eyes are painted: no blink, no jaw. Albedo carries invented blotches and baked light (no de-lighting).
Loose clothes are skinned to the legs: a skirt stretches on a high knee, no cloth sim. Library clips are not
neutral (`idle` is a staggered stance). Planned: finger bones, jaw and blink, hair cards on a model head.

## Heads and busts: skull → planes → muscles → features → skin
Don't build a realistic head from ellipsoids (the old busts read as giraffe necks with eyes on the
surface). Start from the CC0 anatomical base and stylise it (`recipes/_lib/face/`,
[face-base.md](../../../docs/research/face-base.md) "Skull stage"):

| Stage | Code | Check |
|---|---|---|
| skull: race warp of the base (cranium, orbits, jaw, ears, neck) | `skullOf(character, frame)`, `skullEdit` → `BustRecipe.skull` | `proportionCheck` bands (eye line, fifths, thirds, neck ÷ head, eye depth, eyeball 24 mm) |
| planes: forehead, temple, cheek, buccal, jaw, chin | `planeStrokes` (`flatten`), `Forms.planes` | raking light shows facets, not an egg |
| muscles: brow ridge, zygoma, masseter, jaw line, SCM mastoid → sternum | `muscleStrokes`, `Forms` | no cylinder neck; traps slope into the shoulders |
| features: lid fold, nasolabial, vermilion border, philtrum, sulcus | `featureLines` (one table sculpts and declares the crease) | `t3d review` close-ups |
| skin: lips, redness (nose, cheeks, ears), beard shadow, brows, sockets | `zoneEdits` → `BustRecipe.zones` | greyscale: focus on the face |

A race declares its deltas twice: as a `FaceSpec` (what moves) and as a `ProportionTable` (the
bands it must land in, each with its reason). Close-ups: render with `beauty(c, { window })`.

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Heads-per-height | stature ÷ head height: 7–7.5 realistic, 8 heroic, 5 brute, 3–5 stylised | `real.measures` on `head_*` vs whole height; `assertSize` |
| Eye line | eyes at vertical middle of the head (chin–crown) | `ruler(c).bounds('eye_*')` vs head bounds |
| Rule of fifths | head width ≈ 5 eye widths; one eye-width between eyes | measure in a test with `ruler` |
| Thirds of the face | hairline–brow, brow–nose base, nose base–chin equal | `measures` with `between` |
| Shoulder width | ≈ 2 head heights (M), 1.75 (F) *typical, verify* | `assertBetween('shoulder_l', 'shoulder_r', …)` |
| Silhouette reads | LOD2 32×32 shape IoU ≥ 0.85 with LOD0, front/side/3/4 | `assertLodSilhouette(asset, 0.85)` (test helper, shipped); gate **planned** |
| Focal point | highest local value contrast on the face | **planned** (`focal`); judge in `t3d critique` today |
| Grounded | luminance rises from feet to head | **planned**; check hero by eye |
| Primary / secondary / tertiary | big masses / features / surface detail, in that order and size ratio | sculpt `form` tags **planned**; order your edits that way now |
| Edge flow | game meshes need ≥ 2–3 loops at bending joints | not applicable to SDF meshes; ts23d meshes are rigid today (see gaps) |

## Quality bar
- [ ] Proportions table in the dossier; every exaggeration declared (`jaw ×1.35` for an orc).
- [ ] Silhouette names the race from the side view alone; no lumpy noise at LOD0 edges.
- [ ] Face planes visible under the raking light in `t3d critique` (`raking.png`).
- [ ] Hands, neck, wrists: `ctx.joint` at every connection, `joints` gate PASS.
- [ ] Skin is not one flat colour: warm in ears/nose/lips, cooler shadow zones, value darkens to feet.
- [ ] Hair/beard is shaped masses with grooves, not a smooth helmet (see [hair research](../../../docs/research/hair.md)).
- [ ] Gear touches the body (`touches('helmet', 'head')`), never floats; straps wrap.
- [ ] LOD2 keeps outline and big colour blocks (`lods.png`); budget met.
- [ ] Mirror-symmetric base (`mirror: 'y'`), then deliberate asymmetry at LOD0 (scar, hair part).

## Common mistakes
- Detail before masses: wrinkles on a head whose jaw is the wrong size.
- Eyes too high (cartoon) when the brief is realistic; ears too low.
- Neck too thin, shoulders too narrow: reads as a child or a doll.
- Uniform noise everywhere; no rest areas, so nothing reads as focal.
- Perfect symmetry at LOD0: looks like a mannequin.
- Copying a known character's face, armour or palette. Learn the method, invent the design.

## Test it
```ts
import { assertJointsFit, assertLodSilhouette, assertSize } from '@developerz.ai/ts23d/testing';
it('fails if the bust grows past real head scale', () => assertSize(orc_bust, { height: [0.55, 0.75] }));
it('LOD2 keeps the outline', () => assertLodSilhouette(orc_bust, 0.85));
it('gear fits', () => assertJointsFit(orc_bust));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d review recipes/<name>/<name>.ts --out review   # close-ups of face, hands
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```
Model tier: add `t3d neural run` (fill the cache) and `t3d blender review` (look) before `t3d build`.

## Pairs with
- [creature-artist](../creature-artist/SKILL.md): non-human anatomy, stance, weight.
- [material-artist](../material-artist/SKILL.md): skin, cloth, leather, metal gear.
- [rigger-animator](../rigger-animator/SKILL.md): pivots, joints, deformation zones.
- [concept-artist](../concept-artist/SKILL.md): invented races, shape language.
- [presentation-artist](../presentation-artist/SKILL.md): camera and value read.

## Tool status
Shipped: `head` (+ `HEADS`, `headParams`, `checkHead`), `sculpt`, `sculptField`, `visualHull`,
`sd.*`, `ctx.joint` + `joints`, `assertJointsFit`, `assertLodSilhouette`, `t3d blueprint`.
Shipped (As of 2026-11): full-body model-tier humanoids (`defineModelCharacter`, `recipes/ranger`). Planned: code-built full-body `creature` skeletons (M4), `roundCone` + `skin()` capsule chains, sculpt `form`
tags, `pose`/`warp`, `focal` readability check, hair cards, skins/morph targets for animation.
Neutral positioning: ts23d is the free code-based option; it does not compete on claims.
