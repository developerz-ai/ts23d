# How studios build dragons and big creatures — and how that maps onto ts23d

Research note for `recipes/dragon` (Cinderhorn) and future brute / ogre characters. It collects
**technique** from publicly published material: studio art guides, conference papers, artist
breakdowns, tutorials and anatomy papers. It uses no extracted or ripped game models, no model-viewer
data, and does not describe any specific copyrighted character's design for copying. Everything here
is a general, reusable principle.

**How sure each claim is.** `[S]` = stated in the cited source (paraphrased, with the URL).
`[P]` = practitioner consensus I could not pin to one primary source; treat it as a strong default,
not a fact. Numbers carry their source or are marked `[P]`.

Current Cinderhorn renders reviewed for this note: `tmp/dragon/look_hero.png`, `look_side.png`,
`look_rear.png` (2026-11-07). Recipe observations are tagged **(seen)**.

---

## 0. Sources (cited below by tag)

| Tag | Source | What it gives us |
|---|---|---|
| VALVE-ART | Valve, *Dota 2 Workshop Character Art Guide*, https://help.steampowered.com/faqs/view/0688-7692-4D5A-1935 (secondary coverage: https://www.cgchannel.com/2012/06/valve-releases-useful-character-design-guide) | silhouette first; value gradient dark feet → light head; saturation rises upward; areas of rest |
| VALVE-TEX | Valve, *Dota 2 Character Texture Guide*, https://support.steampowered.com/kb/8700-SJKN-4322/dota-2-character-texture-guide (light-baking page: https://help.steampowered.com/en/faqs/view/60E5-5E13-712C-5315) | light is painted/baked into the colour map; AO is the underpainting |
| TF2 | Mitchell, Francke, Eng (Valve), *Illustrative Rendering in Team Fortress 2*, NPAR 2007, https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf · slides https://cdn.fastly.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2_Slides.pdf | silhouettes tested as solid black; warm-to-cool shading; shadows cool, not black; reddened terminator; rim light only on up-facing normals; omit high-frequency detail; interior folds echo the silhouette |
| RIOT | Riot Games, *Clarity in League*, https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/ | one defining primary feature per silhouette; silhouette shows the source of power and facing; keep noise low |
| DOTA-BUDGET | Polycount Dota 2 Workshop threads, e.g. https://polycount.com/discussion/100016/dota-2-workshop-thread | community-reported hero budgets: ~6–7k tris portrait LOD0, ~3–4k in game LOD1 (2012 era; forum, not Valve) |
| WOW-WOD | Blizzard dev blog on the Warlords of Draenor model revamp, reported at https://www.engadget.com/2014-01-23-world-of-warcraft-dev-blog-details-character-model-revamps.html and https://www.wowhead.com/news/warlords-of-draenor-female-human-model-226814 | classic MMO player models went from "under 1,000" to "over 5,000" polygons, with doubled texture resolution and more bones |
| 80LV-SKEL | Chara Taliadorou, *Sculpting a Dragon in ZBrush: from Skeleton to Skin* (CGMA *Sculpting Anatomy: From Animal to Creature*), https://80.lv/articles/005cg-sculpting-a-dragon-in-zbrush-from-skeleton-to-skin/ | build bones → muscles → skin; bat-style wing attachment with a **second scapula** for the wing; small scales at folds, big scales hand-placed on face, feet, tail; paint primary → light/dark → secondary/tertiary colours, masked by cavity |
| PTERO | Elgin, Hone, Frey, *The Extent of the Pterosaur Flight Membrane*, Acta Palaeontologica Polonica 56(1) 2011, https://www.app.pan.pl/archive/published/app56/app20090145.pdf | the trailing edge of the main membrane reaches the lower leg/ankle in every well-preserved specimen |
| WING-FORUM | Drawing guides and forum notes on wing roots, e.g. https://tips.clip-studio.com/en-us/articles/3410 and https://tips.clip-studio.com/en-us/articles/5789 | don't grow wings straight out of the spine; a thick muscle group where the wing meets the back; bat hand as the wing frame |
| FORMS | *ZBrush Character Creation*, ch. 4 "Form and Details", https://www.safaribooksonline.com/library/view/zbrush-character-creation/9781118037065/c04-anchor-1.xhtml · Polycount critique https://polycount.com/discussion/comment/1554289 · VIEW Conference workshop (A. Salvatori) https://www.viewconference.it/article/1197/how-to-make-a-creature-mastering-secondary-and-tertiary-details | primary (masses) → secondary (muscle, folds, big scales) → tertiary (pores, micro scales); the common failure is jumping from primary straight to tertiary |
| SCALES-CB | Scale workflows: ZBrushCentral threads https://www.zbrushcentral.com/t/dragon-scales/302828 · Gnomon *Designing & modeling a creature with scales* https://origin.thegnomonworkshop.com/blog/designing-modeling-a-creature-with-scales · 80.lv *realistic dragon with ZBrush & Mari* (N. Morel, painted fully by hand) https://80.lv/articles/learn-how-to-create-a-realistic-dragon-with-zbrush-mari/ | scales placed following the form, sized for storytelling (bigger where the body is stretched); alphas/stencils for tertiary only |
| HP-PAINT | Polycount hand-painting threads, e.g. https://polycount.com/discussion/comment/1969117 · 80.lv stylised creature breakdowns https://80.lv/articles/designing-a-stylized-creature-in-zbrush-blender-marmoset-toolbag · https://80.lv/articles/modeling-and-texturing-an-interesting-hand-painted-game-ready-3d-character/ | AO/gradient underpaint; never pure black shadows; check the base colour **unlit**; "if a detail doesn't change the silhouette, paint it" |
| SKULL | Dragon head guides, e.g. https://design.tutsplus.com/articles/how-to-draw-a-realistic-dragon-head-in-3d-space--vector-14639 · https://www.clipstudio.net/how-to-draw/archives/176585 | start from a crocodile/monitor skull; space behind the eye for jaw muscle; heavy jaw + neck back for a ground predator; decide tongue type early |
| SHAPE | Shape-language primers: https://pixune.com/blog/shape-language-technique/ · https://3dsense.net/blogs/shape-language-in-character-design-communicating-through-geometry · Cinesite/Witcher talk summary https://beforesandafters.com/2023/02/19/shape-language-silhouettes-and-scanning-nurnies/ | circle/square/triangle meanings; a dominant shape with a contrasting secondary; choose shape language first, from what the creature *is* |
| OGRE-EATON | Scott Eaton, ogre character design for a commercial, https://scott-eaton.com/?p=2877 | brute read from posture (hunched "weight of the world"), "strong but not overtly muscular", face fattened to make it approachable |
| BRUTE-80 | 80.lv stylised anatomy / production breakdowns: https://80.lv/articles/detailed-stylized-male-anatomy-study · https://80.lv/articles/stylized-character-production-tips-and-tricks · https://80.lv/articles/making-an-armored-orc-from-world-of-warcraft-with-zbrush-substance | block primary forms first, then muscle groups; stretch/squash fat and folds with the pose; exaggerate from known anatomy |
| WHITLATCH | Terryl Whitlatch, *Science of Creature Design* (Design Studio Press), https://designstudiopress.com/products/science-of-creature-design | believable creatures come from real skeleton → muscle → skin, studied per animal |

---

## 1. Shape language and silhouette

**Principles**

1. **Silhouette first, tested as solid black.** Valve designed the TF2 classes to be told apart with
   no interior detail at all and used that test during concept `[S TF2 §4.1]`. The Dota guide asks
   for a hero to be "clearly identifiable at first glance" and to show which way it faces `[S VALVE-ART]`.
   Riot asks for **one defining primary feature** that shows the source of power `[S RIOT]`. For a
   dragon that means two things only: **horns + wings**. Everything else is supporting.
2. **Three tiers of form.** Primary masses (head, chest, hips, wing planes, tail), secondary forms
   (muscle groups, big plates, horn rings, skin folds), tertiary (micro scales, pores, cracks)
   `[S FORMS]`. Lock the primaries before adding secondaries; the usual amateur failure is jumping from
   primary to tertiary `[S FORMS, Polycount]`.
3. **Big–medium–small rhythm** `[P]`. In every region, one big shape, a medium one, a small one,
   never three equal ones: chest ≫ forearm > paw; skull ≫ horn > brow spike; wing plane ≫ finger >
   claw. Uniform sizes (spines all the same length, scales all the same size) read as noise. Riot's
   "keep noise minimal" `[S RIOT]` and Dota's "areas of rest" (calm zones with less detail, contrast
   and saturation, next to busy ones) `[S VALVE-ART]` are the same rule.
4. **Shape meaning.** Round = safe/heavy, square = stable/strong, triangle = threat `[S SHAPE]`. A
   good monster sets a dominant shape against a contrasting secondary one: round, heavy body masses
   carrying triangular horns, spines, claws and teeth `[S SHAPE]`. (Cinderhorn's README already
   says this.)
5. **Line of action / gesture** `[P]`. One continuous curve nose → neck → back → tail: a C or S read
   from the side. Interior forms (folds, plate rows, spine rows) should **echo** the silhouette
   lines, as TF2 did with clothing folds `[S TF2 §3, §4.1]`.
6. **Stylised exaggeration** `[P]`. Push the parts that carry the read and shrink the rest. For
   chunky hand-painted MMO creatures that is: oversized head (≈1/5–1/6 of body length rather than a
   reptile's ~1/10), oversized paws and claws (≈1.3–1.6× a real animal's), massive chest/forearms,
   narrow waist, short thick legs, and big simple horns. Wings are made **larger** than plausible,
   because they are the second identity feature.

**Cinderhorn (seen)**: the silhouette is strong: horns, raised wings, S neck. Weaknesses:
dorsal spines are **one size and evenly spaced** (no rhythm); the tail **thins to a whip with a tiny
spade**, so the rear silhouette ends in nothing; scale relief is the same size everywhere, so no area
rests.

---

## 2. Anatomy grounding

Creature artists build **from real animals, bones → muscle → skin**. "Animals and humans have the same
anatomy, just in different proportions, positions" `[S 80LV-SKEL]`; `[S WHITLATCH]`.

### Skull, snout, teeth, mouth
- Base the skull on **crocodile / monitor**: long rostrum, a brain case set back, a **temporal opening
  behind the eye filled by jaw-closing muscle**, giving a wide, heavy back of the head `[S SKULL]`.
  A predator that hunts on the ground has a bulky lower jaw and back of the neck `[S SKULL]`.
- Raptor / theropod skulls give the deeper snout and the brow shelf over the eye `[S 80LV-SKEL]`
  (they used T-rex and Velociraptor for the skull).
- Construction order `[P]`: brain case + snout box → jaw hinge **behind and below the eye** → cheek
  (jaw muscle) mass → brow ridge shading the eye → nostril bosses at the tip → lip line that **rises
  towards the back** (crocodile smile) → teeth.
- Teeth `[P]`: few, big and **graded in size** (front fangs + one or two caniniform teeth largest,
  getting smaller towards the back), seated in a gum ridge with the lip line partly hiding them. An
  even comb of identical teeth reads as a zipper. Stylised games usually show 3–6 readable teeth per
  side; the rest is a painted gum line.
- Tongue: choose forked (snake) or thick and fleshy (monitor) early `[S SKULL]`.

### Neck
- Long-neck muscle reads as **two masses**: a thick dorsal column (neck extensors running into the
  back of the skull) and a softer ventral throat with transverse plates and a dewlap `[P]`.
  Neck thickness **flares** into the chest (pectoral mass) rather than meeting it as a tube.

### Wings and the wing root (the part most models get wrong)
- Use a **bat hand**: humerus, forearm, wrist with a thumb claw, long fingers carrying the membrane
  `[S WING-FORUM]`; `[S 80LV-SKEL]`.
- **Six-limbed dragons need a second shoulder.** The CGMA dragon added one scapula for the front legs
  and a **second scapula where the wing bones attach** `[S 80LV-SKEL]`. The forum argument is that the
  wing scapula lies flatter (more horizontal) on the back so the humerus can swing from folded to
  spread, while the leg scapula lies upright on the ribs.
- **Never grow wings straight out of the spine.** Put a thick muscle group (the wing "pectoral" /
  deltoid mass) where the wing meets the back `[S WING-FORUM]`. In practice `[P]`: the wing humerus
  head sits in a **bulge above and slightly behind the front-leg shoulder**, the bulge blends into
  the trapezius line of the neck and the chest, and is wider than the humerus itself.
- **Membrane to the body.** In pterosaurs the main membrane's trailing edge runs to the **lower leg /
  ankle** `[S PTERO]`; in bats it reaches the hind limb too. For a dragon `[P]`: the inner membrane
  panel runs from the last finger along the flank and ends at the **thigh / knee**, never at a floating
  point in mid-air. The edge where the membrane meets the flank is a soft skin fold, not a seam.
- Membrane `[P]`: thin, sags between fingers (scalloped trailing edge), thickens at the leading
  edge (propatagium from the shoulder to the wrist). Veins/tendons branch from the bones.

### Legs and stance
- Forelimbs: lion/gorilla, elbow back, wrist forward, big paw. Hindlimbs: thigh forward, hock back,
  long metatarsus (horse/theropod) `[S 80LV-SKEL]` (theropod legs).
- Weight-bearing reads from **planted, splayed paws, compressed pads, and the body mass directly
  above the feet** `[P]`. Thin wrists/ankles on a heavy body look weak: stylisation **thickens**
  distal limbs (chunky forearms and paws) even when it slims the upper arm.

### Tail
- S-curve that **continues the spine line**, root as thick as the hips, a smooth monotonic taper,
  then a **terminal shape** (spade, club, fin) big enough to count as a silhouette feature `[P]`.
  Lizard + raptor references `[S 80LV-SKEL]`. Tail ≈ 40–50 % of total length in monitor lizards (the
  README's figure).

### Horns
- Horns grow **from a bony base (boss)** on the skull, follow a **single spiral/arc**, and taper
  steadily; growth rings get closer together towards the tip and fade there (bighorn/ibex) `[P]`.
  Secondary horns repeat the main sweep at smaller size (rhythm). Root dark, middle light, tip dark
  `[P]`; Cinderhorn's HORN palette already does this.

---

## 3. Scales and plates

1. **Hierarchy** `[S FORMS; S 80LV-SKEL]`: big dorsal plates / scutes (secondary, geometry) → medium
   flank scales (secondary/tertiary, relief) → micro scales at joints and folds (tertiary, normal
   map or paint). The CGMA dragon put **small scales where the skin folds** (knees, armpits) and
   **large hand-placed scales on the face, feet and tail** `[S 80LV-SKEL]`.
2. **Flow along form** `[S SCALES-CB]`: scales follow the body's long axis and wrap around limbs like
   rings; they overlap tail-wards (rain runs off backwards). Size follows stretch: bigger on broad
   convex surfaces (shoulder, thigh, back), smaller in creases (one artist made belly scales bigger to
   show a bloated belly) `[S SCALES-CB]`.
3. **Belly plates** `[P]`: transverse rows (croc/snake ventral scutes) running throat → belly → tail
   underside, **widest at the chest and narrowing** with the body, lighter in value, separated by
   darker seams. The transition belly → flank is a **row of smaller intermediate scales**, not a hard
   colour line.
4. **Repetition is the enemy** `[S 80LV-SKEL]` (her main problem with alpha-based scales). Vary size,
   rotation and tone per cell.
5. **Paint vs sculpt vs normal** `[S HP-PAINT]`: "If a detail doesn't significantly change the
   silhouette, it can usually be painted." Classic hand-painted MMO creatures carry nearly all scales
   **in the diffuse only** (dark outline, light crown per scale on the key-light side); modern
   stylised pipelines sculpt them and bake to normal maps; geometry is reserved for silhouette
   plates (dorsal ridge, tail blade, brow) `[P]`.
6. **Areas of rest** `[S VALVE-ART]`: scale relief is strongest on back, shoulders and thighs (where the
   eye goes and the light hits), quietest on the flank between them and on the inner wing.

**Cinderhorn (seen)**: scale relief is a uniform Worley pattern of one size over the whole torso and
neck. The belly plates read well on the chest but disappear on the side view.

---

## 4. Topology and budgets

| Era / context | Hero creature or character budget | Source |
|---|---|---|
| Classic MMO player models (mid-2000s) | "under 1,000" polygons, revamped to "over 5,000" (2014) | `[S WOW-WOD]` |
| MOBA hero (Dota 2, 2012) | ~6–7k tris portrait LOD0, ~3–4k in game | `[S DOTA-BUDGET]` (forum-reported) |
| Indie / stylised game-ready creatures | ~6k (low-poly dragon) to ~18–20k tris | Polycount/Rookies posts in the search results; `[P]` |
| Current stylised hero creatures (PC/console) | ~30–80k LOD0, LODs to a few thousand | `[P]` portfolio norms; no primary source |
| Current realistic hero / boss creatures | 100k+ LOD0 with 4–6 LODs | `[P]` |
| Cinderhorn budget | 200k / 40k / 4k (LOD0/1/2) | `dragon.ts` |

Where artists spend the triangles `[P]`:
- **Silhouette edges first**: horn curves, wing finger bones and the scalloped membrane edge, the
  tail end, the jaw line. A wing is the biggest silhouette area; a feathered game-ready wing pair at
  ~10k tris is one data point (Sketchfab listing in the search results).
- **Deformation zones**: shoulder/wing root, elbows, knees, neck, jaw: extra loops so skinning bends
  cleanly. Membranes are **a quad grid aligned to the fingers** (rows running root → tip) so they fold
  like a fan; membrane-to-body joins are a known non-manifold trouble spot (Polycount/Blender threads
  in the search results), so many artists keep the membrane a **separate closed shell tucked under the
  body skin**.
- **Head**: eyes, brow, mouth corners: what the camera looks at.
- **Flat broad areas (flank, inner wing) get the fewest triangles**; their detail is texture.
- Far LOD: masses, horns, wing planes, tail end. Spines become a single ridge strip; teeth and claws
  become paint `[P]`.

ts23d's version of this is built in: we don't decimate, recipes emit per LOD.

---

## 5. Hand-painted texturing (and its code equivalent)

1. **Light lives in the colour map.** Dota's in-game light is subtle, so light is painted/baked into
   the colour texture; **AO is the underpainting** `[S VALVE-TEX]`. Check the base colour **unlit**: it
   must hold up on its own `[S HP-PAINT]`.
2. **Top light + gradient from the feet up**: darkest at feet/lower body, lightest at upper body and
   head; **value contrast and saturation rise towards the head** `[S VALVE-ART]`. If feet are as bright
   as the head the figure doesn't break apart at a glance (Polycount, cited in VALVE-ART coverage).
3. **Warm light, cool shadow, never black.** Shadows go cool, saturation rises at the terminator
   (often reddened) `[S TF2 §3]`; avoid black even in black areas `[S HP-PAINT]`.
4. **Colour zoning** `[P; matches countershading in real reptiles]`: darkest, most saturated on the
   dorsal ridge; mid tone on flanks; light, desaturated on the belly; **one accent colour** used
   sparingly (eyes, horn tips, membrane veins, glowing throat). Large crisp graphic patterns help
   legibility `[S VALVE-ART]` (bands on the tail, a stripe along the spine).
5. **Per-scale painting** `[P]`: dark cavity outline, a light crown on the lit side, a little hue
   shift per scale; edge highlights (thin light line) on hard edges: horn ridges, plate rims, claw
   backs, wing bones.
6. **Paint order** `[S 80LV-SKEL]`: base colour → lighter/darker tones → secondary and tertiary
   colours, masked by cavity and smoothness.
7. **Low noise, few high-frequency details** `[S TF2 §3, §4.3]`: broad strokes, simple value
   groups. Detail at full contrast everywhere = noise.

---

## 6. Readability at game-camera distance

- **Rim light** `[S TF2 §5.2]`: TF2 masks rim highlights with a Fresnel term **and only on
  up-facing normals** (`n̂·û`), because "lighting tends to come from above". In a vertex-coloured
  asset the cheap equivalent is a **painted top-edge highlight**: lighten vertices whose normal points
  up and sideways (grazing to the 3/4 camera).
- **Value contrast at the focus points** `[S VALVE-ART]`: the highest local contrast at the head (eye,
  teeth, horns vs skin) and claws; the lowest at the belly-flank and inner wing.
- **Simplified far LOD** `[S TF2 §6]`: abstraction at distance; keep masses + identity features,
  drop everything else. Silhouette and value groups must survive at ~100 px tall.
- **Facing** `[S RIOT]`: head and horns point the way the creature moves; the head is the brightest,
  highest-contrast thing in the frame.

---

## 7. Brutes and ogres (big humanoid characters, incl. caster ogres)

Same sources and rules apply; brute-specific points:

1. **Proportions** `[P, consistent with BRUTE-80 and OGRE-EATON]`: a **small head** on a huge frame
   (≈1/7–1/9 of total height for a heavy brute vs 1/7.5 human; the chunky MMO idiom often sets the
   head **low and forward**, partly sunk below the trapezius line); **massive trapezius and shoulders**
   (shoulder width 2.5–3.5 head widths); **forearms thicker than upper arms**; **oversized hands**
   (hand length ≈ head height or more), fists that reach the knee; **short, thick legs** (leg length
   ≈ 40 % of height instead of 50 %), heavy feet. Big–medium–small: torso ≫ arms > head.
2. **Fat vs muscle layering** `[S BRUTE-80; OGRE-EATON]`: muscle defines the **shoulders, traps,
   forearms, calves** (hard, angular planes); fat defines the **belly, chest, neck roll and jowls**
   (soft, round, hanging). "Strong but not overtly muscular" (Eaton) is the brute read: a belly over
   muscle. Fat obeys gravity: it **hangs** (belly overhang, under-chin roll, sagging pecs) and
   **folds** where it bends (belly fold over the belt, neck rolls behind the head, wrist and elbow
   creases); fat and folds are stretched and squashed with the pose `[S BRUTE-80]`.
3. **Weight and posture** `[S OGRE-EATON]`: hunched "weight of the world on his shoulders": the
   spine curves forward, head forward of the chest, knees slightly bent, feet wide apart and
   flat. The centre of mass sits over the feet.
4. **Multi-headed variants** `[P]`: heads share **one** neck mass that splits (a Y), each head smaller
   than a single-headed brute's (≈0.8×) and distinct in **expression and shape** (one round/dull, one
   angular/cunning) so the silhouette reads two characters; the heads lean apart so the gap between
   them is a clear negative shape. The trapezius widens to carry both.
5. **Gear scaled to the frame** `[P]`: brute gear is **oversized and simplified**: big rivets, thick
   plates, a few large spikes instead of many small ones (rhythm again); human-sized items (books,
   pouches, skulls) as scale cues next to huge hands. Pauldrons emphasise the shoulder mass; belts and
   straps cut under the belly to show its weight.
6. **Caster accents** `[P; glow use mirrors VALVE-ART focus rules]`: robes/sashes over the gut, rune
   bands on wrists, a staff or focus item, **one glowing accent colour** (eyes, runes, palm) that is
   the highest value on the model and sits at the head/hands, the places the player should watch.
   Keep glow small: it is the focus, not the base.
7. **Hand-painted skin** `[S VALVE-TEX; S TF2]`: warm, saturated terminator and cool shadow; sub-skin
   red/purple in creases (knuckles, folds, nose, ears); lighter top planes (brow, shoulders, top of
   belly), darker underside of the belly and legs; painted veins/runes follow the muscle flow.

**ts23d mapping for brutes**
- `kinds/head` (`HEADS.orc` and the `HeadParams` knobs `brow`, `cheeks`, `jaw.muzzle/width/underbite`,
  `cranium`) already covers a brute head; a two-headed ogre = two `head()` calls placed on one neck
  sculpt group, each with its own overrides. `head-tone.ts` gives the painted tone.
- Body: today there is no brute body kind (`kinds/planned.ts` `creature()` shipped (src/kinds/creature.ts), M4). Build it in a
  recipe from `recipes/_lib/creature/` (`skin` chains for limbs, `sculptPart` for the torso) until the
  kind ships: fat as **ellipsoid add edits with large blend** hanging below the muscle mass; folds as
  **thin torus/capsule subtract edits with small blend** at the belt line, neck and wrists.
- Bust gear: `head-armour.ts` (spiked pauldrons), `head-garb.ts` (vest/scarf) show the pattern for
  oversized gear; scale spike size to the frame, not to a human.
- Glow: `glow: [{ parts: ['rune_*', 'eye_*'], ... }]` as Cinderhorn does for eyes.
- Checks: `measures` on head height vs total height, hand length vs head height, and shoulder width
  (the allometry check below), `symmetric('_l','_r','y')` for gear, `touches` for gear on the body.

---

## 8. Mapping principles onto the ts23d DSL

| Principle | DSL tool |
|---|---|
| Primary → secondary → tertiary | Sculpt edit order (block-out edits, then features, then `sculptPart` relief); README already sculpts in stages. Primary = ellipsoid/capsule/`skin` edits with **large blend** (0.15–0.4 m); secondary = smaller edits, blend 0.03–0.1 m; tertiary = relief displacement / `tex` stamps only at LOD0. |
| Smooth anatomical joins (wing root, neck → chest, membrane → flank) | One `sculpt` field with smooth-min `blend`; `SculptGroup` to carve only within a feature (e.g. a lid). Where two parts must stay separate (wing pivot), overlap the wing-root bulge into the body by a few cm and declare `ctx.joint` so QA `joints` checks the fit. |
| Big–medium–small, rhythm | Generate rows with a **size curve**, not a constant: e.g. spine height `h(t)` peaking at the shoulders, smaller over the waist, a second peak on the hips, tapering down the tail; skip/pair spines every few nodes. Use `ctx.rng` for small jitter only. |
| LOD-gated detail | `ctx.lod` / `ctx.pick`: LOD0 relief + all teeth; LOD1 masses + big teeth + spines; LOD2 `lowpoly` tubes/blobs (`_lib/creature/lowpoly.ts`), spines as one blade strip, teeth painted. |
| Painted light | `_lib/creature/tone.ts` `painted()` (cavity, warm top key, cool bounce, ground band); `kinds/head-tone.ts` for heads. Add the dorsal → belly value ramp and the **feet-to-head gradient** as an explicit colour function of height and body-normal. |
| Scales | `scales.ts` Worley relief + seams; `CREATURE_MATERIALS.dragon_scales` / `reptile_scales` via `defineMaterial` for the trim-sheet tile (`tex.scales` stamps). Vertex colour carries the zoning; the material carries the micro pattern. |
| Rim / edge highlights | Vertex tone: lighten where `normal·up > 0.3` and the vertex is on a convex edge (field curvature already probed by `painted()`). |
| Glow focus | `glow` declaration on `eye_*` (already), optionally throat/runes. |
| Checks | `real` + `measures` (allometry), `checks: [touches(...), clear(...), symmetric(...)]`, `ctx.joint` + QA `joints`, `floating-parts`, `clashes`; LOD gates `lodSilhouette`, `lodTriangles`. |

### Checks that could enforce these (proposed, not shipped)
1. **Silhouette readability at LOD2** — render the LOD2 black silhouette from side/front/top at ~128 px
   and compare with LOD0 (IoU ≥ 0.9). `qa.silhouetteIoU` exists as a **planned** stub
   (`src/qa/gates.ts`); `lodSilhouette` already guards the bounding box only.
2. **Value contrast / gradient** — from the vertex colours, mean luminance of the top 25 % of height
   minus the bottom 25 % ≥ some margin (VALVE-ART gradient); head-region local contrast ≥ body
   contrast. Implementable as a recipe `Check` over the compiled mesh today.
3. **Wing-root joint** — `ctx.joint('wing_root_l', …)` at the humerus head, so QA `joints` reports
   `T3D_JOINT_GAP` / `T3D_JOINT_BURIED`; plus `touches('wing_l', 'body')` and a check that the
   membrane's flank line lies on the body surface (point-to-surface distance ≤ 2 cm, via
   `qa.inspect`/`pointTriangleDistance`).
4. **Allometry** — `measures` for head length / body length (stylised band 0.15–0.2), tail length /
   total, forearm girth ≥ upper-arm girth (brutes), hand length / head height (brutes ≥ 1).
5. **Rhythm** — a recipe check that a spine/plate row's size sequence isn't flat (coefficient of
   variation ≥ 0.2).
6. **Area of rest** — fraction of LOD0 vertices with strong relief ≤ 60 %: cheap proxy for "not
   everything detailed".

---

## 9. Recommendations for `recipes/dragon` (numbered, actionable)

The first 12 are the ones to do first.

1. **Wing root: add the second shoulder.** In `skeleton.ts` move `wing.root` slightly back and down
   (behind and above `fore.shoulder`, e.g. x ≈ 0.6, y ≈ 0.42, z ≈ 2.05) and in `body.ts` sculpt a
   **wing-shoulder bulge** (ellipsoid ~0.35 × 0.25 × 0.2 m, blend ~0.15) into the back that the humerus
   emerges from, blending forward into the neck's trapezius line and down into the chest. Declare
   `ctx.joint('wing_root_l'|'_r')` so QA `joints` holds it. **(seen: the root reads as a sausage on top
   of the back.)**
2. **Membrane reaches the body.** Run the inner panel's flank line from the shoulder bulge along the
   flank to the **thigh/knee** (PTERO: trailing edge to the hind limb), not ending above the back; add
   a soft skin-fold strip where the membrane meets the flank. Add a check: every `flank` point within
   2 cm of the body surface.
3. **Value gradient feet → head.** In the tone pass, darken by height (feet/lower legs −25 to −35 %
   value, less saturated), lift the upper neck/head, and raise saturation and contrast towards the
   head (VALVE-ART). **(seen: one mid-red all over.)**
4. **Dorsal → belly countershading.** Darkest, most saturated crimson on the spine, ember flank,
   cream belly; extend the belly plates up the throat to the jaw and along the tail underside so they
   **show in the side view**, with a band of small transition scales between plate and flank.
5. **Rhythm in the spines.** Replace the constant spine height with a curve: tallest over the
   shoulders, a dip at the waist, a second peak at the hips, then tapering, then a final big tail
   feature. Big–medium–small. **(seen: uniform small spines.)**
6. **A real tail end.** Keep the root as thick as the hips, taper monotonically, and end in a
   **spade/blade at least the head's width**, so the rear silhouette has a terminal shape. **(seen: the
   tail ends in a whip with a tiny spade.)**
7. **Scale hierarchy, not uniform Worley.** Three tiers: large plates over back/shoulders/thighs
   (LOD0+LOD1 geometry for the dorsal ones), medium on flanks, tiny at the armpits, elbows, knees and
   neck folds. Scale cell size as a function of position (bigger on stretched convex masses), elongated
   along the body axis, overlapping tail-wards. Leave **areas of rest** on the mid-flank and inner wing.
8. **Head focus.** Highest contrast at the head: brighter brow and snout top planes, dark mouth
   interior, ivory horns with a dark root ring, glowing eye. Grade teeth by size (2 big fangs per side
   up front, then decreasing); fewer, bigger teeth beat an even comb.
9. **Skull mass behind the eye.** Widen the jaw-muscle (temporal/cheek) mass behind and below the eye
   and give the brow shelf a clear overhang shadow: crocodile/monitor head with a heavy back
   (SKULL).
10. **Heavier distal limbs.** Thicken forearms, wrists and paws (stylised: paws ~1.3–1.5× now) so the
    body visibly rests on them; splay the toes and flatten the pads on the ground.
11. **Painted rim / edge highlights.** Lighten up-facing convex edges (wing finger bones, horn ridges,
    spine crests, plate rims, brow) and keep shadows cool red-violet, never near-black (TF2).
12. **LOD2 silhouette check.** Add a recipe check (or push for `silhouetteIoU`) that the LOD2 side and
    front silhouettes cover ≥ 90 % of LOD0's: horns, wing planes and the tail end must survive; spines
    merge into one ridge strip; teeth become paint.
13. Membrane topology: rows from root to finger tip so the baked flap bends along the fingers; keep
    vein paint on the membrane's darker underside and a darker scalloped rim.
14. Horns: tighter growth rings near the base fading towards the tip; secondary horns repeat the main
    curve at about half the size.
15. Allometry `measures`: head length 1.25 m ± 2 %, tail ≥ 40 % of length, shoulder height; they
    stop later edits from drifting.
16. `CREATURE_MATERIALS.dragon_scales` is a green/bronze graph: if the dragon uses it, rely on vertex
    colour tints for the crimson, or register a variant whose ramp is neutral grey so the zoning comes
    only from vertex colour.

---

## 10. Caveats

- Valve's Steam help pages render their body by script; their content here was confirmed through search
  snippets and secondary coverage (cgchannel, Polycount quotes), not a full-page read.
- Budget numbers other than WOW-WOD, DOTA-BUDGET and `dragon.ts` are `[P]`.
- No source here is a model file; nothing was downloaded beyond the public PDFs/pages cited.
