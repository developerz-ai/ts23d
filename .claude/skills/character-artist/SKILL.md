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

## Pairs with
- [creature-artist](../creature-artist/SKILL.md): non-human anatomy, stance, weight.
- [material-artist](../material-artist/SKILL.md): skin, cloth, leather, metal gear.
- [rigger-animator](../rigger-animator/SKILL.md): pivots, joints, deformation zones.
- [concept-artist](../concept-artist/SKILL.md): invented races, shape language.
- [presentation-artist](../presentation-artist/SKILL.md): camera and value read.

## Tool status
Shipped: `head` (+ `HEADS`, `headParams`, `checkHead`), `sculpt`, `sculptField`, `visualHull`,
`sd.*`, `ctx.joint` + `joints`, `assertJointsFit`, `assertLodSilhouette`, `t3d blueprint`.
Planned: full-body `creature` skeletons (M4), `roundCone` + `skin()` capsule chains, sculpt `form`
tags, `pose`/`warp`, `focal` readability check, hair cards, skins/morph targets for animation.
Neutral positioning: ts23d is the free code-based option; it does not compete on claims.
