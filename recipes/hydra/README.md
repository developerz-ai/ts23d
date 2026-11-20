# hydra: an original five-necked reptile (design dossier)

## Brief
A large ground predator that never existed: a heavy monitor-lizard body carried on four weight-bearing
legs, a long counterbalancing tail, and five long necks rising in a fan from one broad shoulder girdle.
It is an **original design**, built from the anatomy of real animals; it copies no game, film, book or
existing character. Function first: the necks are what let a low, heavy body hunt in five directions,
so the body stays planted and the heads do the work.

## Borrowed anatomy
| Part | Animal | What is taken | Number used | Source |
|---|---|---|---|---|
| Trunk and sprawling-to-semi-erect stance, heavy limbs | Komodo dragon (*Varanus komodoensis*) | low heavy trunk, five clawed toes, tail as a counterbalance | tail about as long as the body | [Wikipedia: Komodo dragon](https://en.wikipedia.org/wiki/Komodo_dragon) ("a tail as long as its body") |
| Tail share | Nile crocodile (*Crocodylus niloticus*) | laterally strong tail near half of total length | 40 to 50 % across sources; this design 53 % of trunk + tail (a little over, on purpose: it balances five necks) | [SANBI](https://biodiversityadvisor.sanbi.org/search/detail/80956) (40 %), [A-Z Animals](https://a-z-animals.com/animals/nile-crocodile/) (about 48 to 50 %, computed from its figures) |
| Skull: long snout, brow, belly scutes | Nile crocodile | head length about 0.14 of total length in the living animal | not applied to this body: here each head serves one long neck, see below | [Warner 2015, KZN thesis](https://researchspace.ukzn.ac.za/bitstream/10413/13305/1/Warner_Jonathan_K._2015.pdf) (search excerpt only, not opened) |
| Neck length | Giraffe (*Giraffa*) | the longest neck on a living land animal | up to 2.4 m; necks here 2.8 to 3.2 m along the arc, a deliberate 15 to 30 % past it | [Wikipedia: Giraffe](https://en.wikipedia.org/wiki/Giraffe) |
| Neck bone count | *Mamenchisaurus* | many cervicals give a believable bend | 19 cervicals; 10 bones per neck here, each standing for about two (plus a head and a jaw bone) | `docs/research/swim-and-tentacle-animation.md` section 3 [TW13] |
| Neck flexibility | Ostrich | per-joint limits, stiff base and flexible middle | dorsal up to 25.6 degrees per vertebra | same document [C13] |
| Teeth | Komodo dragon | serrated, recurved, about 60 teeth | teeth up to 2.5 cm in the real animal; this animal is scaled up, so its teeth are longer (design) | Wikipedia: Komodo dragon |
| Strike | Snakes | acceleration limit | mean about 190 m/s² | same document [P16] |

Claw length, osteoderm size, horn and crest shapes have no borrowed number: they are design values.

## Scale (design, metres; +X front, Z up)
| Dimension | Value |
|---|---|
| Trunk, chest to hip, along the spine | 2.9 |
| Tail along its curve | 3.3 |
| Back height at the shoulder | about 1.5 |
| Neck arcs | 2.8 to 3.2 |
| Head length (occiput to snout) | about 0.7 |
Overall `real` is the model's measured box: it pins the design so later edits cannot drift. It is
not a measurement of any animal.

## Shape language
Heavy, low, wide body; five necks as a fan of S-curves, each with its own height and reach so the
silhouette is a hand, not a comb. Each head differs: swept horns, a nose horn with brow spikes, a
sagittal crest, a spiked frill, curled horns. Dorsal spines and osteoderms run head to tail.

## Motion (clips from `hydraClips`; every timing is a design value, doc section 3)
`idle`: each head looks about on its own loop, one attending at a time. `strike_<k>`: wind-up in the
neck's own plane, strike at the snake acceleration bound, body recoil opposite, jaw snapping shut,
feet locked. Necks keep their order and stay out of each other (QA `chain-cross`).

## Photos (linked, never committed)
| View | Link |
|---|---|
| Komodo dragon, whole body, walking | <https://commons.wikimedia.org/wiki/File:Komodo_dragon_walking.JPG> |
| Komodo dragon, category | <https://commons.wikimedia.org/wiki/Category:Varanus_komodoensis> |
| Nile crocodile, category | <https://commons.wikimedia.org/wiki/Category:Crocodylus_niloticus> |
| Giraffe necks | <https://commons.wikimedia.org/wiki/Category:Giraffa> |

File and category titles were read from Commons listings or chosen by name; the images were not
opened by the agent.

## Declared creases
Every seam QA finds on this body is either fixed in the geometry or named here, in a region that is
small next to the piece it sits on (`creases` in `anatomy.ts` and `head.ts`, 14 cm radius at most):
the fold behind each hind knee, the groove at the top of the left hip, the fold on the inside of each
neck's first bend, nostril rims, the groove between horn roots, and the webbing between grown spikes.
The neck folds are the least satisfying of these: they are geometry that could still improve.

## Parts the engine needs
`body` (trunk, tail, legs, necks), `heads`, `jaws`, `eyes`, `teeth`, `horns`, `feet`, `claws`,
`spines`. Bones: `body_*`, `tail_*`, `fore_l_*`, `hind_r_*`, `neck_<k>_*`, `head_<k>_0`, `jaw_<k>_0`.

## Surface, wear and budget (2026-11 quality pass)
| Feature | How | Why |
|---|---|---|
| scales | `hydra_scales` strip (`material.ts`): overlapping 6 × 4.5 cm scales in true metres, crowns glossy (0.36), grooves rough (0.78); `uvBands` per chain keep them square round thick and thin sections | the old per-vertex scale relief cost 176 k triangles and still read as one smooth olive |
| keratin | horns, claws, teeth and spines on their own `hydra_keratin` strip: U a root-to-tip ramp, rough fibrous roots (0.62) to polished tips (0.2), fine growth ridges | horn shared the skin's roughness |
| dorsal saddles | dark crossbands at a 0.62 m pitch, broken by noise, as on a monitor | uniform olive back |
| mud | `mudAt`: wet dark mud on the feet, caked up the shins to the knee and drying to a pale crust at its ragged top edge, a broad band under the belly and chest | it lives in a river marsh; the old thin dusting did not read at hero distance |
| trunk | a barrel: the ribcage swells about 0.2 m wider mid-trunk than behind the shoulders and in front of the hips; shoulder and hip masses softened | read as a box in TOP and FRONT |
| scale relief | the scale strip's height 9 mm deep (was 4) | scales read as colour only |
| dorsal spines | one every 0.07 of the trunk's arc (0.20 m on its 2.9 m; was 0.048 of it), 0.0665 of the tail's (0.22 m on 3.3 m) and 0.10 of each neck's (0.28 to 0.31 m), a third larger | the spine line did not read in SIDE |
| scars | claw rakes across neck 1, a healed bite ring on the right flank (both on the hero camera's side), the tip of head 0's swept horn broken off | it fights |
| mouths | a forked tongue in every open jaw | empty mouths |
| proportions | thigh roots +24 %, upper arms +25 %, fore feet 16 cm further under the body; lowest necks raised 0.3 to 0.45 m so all five heads clear the shoulders; tail curls to one side | thin splayed legs, a head hanging in front of the chest |
| triangles | LOD0 348 k to 210 k to 161 k: neck, tail, leg and trunk rings cut (scales moved to the strip), jaws at a 1.65 cm cell, feet at 2.4 cm (toes webbed so they still roll onto the sole), eyes 14 × 10, spines and osteoderms sparser; heads keep their 1.15 cm cell (1.2 cm folds the horn roots) | 9× drop to LOD1 |
| far LOD | horn pairs keep 4 segments and 5 sides; the saddle pattern averages into the back colour | wedge heads far away |
| LOD1 (2026-11-19) | 40.2 k to 38.5 k: horns 6 segments × 5 sides, a tooth every 8 cm, eyes 8 × 6 | stay at or under the 38.8 k recorded before the wave |

Budget why: five complete sculpted heads (skull, open jaw, tongue, teeth, eyes, horns) on five necks plus a monitor-lizard body; each head is a creature head's worth of surface, so LOD0 (161k) and LOD1 (38.6k) sit over the one-body 150k/30k creature band and LOD2 keeps five head wedges at 7.1k.
