# dragon — "Cinderhorn", a stylised fantasy drake (design dossier)

An ORIGINAL creature in the chunky hand-painted fantasy idiom (MOBA / MMO hero scale): a
four-legged, two-winged drake standing square on the ground, wings raised half-open, neck in an
S-curve, mouth ajar. It copies no game character, name or design; the anatomy below is built from
real animals so the fantasy reads as plausible.

This is the gallery flagship and the proof that a recipe is a program: about 3,000 lines across
one module per body part, sculpted in stages (block-out → planes → features → secondary → tone).
Shared creature helpers live in `recipes/_lib/creature/` (skin chains, horns/claws, membranes,
tubes, tone, probes).

## Scale and proportions (design spec, metres; +X front, Z up)

| Dimension | Value | Reasoning |
|---|---|---|
| Nose to tail tip (X) | 8.7 m | tail ≈ 45% of length like a monitor lizard, resting on the ground in an S |
| Wing span in the pose (Y) | 7.9 m | raised and swept back 28° so both membranes show from 3/4 views |
| Height to wing tips (Z) | 4.7 m | wings raised in a V over the back |
| Shoulder height | ~2.0 m | front limbs heavier than hind (gorilla/lion stance = power read) |
| Head length | 1.45 m | ~1/6 of body length: oversized for the stylised read; crocodilian muzzle |
| Horn length (main pair) | ~1.1 m | sweeps back past the skull, the signature silhouette |

Overall `real` = the model's measured box (design spec, not a real animal); `measures` pin the
spec numbers (shoulder height, head length, eye spacing) so later edits cannot drift.

## Shape language

- **Big-small-big.** Massive chest and forearms, narrow waist, heavy hips; huge head, slim neck
  base. Chunky silhouette first, detail second.
- **Triangles for threat.** Horns, back spines, tail blade, claws and teeth are all wedges pointing
  back or down; the body masses are round. Hard wedges on soft masses = readable at LOD2.
- **One S-line.** Nose → raised neck → dipped back → rising hips → tail sweeping down then
  sideways along the ground: one continuous line of action, read from the side.
- **Wings frame the head.** The raised wings make a V behind the head from the 3/4 view.

## Anatomy references (real animals → feature)

| Feature | Animal | Photos (Wikimedia Commons; linked, never committed) |
|---|---|---|
| Skull: long snout, heavy jaw muscles, brow shelf, nostril bumps | Nile / saltwater crocodile | [Crocodylus niloticus](https://commons.wikimedia.org/wiki/Category:Crocodylus_niloticus) · [crocodile skulls](https://commons.wikimedia.org/wiki/Category:Crocodylidae_skulls) |
| Dewlap, cheek scutes, dorsal crest, banded tail | Green iguana | [Iguana iguana](https://commons.wikimedia.org/wiki/Category:Iguana_iguana) |
| Belly plates (transverse scutes), heavy forked tongue, low stance | Komodo dragon | [Varanus komodoensis](https://commons.wikimedia.org/wiki/Category:Varanus_komodoensis) |
| Wing: humerus, forearm, thumb claw, 3 long fingers, membrane scallops between fingers | Bats (Chiroptera) | [Bat wings](https://commons.wikimedia.org/wiki/Category:Bat_wings) · [bat skeletons](https://commons.wikimedia.org/wiki/Category:Chiroptera_skeletons) |
| Chest, shoulder blade, elbow back / wrist forward, digitigrade-ish paws | Lion | [Panthera leo](https://commons.wikimedia.org/wiki/Category:Panthera_leo) |
| Hind leg: thigh forward, hock back, long metatarsus | Horse | [Equine anatomy](https://commons.wikimedia.org/wiki/Category:Equine_anatomy) |
| Osteoderms / back scutes | Saltwater crocodile | [Crocodylus porosus](https://commons.wikimedia.org/wiki/Category:Crocodylus_porosus) |
| Ridged horns with growth rings | Bighorn sheep / ibex | [Ovis canadensis](https://commons.wikimedia.org/wiki/Category:Ovis_canadensis) · [Capra ibex](https://commons.wikimedia.org/wiki/Category:Capra_ibex) |

## Biology (skeleton → muscle → skin)

Built like an animal, then exaggerated on purpose; `biology.ts` computes these numbers from the
model and `dragon.test.ts` holds them (`bun test recipes/dragon`).

| Topic | Choice | Source / reasoning |
|---|---|---|
| Build order | skeleton landmarks (`skeleton.ts`) → muscle masses (pectorals, deltoid, scapula, haunch, masseter) → skin (scales, plates, folds) | Whitlatch, *Science of Creature Design*; Taliadorou, [80.lv dragon from skeleton to skin](https://80.lv/articles/005cg-sculpting-a-dragon-in-zbrush-from-skeleton-to-skin/) |
| Joints | where real joints are: shoulder, elbow (back), wrist; hip, knee (forward), hock (back); jaw hinge behind the eye; wing shoulder on a **second scapula** behind the forelegs | lion / horse limbs; bat wing; 80.lv (second scapula) |
| Wing | humerus + forearm + thumb claw + four fingers; membrane between fingers and from the last finger down the flank to the **thigh** (pterosaur brachiopatagium reaches the leg) | Elgin, Hone & Frey 2011, [Acta Palaeontol. Pol. 56(1)](https://www.app.pan.pl/archive/published/app56/app20090145.pdf) |
| Mass | ~7 t: ~7 m³ of flesh at ~1000 kg/m³ (water; reptile tissue ≈ 1000–1100) | volume × density from the compiled LOD2 mesh (`biology.ts`) |
| Legs | bone ≈ 0.4 × flesh diameter → humerus + femur circumference ~1.26 m predicts ~26 t carrying mass, ~3.7× the actual 7 t (Campione & Evans quadruped scaling, bone circumference ∝ mass^0.36) — the legs are deliberately overbuilt (×1.3–1.5 thick lower limbs, flat pads) | Campione & Evans 2012, [BMC Biology 10:60](https://doi.org/10.1186/1741-7007-10-60) |
| Wing loading | ~15 m² of membrane for ~7 t → ~4,500 N/m², ~20× a giant pterosaur's (~150–250 N/m²). **Stylised exaggeration: it does not fly**; a flying 7 t animal would need ~300 m² | Witton & Habib 2010, [PLoS ONE 5(11) e13982](https://doi.org/10.1371/journal.pone.0013982) |
| Scales | hierarchy: big plates on back, shoulders and thighs; medium on the flanks (an area of rest, low contrast); tiny in the band between belly plates and flank; transverse ventral plates up the throat and under the tail (croc / monitor scutes); elongated along the body | croc/monitor photos above; Valve Dota 2 art guide ("areas of rest") |
| Horns | log-spiral sweeps (curvature ∝ e^(k·t)) growing from bony bosses ~1.45× their base radius, roots buried ≥ 0.5 × radius, skin colour creeping up the root, growth rings near the base | horn growth (ibex/bighorn); `_lib/creature/horn.ts` |
| Eyes | deep orbit under a brow overhang, heavy upper and scaled lower lid, vertical slit pupil, forward-ish gaze | monitor / croc eyes |

## Palette (sRGB, hand-painted tone on top)

| Zone | Colour | Notes |
|---|---|---|
| Back scales | `#7a1e18` deep crimson | warmer and lighter on top planes (key light), cooler under |
| Flanks | `#a83a1f` ember red-orange | graded from the back by height on the body |
| Belly plates | `#d9a85c` ochre cream | lighter, dark seams between plates |
| Horns, claws, spines | `#e8d9b8` ivory → `#3a2a22` tip | dark at the root ring, ivory middle, charcoal tip |
| Teeth | `#f1e6cc` | slightly darker at the gum |
| Mouth, tongue | `#5a1414` / `#b2384a` | |
| Wing membrane | `#c4502a` | translucent-looking orange; veins darker; scalloped rim darker |
| Eyes | `#ffcc33` glowing, slit pupil | `glow` emissive |

## Parts (the engine contract)

| Part | Pivot | Motion / joint |
|---|---|---|
| `body` | origin | torso, neck, haunches, belly plates, back ridge, legs, paws, claws |
| `shoulder_l` / `_r` | origin | the wing sockets, split off the body sculpt (same surface) |
| `head` | origin | skull, brow, minor horns, upper teeth, nostrils |
| `horn_l` / `_r`, `horn_boss_l` / `_r` | origin | main horns and the bony bosses they grow from; joint `horn_*_root` (socket) |
| `eye_socket_l` / `_r` | origin | orbits with lids, split off the skull |
| `jaw` | jaw hinge | baked `sway` about local Y (bite), one way |
| `eye_l` / `eye_r` | eyeball centre | aimable; joint `eye_*_orbit` (socket) |
| `wing_l` / `wing_r` (groups) → `_arm`, `_membrane` | shoulder joint | baked `sway` about the shoulder→thigh line (flap; the membrane's body edge stays on its hinge); joint `wing_*_shoulder` (flush) |
| `tail` | tail root at the hips | baked `sway` about local Z (swish) |

## LOD policy

| LOD | Sculpt cell (body / head) | Keeps | Drops |
|---|---|---|---|
| 0 | 4.4 cm / 1.6 cm | scale relief (3 sizes), belly plate seams, horn rings, full tooth rows, membrane veins | — |
| 1 | 8.5 cm / 4 cm | every mass, horns (tubes), spines, claws, every other tooth (larger) | rings, small teeth, veins, scale relief |
| 2 | 25 cm / 14 cm | silhouette: torso sculpt, tube legs / wing bones / tail, horns, fangs | all secondary forms |

Thin parts (horns, claws, teeth, finger bones) are tubes at every LOD — a sculpt would need
sub-centimetre cells; the torso, head and jaw are sculpts.

Budget (measured): 200k / 45k / 4.5k triangles; see `dragon.ts`.
