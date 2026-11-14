# Animal species sheets: sourced dimensions for common game animals

**Compact numbers for the twelve animals game assets ask for most, so a recipe's `real`, `measures`
and `CreatureSpec` (`mass`, `length`, `height`, `head`, `tail`) start from sources.** Rules that
apply across species (stance, landmarks, eyes, gaits, surfaces) are in
[animal-anatomy](animal-anatomy.md). Workflow: [creature-artist](../../.claude/skills/creature-artist/SKILL.md).

**Conventions.** Metres and kilograms, adult animals. **H** = shoulder (withers) height standing;
**HB** = head-body length, nose → tail root, straight line (the kind's `length`); **tail** excludes
the hair tip unless stated. Ratios are derived `[D]` from the numbers in the same row. `[S]` = in the
cited source; `[P]` = estimate from mounts or photos, verify before gating on it. Every species page
was read in November 2026; Wikipedia rows name the page section they came from, and its own
references (in brackets) are the primary sources.

Recipes already sourcing a species: `recipes/wolf` (grey wolf), `recipes/amur_tiger` (tiger).
`recipes/tiger_1` is the Tiger I **tank**, not an animal.

## Summary

| Species | H | HB | Tail | Mass | Head / skull | Stance |
|---|---|---|---|---|---|---|
| Grey wolf | 0.80–0.85 | 1.05–1.60 | 0.29–0.50 | mean 36–38.5 | skull 0.23–0.28 | digitigrade |
| Domestic dog (Labrador) | 0.55–0.62 | ≈ 0.9–1.0 `[P]` | ≈ 0.3 `[P]` | 25–36 | skull ≈ 0.22–0.25 `[P]` | digitigrade |
| Tiger (Amur male) | 0.8–1.1 (model 1.0) | 1.78–2.08, mean 1.95 | mean 0.99 | 176 (contemporary mean) – 306 | skull 0.331–0.383 | digitigrade |
| Lion (male / female) | ≈ 1.23 / 1.07 | 1.84–2.08 / 1.60–1.84 | 0.83–0.94 / 0.72–0.90 | 175–225 / 118–144 | skull 0.32–0.40 / 0.29–0.33 | digitigrade |
| House cat | 0.23–0.25 | ≈ 0.46 | ≈ 0.30 | 4–5 | ≈ 0.09 `[P]` | digitigrade |
| Horse (light riding) | 1.42–1.63 | ≈ 2.4 `[P]` | dock ≈ 0.5 `[P]` | 380–550 | skull ≈ 0.5–0.6 `[P]` | unguligrade |
| Cattle (Holstein) | 1.45–1.65 | ≈ 2.4–2.6 `[P]` | ≈ 0.9 `[P]` | 680–770 | skull ≈ 0.5 `[P]` | unguligrade, cloven |
| Red deer (stag / hind) | 1.22 / 1.14 (range 0.95–1.30) | 2.01 / 1.80 | 0.12–0.19 | 160–240 / 120–170 | antler ≈ 0.71, to 1.15 | unguligrade, cloven |
| Brown bear (interior) | ≈ 0.9–1.1 `[P]` (source: ≈ 1.5) | 1.0–2.8 | 0.06–0.22 | ♂ 180 / ♀ 135 mean | skull ♂ 0.315–0.455 | plantigrade |
| Wild boar (Europe ♂ / ♀) | 0.75–0.80 / ≈ 0.70 | ≈ 1.50 / ≈ 1.40 | ≈ 0.2–0.3 `[P]` | 75–100 / 60–80 | head ≤ ⅓ of length | semi-digitigrade, cloven |
| Golden eagle | perched ≈ 0.7–0.8 `[P]` | total 0.66–1.02 | 0.265–0.38 | ♂ 3.6 / ♀ 5.1 mean | culmen 0.036–0.05 | digitigrade (bird) |
| Nile crocodile (♂ / ♀) | high walk ≈ 0.3–0.5 `[P]` | total 3.5–5.0 / 2.2–3.8 | ≈ ½ of total `[P]` | 225–750 / 40–250 | skull ≈ 0.12–0.13 of total `[D]` | sprawling / high walk |

## Per species

### Grey wolf (*Canis lupus*)
| Item | Value | Source |
|---|---|---|
| H, HB, tail, mass, skull, ear | as summary; ear 0.09–0.11 | [Wikipedia: Wolf](https://en.wikipedia.org/wiki/Wolf) "Description", via `recipes/wolf/README.md` `[S]` |
| Ratios | HB ÷ H ≈ 1.44 (model 1.15 / 0.80); tail ÷ HB ≈ 0.37; skull ÷ HB ≈ 0.23; skull width ÷ length ≈ 0.55 | `[D]` |
| Chest | depth ≈ 0.5 H (elbow at chest floor ≈ 0.40 m) | `recipes/wolf/README.md` `[P]` |
| Fur (winter) | back 60–70 mm, shoulders ≤ 90, crest 110–130 mm | Wikipedia: Wolf `[S]` |
| Eyes | orbit convergence ≈ 50° (Canis), round pupil | [animal-anatomy §3](animal-anatomy.md#3-head-proportions) |

### Domestic dog (Labrador Retriever as the reference medium dog)
| Item | Value | Source |
|---|---|---|
| H | AKC ♂ 0.55–0.62, ♀ 0.55–0.60; FCI ♂ 0.56–0.57, ♀ 0.54–0.56 | [Wikipedia: Labrador Retriever](https://en.wikipedia.org/wiki/Labrador_Retriever) `[S]` |
| Mass | AKC ♂ 25–36, ♀ 25–32 | same `[S]` |
| Body | withers → tail base ≈ floor → withers (square dog) | same (breed standard) `[S]` |
| Weight split | forelimbs 60.4 % standing (breed range 47.6–74.4 %) | [PubMed 32363786](https://pubmed.ncbi.nlm.nih.gov/32363786/) `[S]` |
| Joint ROM | see [animal-anatomy §6](animal-anatomy.md#6-joint-ranges-of-motion-for-pivots-and-baked-motion) | Formenton et al. 2019 |
| Skull class | mesaticephalic; CFR ≥ 0.5 | [Cephalic index](https://en.wikipedia.org/wiki/Cephalic_index), Packer et al. 2015 `[S]` |

### Tiger (*Panthera tigris*; Amur male as modelled)
| Item | Value | Source |
|---|---|---|
| HB, tail | mean 1.95 (1.78–2.08), tail 0.99 | Kerley et al. 2005 via [Wikipedia: Siberian tiger](https://en.wikipedia.org/wiki/Siberian_tiger), `recipes/amur_tiger/README.md` `[S]` |
| H | 0.8–1.1 (all tigers) | [Wikipedia: Tiger](https://en.wikipedia.org/wiki/Tiger) "Description" `[S]` |
| Mass | wild Amur ♂ 176.4 contemporary mean, 215.3 historical; range 180–306; Bengal ♂ 200–260, ♀ 100–160 | Wikipedia: Siberian tiger; Wikipedia: Tiger `[S]` |
| Skull | ♂ mean 0.335 (all tigers), ♀ 0.283; Amur 0.331–0.383 | same `[S]` |
| Ratios | HB ÷ H ≈ 1.95; tail ÷ HB ≈ 0.51; skull ÷ HB ≈ 0.17–0.19 | `[D]` |
| Fur | typical ≤ 35 mm; Amur winter ≤ 105 mm; belly longer than back | Wikipedia: Tiger `[S]` |
| Toes | 5 fore (dewclaw), 4 hind; claws up to 0.10 along the curve | `recipes/amur_tiger/README.md` `[S]` |

### Lion (*Panthera leo*)
| Item | Value | Source |
|---|---|---|
| HB | ♂ 1.84–2.08, ♀ 1.60–1.84 | [Wikipedia: Lion](https://en.wikipedia.org/wiki/Lion) "Description" (West 2013) `[S]` |
| Tail | ♂ 0.825–0.935, ♀ 0.72–0.895; tuft spur ≈ 5 mm | same `[S]` |
| H | ♂ 1.23, ♀ 1.07 | [San Diego Zoo fact sheet](https://ielc.libguides.com/sdzg/factsheets/lions/characteristics) (Wilson & Mittermeier 2009) `[S]` |
| Mass | ♂ 186.5–225 (southern Africa), 174.9 (East Africa); ♀ 118–144 | Wikipedia: Lion (Smuts et al. 1980) `[S]` |
| Skull | ♂ 0.321–0.401, ♀ 0.292–0.333 | same `[S]` |
| Ratios | HB ÷ H ≈ 1.6 (♂); tail ÷ HB ≈ 0.45; skull ÷ HB ≈ 0.18 | `[D]` |

### House cat (*Felis catus*)
| Item | Value | Source |
|---|---|---|
| HB, tail, height, mass | ≈ 0.46, ≈ 0.30, 0.23–0.25, 4–5 | [Wikipedia: Cat](https://en.wikipedia.org/wiki/Cat) `[S]` |
| Skeleton | 7 C, 13 T, 7 L, 3 S; free-floating clavicle; 5 fore / 4 hind claws | same `[S]` |
| Eyes | orbit convergence 65.4°, binocular 120°; vertical slit pupil (ambush, short) | Heesy 2004; Banks et al. 2015 `[S]` |
| Ratios | HB ÷ H ≈ 1.9; tail ÷ HB ≈ 0.65 | `[D]` |

### Horse (*Equus caballus*)
| Item | Value | Source |
|---|---|---|
| H | light riding 1.42–1.63; larger riding 1.57–1.73; draft 1.63–1.83 | [Wikipedia: Horse](https://en.wikipedia.org/wiki/Horse) "Size" `[S]` |
| Mass | light 380–550; larger riding 500–600; draft 700–1,000 | same `[S]` |
| Weight split | forelimbs 57–60 % standing | Clayton & Hobbs, force shoes ([animal-anatomy §4](animal-anatomy.md#4-centre-of-mass-and-weight-support)) `[S]` |
| Eyes | lateral; orbit convergence 24.4°; field > 350°, ≈ 57–65° binocular; horizontal pupil | Heesy 2004; Wikipedia: Horse `[S]` |
| Ears | each pinna rotates up to 180° | Wikipedia: Horse `[S]` |
| Skull | ≈ 0.5–0.6 (small native breed 0.47 ± 0.02) | [UPLB thesis](https://www.ukdr.uplb.edu.ph/etd-undergrad/4486) `[S]` for the small breed; riding horse `[P]` |
| Gaits | walk 4-beat ≈ 6.4–7 km/h; trot 2-beat 13–19; canter 3-beat 16–27; gallop 40–48 | Wikipedia: Horse, Horse gait `[S]` |
| Vertebrae | 7 C, 18 T, 6 (5) L, 5 S, 15–21 Ca | [PMC11148713](https://pmc.ncbi.nlm.nih.gov/articles/PMC11148713/) `[S]` |

### Cattle (*Bos taurus*; Holstein dairy cow as reference)
| Item | Value | Source |
|---|---|---|
| H, mass | 1.45–1.65, 680–770 (breed range; page tagged "needs citations") | [Wikipedia: Holstein Friesian](https://en.wikipedia.org/wiki/Holstein_Friesian) `[S]`, verify |
| Beef reference | Hereford cow 600–800, bull 1,000–1,200; Chianina bull up to 1.8 m, ≈ 1,280 kg | [Wikipedia: Cattle](https://en.wikipedia.org/wiki/Cattle) `[S]` |
| Feet | two weight-bearing hoofed digits (III, IV) | same `[S]` |
| Eyes | field ≈ 330°, binocular 30–50°; horizontal pupil | same; Banks et al. 2015 `[S]` |
| Vertebrae | 7 C, 13 T, 6 L, 5 S, 18–20 Ca | PMC11148713 `[S]` |

### Red deer (*Cervus elaphus*)
| Item | Value | Source |
|---|---|---|
| HB | stag 1.75–2.50 (Scottish mean 2.01), hind 1.60–2.10 (1.80) | [Wikipedia: Red deer](https://en.wikipedia.org/wiki/Red_deer) `[S]` |
| H | 0.95–1.30; Scottish stag 1.22, hind 1.14 | same `[S]` |
| Tail | 0.12–0.19 | same `[S]` |
| Mass | stag 160–240, hind 120–170 (Carpathian up to 500; Corsican 80–100) | same `[S]` |
| Antlers | typical 0.71 long, 1 kg; large 1.15, 5 kg; grow up to 25 mm/day | same `[S]` |
| Ratios | HB ÷ H ≈ 1.65 (stag); tail ÷ HB ≈ 0.06–0.09 | `[D]` |

### Brown bear (*Ursus arctos*)
| Item | Value | Source |
|---|---|---|
| HB, tail | 1.0–2.8, 0.06–0.22 | [Wikipedia: Brown bear](https://en.wikipedia.org/wiki/Brown_bear) `[S]` |
| H | page: ≈ 1.5 (large animals); interior bears on all fours ≈ 0.9–1.1 `[P]` | flag: verify per population |
| Mass | interior ♂ ≈ 180, ♀ ≈ 135; 19-population ♂ mean 217, 24-population ♀ mean 152; coastal ≈ 2× interior; overall 80–600 | same `[S]` |
| Skull | Russian ♂ 0.315–0.455, ♀ 0.275–0.397 | same `[S]` |
| Feet | hind foot 0.21–0.36; fore feet ≈ 40 % smaller; claws 50–60 mm straight (70–100 curve), fore longer | same `[S]` |
| Hump | all muscle (digging) | same `[S]` |

### Wild boar (*Sus scrofa*)
| Item | Value | Source |
|---|---|---|
| HB | Europe ♂ ≈ 1.50, ♀ ≈ 1.40; eastern Europe ♂ ≈ 1.60 | [Wikipedia: Wild boar](https://en.wikipedia.org/wiki/Wild_boar) "Description" `[S]` |
| H | Europe ♂ 0.75–0.80, ♀ ≈ 0.70; Mediterranean 0.63–0.65; eastern ♂ ≈ 0.95; NE Asia large ♂ 1.10–1.18 | same `[S]` |
| Mass | Europe ♂ 75–100, ♀ 60–80; eastern ♂ 110–130; NE Asia ♂ to 270 | same `[S]` |
| Head | up to ⅓ of the body length | same `[S]` |
| Tusks | exposed lower canines 0.10–0.12; uppers shorter | same `[S]` |
| Coat | bristles shortest on face and limbs, longest on the back (mane) | same `[S]` |
| Ratios | HB ÷ H ≈ 1.9–2.0 | `[D]` |

### Golden eagle (*Aquila chrysaetos*)
| Item | Value | Source |
|---|---|---|
| Length, wingspan | 0.66–1.02, 1.80–2.34 | [Wikipedia: Golden eagle](https://en.wikipedia.org/wiki/Golden_eagle) `[S]` |
| Mass | ♂ mean ≈ 3.6, ♀ ≈ 5.1; heaviest verified wild 7.7 | same `[S]` |
| Wing chord, tail, tarsus | 0.52–0.72, 0.265–0.38, 0.094–0.122 | same `[S]` |
| Bill, talon | culmen 0.036–0.05 (gape ≈ 0.06); hallux claw 0.045–0.063 | same `[S]` |
| Feathers | non-passerines 9–11 primaries; eagles lack the 5th secondary; 12 rectrices typical | [Flight feather](https://en.wikipedia.org/wiki/Flight_feather) `[S]` |
| Wing chord caveat | the ornithological "wing chord" is wrist → longest primary on the folded wing, not the aerodynamic chord: do not multiply it by the span for wing area | Wikipedia: Golden eagle (measurement method) `[P]` |

### Nile crocodile (*Crocodylus niloticus*)
| Item | Value | Source |
|---|---|---|
| Total length | ♂ 3.5–5.0 (to > 6.1), ♀ 2.2–3.8 | [Wikipedia: Nile crocodile](https://en.wikipedia.org/wiki/Nile_crocodile) `[S]` |
| Mass | ♂ 225–750 (large > 1,000), ♀ 40–250 | same `[S]` |
| Skull | largest 0.686 on a 5.4–5.6 m animal → ≈ 0.12–0.13 of total length | `[D]` from same |
| Snout | 1.6–2.0 × its width at the eyes' front corners | same `[S]` |
| Teeth | 64–68 (per side: 5 premaxillary, 13–14 maxillary, 14–15 mandibular) | same `[S]` |
| Gaits | belly crawl; high walk; small animals gallop; ≈ 14 km/h on land | same `[S]` |
| Tail mass | alligator tail ≈ 28 % of body mass (crocodilian reference) | Willey et al. 2004 `[S]` |
| Senses | eyes, nostrils and ears on top of the head; vertical slit pupil | same; Banks et al. 2015 `[S]` |

## Agreement with the existing recipes and docs

| Item | Here | Elsewhere in the repo | Verdict |
|---|---|---|---|
| Wolf shoulder height | 0.80–0.85 (Wikipedia: Wolf) | `recipes/wolf/README.md` 0.80–0.85 ✓; playbook table said 0.6–0.85 | playbook updated to the sourced range |
| Wolf mass | mean 36–38.5 | wolf recipe declares 40 ± 25 % ✓ | consistent |
| Tiger HB / tail / H | 1.95 / 0.99 / 0.8–1.1 | `recipes/amur_tiger/README.md` same ✓ | consistent |
| Tiger mass | contemporary wild Amur ♂ mean 176.4 | amur_tiger declares 243 (midpoint of Mazák's 180–306) | heavy for a modern wild male; README states the choice |
| Tiger skull | ♂ mean 0.335 (all), Amur 0.331–0.383 | amur_tiger 0.36 ✓ | consistent |
| Horse H | light riding 1.42–1.63 | playbook said 1.5–1.7 | playbook updated |
| Golden eagle mass | ♂ 3.6 / ♀ 5.1 mean, max 7.7 | playbook said 3–6.5 | compatible; playbook now points here |
| Brown bear H | page says ≈ 1.5 | typical interior bears look ≈ 1 m at the shoulder | open: source a population-specific shoulder height before a bear recipe |
