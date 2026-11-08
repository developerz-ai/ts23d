# Characters and creatures playbook

Humanoid busts and (planned) full bodies — human, orc, goblin, dwarf, elf — animals and fantasy
creatures. Status: busts ship today via the `head` kind builder; whole-body `creature` skeletons
are **planned for M4** ([roadmap](../../plans/roadmap.md#m4-creatures)). Reference recipes:
[`human_head`](../../../recipes/human_head/README.md), [`orc_head`](../../../recipes/orc_head/README.md),
[`goblin_head`](../../../recipes/goblin_head/README.md), and the flagship design dossier
[`dragon`](../../../recipes/dragon/README.md). Original designs only — no characters, names or
designs from any game, film or book. **Scale from head height** (the artist's unit) and real
animal measurements for creatures.

## Research
Anthropometric data (ISO 7250-1 body measurements; national surveys such as ANSUR II for adult
ranges), anatomy references for artists (planes of the head, skeletal landmarks), zoological data
for animals (shoulder height, body length, mass), and for fantasy creatures a **design dossier**
built from real animals: which real animal each body part borrows from and why (see the dragon
dossier's reasoning column). Photos / drawings: front, side, 3/4 and top of the head; for
creatures, side and front skeletal diagrams.

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
| grey wolf | 0.6–0.85 m | 1.0–1.3 m (+ tail 0.4–0.5) | 30–55 kg |
| domestic dog (Labrador-size) | 0.55–0.62 | 0.9–1.0 | 25–36 kg |
| horse | 1.5–1.7 | 2.4 | 450–600 kg |
| chicken | 0.25–0.35 (back) | 0.4 | 2–3 kg |
| golden eagle | wingspan 1.8–2.3 m | 0.66–1.0 | 3–6.5 kg |

Fantasy races in this repo are stylised from human anatomy: orc (heavy brow, wide jaw, tusks,
neck as wide as the head), goblin (big head ratio, long ears and nose, small jaw), dwarf (≈ 4
heads tall, broad), elf (long face, high cheekbones, pointed ears) — encoded as data in `HEADS`
and validated by `checkHead`.

## Part tree
```
bust (today, `head` kind): bust (on z = 0), head, jaw (pivot at the hinge; sway), eye_l / eye_r
                           (pivots at eyeball centres, looking +X)
body (planned, M4 `creature`): bones as named parts — pelvis → spine_0..n → chest → neck → head;
     upper_arm_l → forearm_l → hand_l → finger_*; thigh_l → shin_l → foot_l; tail_*, wing_* for creatures
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
so later sculpt edits cannot drift.

## Common mistakes
- Eyes too high (in the upper third) — the commonest beginner error.
- Neck a cylinder from under the chin; ears at the top of the head.
- Mirror-perfect faces; single flat skin colour.
- Fantasy creatures that borrow from a famous IP design.
- Realistic people: out of scope for SDF stylised sculpting; route to the planned `/neural`
  adapters ([08](../../idea/08-neural-adapters.md)).

## Reuse
`head` kind builder (`race`, `params`, `jawSway`), `HEADS`, `checkHead`, `sculpt`, `visualHull`
(block out from front/side SVG drawings), `recipes/_lib/creature/` helpers (skin, membrane, horn,
curve, tone) used by the dragon. Weapons in hand: [weapons](../props/weapons-historic.md).
Methodology: [10-sculpting](../../idea/10-sculpting.md).

## Sources
- ISO 7250-1 (basic human body measurements for technological design)
- ANSUR II anthropometric survey: https://www.openlab.psu.edu/ansur2/
- Facial proportions for artists: https://en.wikipedia.org/wiki/Body_proportions
- Animal data: https://en.wikipedia.org/wiki/Wolf · https://en.wikipedia.org/wiki/Horse
