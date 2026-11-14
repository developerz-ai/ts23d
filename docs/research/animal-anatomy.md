# Animal anatomy: measurable rules for vertebrate creatures

**The comparative anatomy an agent needs to build any vertebrate convincingly, with each rule given
as a number it can check.** This is the animal counterpart of [head-analysis](head-analysis.md) and
[face-base](face-base.md): what the `creature` kind (`src/kinds/creature-*.ts`) and creature recipes
(`recipes/wolf`, `recipes/amur_tiger`, `recipes/dragon`) should agree with. Species numbers are in
[animal-species-sheets](animal-species-sheets.md). The workflow is in the
[creature-artist skill](../../.claude/skills/creature-artist/SKILL.md) and the
[characters & creatures playbook](../playbooks/characters/characters-creatures.md).

**How sure each rule is.** `[S]` = stated in the cited source (paraphrased). `[P]` = practitioner or
textbook consensus that could not be pinned to one primary page in this pass; treat it as a strong
default and verify it against a mounted skeleton or photo before using it as a gate. `[D]` = derived
here from sourced numbers (the arithmetic is shown).

**ts23d column.** *shipped* names a real check or kind default in `src/`. *planned* means no check
exists yet: an agent judges it from `t3d shot` / `t3d blueprint`, or writes a recipe test.

## 0. Sources (cited below by tag)

| Tag | Source |
|---|---|
| CE12 | Campione & Evans, *A universal scaling relationship between body mass and proximal limb bone dimensions in quadrupedal terrestrial tetrapods*, BMC Biology 10:60 (2012), https://doi.org/10.1186/1741-7007-10-60 |
| HEESY04 | Heesy, *On the relationship between orbit orientation and binocular visual field overlap in mammals*, Anat. Rec. A 281 (2004), https://doi.org/10.1002/ar.a.20116 |
| BANKS15 | Banks, Sprague, Schmoll, Parnell, Love, *Why do animal eyes have pupils of different shapes?*, Science Advances 1(7) (2015), https://doi.org/10.1126/sciadv.1500391 |
| HILD77 | Hildebrand, *Analysis of asymmetrical gaits*, J. Mammalogy 58 (1977) 131–156, https://www.originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/04/Hildebrand_1977_Analysis-of-Asymmetrical-Gaits.pdf |
| HILD89 | Hildebrand, *The quadrupedal gaits of vertebrates*, BioScience 39(11) (1989), https://doi.org/10.2307/1311182 |
| AJ83 | Alexander & Jayes, *A dynamic similarity hypothesis for the gaits of quadrupedal mammals*, J. Zool. 201 (1983); transition Froude numbers as summarised (after Alexander 1984, IJRR 3(2)) at https://en.wikipedia.org/wiki/Froude_number#Walking_Froude_number |
| HT88 | Heglund & Taylor, *Speed, stride frequency and energy cost per stride*, J. Exp. Biol. 138 (1988), https://journals.biologists.com/jeb/article/138/1/301/5532 |
| US17 | Usherwood & Self Davies, *Work minimization accounts for footfall phasing in slow quadrupedal gaits*, eLife 6:e29495 (2017), https://elifesciences.org/articles/29495 |
| HGAIT | Wikipedia, *Horse gait* (footfall order, beats, speeds), https://en.wikipedia.org/wiki/Horse_gait |
| DOGW | Standing fore/hind weight split in 552 dogs of 123 breeds (2020), https://pubmed.ncbi.nlm.nih.gov/32363786/ (meeting abstract: https://sicb.org/?p=6412) |
| HORSEW | Equine standing load 57–60 % forelimbs: Clayton & Hobbs review and force-shoe data, summarised at https://equimanagement.com/research-medical/sports-medicine/understanding-the-biomechanics-of-equine-movement-and-balance/ and https://cvm.missouri.edu/wp-content/uploads/2023/06/Smith.pdf |
| WILLEY04 | Willey et al., *The tale of the tail: limb function and locomotor mechanics in Alligator mississippiensis*, J. Exp. Biol. 207 (2004), https://journals.biologists.com/jeb/article/207/3/553/15304 |
| FORM19 | Formenton et al., *Goniometric assessment in French Bulldogs*, Front. Vet. Sci. 6:424 (2019), https://doi.org/10.3389/fvets.2019.00424 (compares with Jaegger et al. 2002, Labrador Retrievers, AJVR 63(7)) |
| VERT24 | Normal vertebral formulae of domestic mammals (table), https://pmc.ncbi.nlm.nih.gov/articles/PMC11148713/ |
| GJ93 | Garland & Janis, *Does metatarsal/femur ratio predict maximal running speed in cursorial mammals?*, J. Zool. 229 (1993), https://biologyfiles.ucr.edu/people/faculty/Garland/GarlandJanis1993.pdf |
| PACK15 | Packer et al., *Impact of facial conformation on canine health: corneal ulceration*, PLoS ONE 10(5) e0123827 (2015), https://doi.org/10.1371/journal.pone.0123827 |
| CEPH | Wikipedia, *Cephalic index* (dog/cat skull classes), https://en.wikipedia.org/wiki/Cephalic_index |
| FEATH | Wikipedia, *Flight feather* (primary/secondary/rectrix counts), https://en.wikipedia.org/wiki/Flight_feather |
| SNAKE66 | Ventral shields vs vertebrae in snakes, Zoologische Mededelingen 41 (1966), https://repository.naturalis.nl/pub/318394/ZM1966041011.pdf |
| DIGI | Wikipedia, *Digitigrade* (stance classes, semi-digitigrade groups), https://en.wikipedia.org/wiki/Digitigrade |
| WIKI-SP | Species pages cited per row in [animal-species-sheets](animal-species-sheets.md) |
| ELLEN | Ellenberger, Baum & Dittrich, *Handbuch der Anatomie der Tiere für Künstler* (1898–1911), public-domain plates: https://commons.wikimedia.org/wiki/Category:Handbuch_der_Anatomie_der_Tiere_f%C3%BCr_K%C3%BCnstler |

## 1. Skeleton landmarks

Names an agent must use for joints and pivots (artist word → anatomy → where it is).

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Withers = top of the scapulae | highest point of the topline in a standing quadruped is over the shoulder blades (spinous processes T2–T8 plus the scapula tops), not over the hips; withers z ≥ croup z (horse, dog, cat, bear standing) | ELLEN plates `[P]` | shipped: kind topline (withers > dip, croup −3 % H) |
| No clavicle sling | quadruped forelimb hangs in a muscle sling; the scapula slides on the ribcage, so the shoulder joint sits *in front of* the ribcage at about the upper third of chest depth | Cat: clavicle free-floating (https://en.wikipedia.org/wiki/Cat) `[S]`; ungulates `[P]` | shipped: kind shoulder at H − 0.6 D |
| Elbow at the brisket | the elbow (olecranon) sits level with the bottom of the chest (± 5 % H) and behind the shoulder joint | ELLEN `[P]` | shipped: kind elbow at H − D + 0.03 H |
| Chest depth | brisket depth ÷ withers height: German Shepherd standard 0.45–0.48; wolf ≈ 0.5; horse "depth of girth ≈ leg length" ≈ 0.5 | FCI German Shepherd standard No. 166, https://www.fci.be/Nomenclature/Standards/166g01-en.pdf `[S]`; `recipes/wolf/README.md`; horse `[P]` | shipped: `build.depth` (default 0.45) |
| Stifle = knee, forward | the stifle points forward (+X) and sits about level with the belly line; the hock (calcaneus) points backward | DIGI `[S]` (bird "knee" is the ankle) | shipped: kind K ahead of hip, hock behind |
| Hock = ankle; horse "knee" = wrist | carpus on the foreleg, tarsus on the hind leg; the joint a horse person calls the knee is the carpus | DIGI `[S]` | shipped (naming in `creature-quadruped-legs.ts`) |
| Hip third | the hip joint sits about ⅓ of the way down from the croup to the stifle, in front of the ischium (point of buttock) | ELLEN `[P]` | shipped: hip at H − 0.38 D |
| Atlas pivot | the head pivots at the atlas, behind and below the ear base; the neck leaves the chest low between the shoulders (C7 sits deep), not from the top of the back | ELLEN `[P]` | shipped: kind neck base below withers |
| Jaw hinge level | carnivore jaw joint ≈ level with the tooth row (scissor bite); ungulate jaw joint well above the tooth row (grinding) | comparative anatomy `[P]` | planned |
| Seven cervicals | almost all mammals have 7 neck vertebrae; long necks have longer vertebrae, not more | VERT24 `[S]` | planned (bones as named parts, M4) |

**Vertebral formula** (cervical · thoracic · lumbar · sacral · caudal), VERT24 `[S]` unless marked:

| Species | C | T | L | S | Ca |
|---|---|---|---|---|---|
| Dog, cat | 7 | 13 | 7 | 3 | 20–23 |
| Horse | 7 | 18 | 6 (5) | 5 | 15–21 |
| Cattle | 7 | 13 | 6 | 5 | 18–20 |
| Pig `[P]` | 7 | 14–15 | 6–7 | 4 | 20–23 |
| Bird `[P]` | 13–25 | fused notarium | — | synsacrum | 5–8 + pygostyle |

Use: a tail chain or spine split into named bones gets this many segments at LOD0 (merge at LOD2).

## 2. Stance and limb segments

Three stances (DIGI `[S]`): **plantigrade** (sole, heel down: bears, humans), **digitigrade** (toes:
cats, dogs, birds), **unguligrade** (hoof tips: horses, cattle, deer). Semi-digitigrade: pigs,
hippos, elephants (DIGI `[S]`).

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Plantigrade heel down | hock and carpus within ≈ 0.07 H of the ground; sole length ≥ 1.5 × sole width | bear hind foot 21–36 cm (https://en.wikipedia.org/wiki/Brown_bear) `[S]`; ratio `[P]` | shipped: heights `[0.07, 0.06]` H |
| Digitigrade hock | hock height ≈ 0.25–0.3 H; carpus ≈ 0.12–0.15 H; carpal pad just behind the paw | tiger hock 0.25 m at H 1.0 (`recipes/amur_tiger`) `[D]`; dog `[P]` | shipped: `[0.13, 0.28]` H |
| Unguligrade hock | horse carpus ≈ 0.30 H, hock point ≈ 0.36–0.38 H; long cannon (metapodial) | horse mount proportions `[P]` | shipped: `[0.3, 0.36]` H |
| MT/F ratio | metatarsal ÷ femur length grows with cursoriality: < 0.1 (plantigrade rodents) to 1.4 (giraffe) | GJ93 range `[S]` | planned |
| MT/F by family | ursids ≈ 0.2–0.3 · felids/canids ≈ 0.35–0.55 · equids ≈ 0.6–0.7 · bovids/cervids ≈ 0.6–1.0 | skeleton mounts `[P]` (verify per species) | planned |
| Cloven hoof | artiodactyls (cattle, deer, pig) stand on two hoofed digits (III + IV) with two dewclaws (II + V) behind; equids on one (III) | cattle "walk on two toes" (https://en.wikipedia.org/wiki/Cattle) `[S]` | shipped: `family` `bovid`/`cervid`/`suid` (or `hoof: 'cloven'`) → two hoofed digits + two dewclaws; `equid` one hoof |
| Digit count | cat 5 fore (dewclaw high) / 4 hind; dog 5 / 4 (hind dewclaw rare); bear 5 / 5; bird 4 (3 forward + hallux in raptors) | Cat page `[S]`; tiger `recipes/amur_tiger/README.md`; bear, bird `[P]` | shipped: `digits` per family (canid/felid 5 / 4 with the fore dewclaw, ursid 5 / 5) |
| Pig dewclaws | wild boar's medial hooves are larger; dewclaws sit low enough to print in soft ground | https://en.wikipedia.org/wiki/Wild_boar `[S]` (hooves); dewclaw print `[P]` | planned |
| Near-vertical forearm | in a standing mammal the radius is within ≈ 10° of vertical; metatarsus within ≈ 15° | ELLEN, Muybridge plates `[P]` | shipped: kind C ≈ above E |
| Limb thickness | humerus + femur circumference (mm) for mass M (kg): log₁₀ M(g) = 2.749 log₁₀ C − 1.104 | CE12 `[S]` | shipped: kind allometry, band ×0.5–×2.5 |

## 3. Head proportions

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Craniofacial ratio | CFR = muzzle length ÷ cranial length (stop as the divider); brachycephalic dogs CFR < 0.5 | PACK15 `[S]` | planned |
| Cephalic index | skull width × 100 ÷ length; ≥ 80 brachycephalic; "almost all canidae mesaticephalic" | CEPH `[S]` | shipped as `face.width` (canid 0.56, felid 0.85) |
| Wolf skull | 230–280 mm long, 130–150 mm wide → index ≈ 0.55 | `recipes/wolf/README.md` (Wikipedia: Wolf) `[S]` | shipped: canid preset 0.56 |
| Felid muzzle | short muzzle ≈ 0.3 of head length; broad zygomatic arches; head ≈ 0.17–0.19 of head-body length (tiger skull 0.335 m ÷ HB 1.95 m) | tiger `[D]`; muzzle share `[P]` | shipped: felid preset 0.3 |
| Ungulate face | horse/cow face (orbit → muzzle) ≈ 0.6–0.7 of skull length; the eye sits behind the tooth row, in the rear third | ELLEN `[P]` | shipped: ungulate preset 0.6 |
| Boar head | head up to ⅓ of total body length | https://en.wikipedia.org/wiki/Wild_boar `[S]` | planned (preset) |
| Croc snout | snout length 1.6–2.0 × its width at the front corners of the eyes; eyes, nostrils, ears on the top of the head | https://en.wikipedia.org/wiki/Nile_crocodile `[S]` | planned |
| Ear size (canid) | wolf ear 90–110 mm ≈ 0.35–0.45 of head length; triangular, erect | `recipes/wolf/README.md` `[S]` | shipped: `face.earLength` |
| Ear mobility | horse pinna rotates up to 180°; prey species carry large mobile ears | https://en.wikipedia.org/wiki/Horse `[S]` | planned (ear pivot) |

**Eyes: orbit direction, the predator / prey rule.** Orbit convergence = angle between the orbital
rim plane and the mid-sagittal plane (90° = facing straight forward). HEESY04 `[S]`:

| Species | Orbit convergence | Binocular overlap | Source |
|---|---|---|---|
| Domestic cat | 65.4° ± 5.8 | 120° | HEESY04 |
| Dog / wolf | 50.4° ± 5.6 | 78–116° | HEESY04 |
| Horse | 24.4° ± 2.5 | 57° (≈ 65° in other sources; total field > 350°) | HEESY04; https://en.wikipedia.org/wiki/Horse |
| Cattle | not in HEESY04 | 30–50° of a ≈ 330° field | https://en.wikipedia.org/wiki/Cattle |
| Human (reference) | 79.3° | 140° | HEESY04 |

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Lid aperture faces the orbit | the normal of the eyelid opening points (90° − convergence) away from +X, in the horizontal plane: cat ≈ 25°, dog ≈ 40°, horse ≈ 65° | HEESY04 `[D]` | shipped: `face.orbit` per `family` turns the lids and rest gaze |
| Pupil shape | vertical slit: ambush predators, mostly shoulder height < 0.42 m (cats, foxes, crocodiles); horizontal: grazing prey (horse, cow, deer, goat, sheep); round: tall active / pursuit predators (wolf, dog, tiger, lion) | BANKS15 `[S]` | shipped: `face.pupil` (choice), planned check |
| Horizontal pupil stays level | grazing-prey eyes rotate (cyclovergence, up to ≈ 50°) to keep the pupil parallel to the ground when the head drops to graze | BANKS15 `[S]` | planned (pose-dependent) |
| Eye size | eye axial length scales log-linearly with body mass, slope by class; birds and primates larger, other mammals smaller | Howland et al., Vision Res. 44 (2004), https://doi.org/10.1016/j.visres.2004.03.023 `[S]` | shipped: `eyeRadius = 0.0055 M^0.2` (exponent unsourced) |

## 4. Centre of mass and weight support

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| CoM inside support | projected CoM inside the convex hull of ground contacts at every LOD | statics `[S]` | shipped: QA `balance`, `assertCentreOfMassInside` |
| Dogs front-heavy | forelimbs carry 60.4 % of standing weight (breed range 47.6–74.4 %) | DOGW `[S]` | shipped: QA `fore share` (band 0.55–0.66) |
| Horses front-heavy | forelimbs 57–60 % standing (58.6 / 41.4 in the Clayton–Hobbs review) | HORSEW `[S]` | shipped: QA `fore share` (`equid` band 0.55–0.62) |
| Fore share from CoM | fore share = (x_com − x_hind) ÷ (x_fore − x_hind), x along the body at the feet; so a dog's CoM sits ≈ 0.6 of the way from hind to fore feet | statics `[D]` | shipped: `foreShareCheck` |
| Heavy reptile tail | alligator tail ≈ 28 % of body mass; the hind limbs take a large share of support because the CoM moves back | WILLEY04 `[S]` | planned |
| Biped balance | a bird's CoM sits over the toes: trunk tilted, femur nearly horizontal, the knee hidden in the body | DIGI `[S]` (bird knee/ankle); posture `[P]` | shipped: bird skeleton |
| Mass from volume | mesh volume × density ≈ mass: flesh ≈ 1050 kg/m³; a fur shell ≈ 100 kg/m³ lowers the furred-volume density | `recipes/amur_tiger/README.md` `[D]` | shipped: QA `mass`, `effectiveDensity` |

## 5. Muscle masses that shape the silhouette

The silhouette of a mammal is read from a handful of masses over the bones (ELLEN `[P]`). Check
each from the side view (`t3d shot`), at raking light (`t3d hero`).

| Mass | Where (side view) | Silhouette cue | ts23d |
|---|---|---|---|
| Brachiocephalicus / neck | from the point of the shoulder to the skull | the lower neck line runs to the shoulder point, not to the chest centre | shipped (neck tube) |
| Trapezius + rhomboids | over the scapula top | withers bulge; a bear's shoulder hump is muscle (digging) (https://en.wikipedia.org/wiki/Brown_bear `[S]`) | partial (`build.ruff`) |
| Deltoid + triceps | behind/above the elbow, upper arm | triangular mass filling the angle between scapula and forearm | shipped |
| Forearm extensors / flexors | top third of the forearm | forearm tapers to a slim carpus; cats heavier (grappling) | shipped |
| Abdominal tuck | flank in front of the thigh | waist depth ÷ chest depth: wolf 0.66, greyhound much lower, cattle ≈ 1 | shipped: `build.tuck` |
| Gluteals | croup | rounded croup; horse quarters highest muscle mass | shipped (croup mass) |
| Quadriceps / hamstrings | thigh front / behind | the "breeches"; hamstrings reach down to the upper tibia | shipped |
| Gastrocnemius → Achilles | behind the tibia to the hock | calf tapers to a cord-thin tendon above the hock | shipped |
| Masseter + temporalis | cheek, crown | predator head widest at the zygomatic arches; tiger sagittal crest 27–46 mm | `recipes/amur_tiger/README.md` `[S]` |

## 6. Joint ranges of motion (for pivots and baked motion)

Passive maximum flexion / extension, French Bulldogs (FORM19 `[S]`; the paper reports shoulder,
carpal and tarsal flexion close to the Labrador values of Jaegger 2002). Angles are the inside
angle between the bone axes (180° = straight).

| Joint | Flexion | Extension | Range |
|---|---|---|---|
| Shoulder | 51° | 160° | 109° |
| Elbow | 50° | 175° | 125° |
| Carpus | 32° | 204° (hyperextends past straight) | 172° |
| Hip | 58° | 180° | 122° |
| Stifle | 58° | 173° | 115° |
| Tarsus (hock) | 40° | 188° | 149° |

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Hinge axes | elbow, carpus, stifle, hock flex about the lateral (Y) axis only; the shoulder and hip add small ab/adduction | anatomy `[P]` | planned (pivot axes in M4) |
| Opposite bends | fore: elbow flexes with the forearm going *back*, carpus folds *back*; hind: stifle flexes with the tibia going *back*, hock folds *forward* | ELLEN, Muybridge `[P]` | shipped (joint order); motion planned |
| Jaw gape | carnivores open wide (big cats ≈ 70°+); a rest pose shows 0–5° | `recipes/amur_tiger` rest 2.5° `[S]`; max `[P]` | shipped: jaw `sway` |
| Stay within ROM | baked motion keeps every joint inside its flexion–extension range above | FORM19 `[S]` | planned |

## 7. Gaits for baked motion

Definitions (HILD89 `[S]`): **duty factor** = fraction of the stride a foot is on the ground;
> 0.5 walk, < 0.5 run. **Phase** = fraction of the stride by which the fore foot follows the hind
foot on the same side. **Symmetrical** gaits alternate left and right of a pair (walk, trot,
pace); **asymmetrical** gaits move a pair together and have a suspension (canter, gallop, bound).

| Gait | Footfall order (left hind = 0) | Beats | Duty factor | Source |
|---|---|---|---|---|
| Walk | LH → LF → RH → RF, two or three feet down, no suspension | 4 | > 0.5; slow walks ≈ 0.8 | HGAIT, HILD89, US17 `[S]` |
| Trot | diagonal pairs (LH + RF, RH + LF) together | 2 | ≈ 0.3–0.5 `[P]` | HGAIT `[S]` |
| Pace | lateral pairs (LH + LF, RH + RF) together | 2 | as trot `[P]` | HGAIT `[S]` |
| Canter | 3-beat; lead named by the leading leg | 3 | < 0.5 | HGAIT `[S]` |
| Transverse gallop | fore lead on the same side as the hind lead; horses at every speed | 4 | < 0.5 | HILD77 `[S]` |
| Rotary gallop | fore lead on the opposite side; cheetah, racing dogs at speed | 4 | < 0.5, two suspensions (gathered, extended) `[P]` | HILD77 `[S]` |
| Crocodile high walk | belly lifted, diagonal-sequence walk; small animals can gallop | 4 | ≈ 0.7 symmetrical, ≈ 0.5 asymmetrical | https://en.wikipedia.org/wiki/Nile_crocodile; Renous et al. 2002 via https://pmc.ncbi.nlm.nih.gov/articles/PMC4262343 `[S]` |

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Even walk timing | lateral-sequence walk: LF at phase ≈ 0.25, RH 0.5, RF 0.75 of the cycle (real animals vary, phase ≈ 0.15–0.5) | HGAIT order `[S]`; spacing `[P]`; variation US17 | planned |
| Froude number | Fr = v² ÷ (g · hip height); walk below ≈ 0.5, amble → trot ≈ 1, asymmetrical gaits at Fr 2–3 | AJ83 `[S]` | planned |
| Stride frequency | at equivalent speeds f ∝ M^−0.15: big animals step slower | HT88 `[S]` | planned |
| Horse speeds | walk ≈ 6.4–7 km/h · trot 13–19 · canter 16–27 · gallop 40–48 | HGAIT, https://en.wikipedia.org/wiki/Horse `[S]` | reference |
| Loop length | a baked locomotion clip is one stride (1 ÷ f s) and loops seamlessly | engine practice `[P]` | planned (clips today: sway/spin) |

## 8. Surfaces: fur, feathers, scales

| Rule | Measurable definition | Source | ts23d |
|---|---|---|---|
| Fur longest on top and nape | winter wolf: back 60–70 mm, shoulders ≤ 90, crest 110–130 mm | `recipes/wolf/README.md` (Wikipedia: Wolf) `[S]` | shipped: `coat`, `build.ruff` |
| Belly and throat fur in cold coats | Amur tiger winter: back 40–50 mm, nape 70–110, throat 70–95, chest 60–100, belly 65–105 | `recipes/amur_tiger/README.md` (Geptner & Sludskij) `[S]` | recipe-local |
| Typical big-cat fur | tiger fur up to 35 mm; Siberian up to 105 mm; belly hair longer than back | https://en.wikipedia.org/wiki/Tiger `[S]` | reference |
| Shortest on face and legs | bristles shortest on face and limbs, longest along the back (boar mane) | https://en.wikipedia.org/wiki/Wild_boar `[S]` | partial (zones) |
| Countershading | darker dorsal, paler ventral (wolf saddle, tiger white underside) | species pages `[S]` | shipped: coat zones |
| Primaries | 9–11 in non-passerines (11 attach to the hand, outermost often vestigial); most passerines 10 | FEATH `[S]` | planned (feather cards) |
| Secondaries | 6 (hummingbirds) to 40 (albatrosses); eagles lack the 5th secondary | FEATH `[S]` | planned |
| Tail feathers | rectrices paired, most species 12 (6 pairs) | FEATH `[S]` | planned |
| Covert layering | at least one layer of coverts over the flight feathers above and below, and over the tail | FEATH `[S]` | planned |
| Snake ventrals | one enlarged ventral shield per vertebra (except some burrowing blind snakes) | SNAKE66 `[S]` | planned |
| Croc armour | rows of ossified dorsal scutes down back and tail; a double crest on the tail becomes single where it narrows; small oval osteoderms on flanks and throat | Nile crocodile page; Bouwman & Cronje 2016 https://koedoe.co.za/index.php/koedoe/article/view/1351 `[S]` | planned |
| Scale grading | scale size grades large dorsal → small lateral band → transverse ventral plates; small scales at folds and joints | `docs/research/stylised-creatures.md` `[S]` | partial: `tex.scales` |

## 9. Checks these rules make possible (none shipped unless marked)

1. **Fore-share** from the compiled CoM and the feet: dog/canid 0.55–0.66, horse 0.55–0.62
   (DOGW, HORSEW).
2. **Orbit direction**: eye aperture normal vs +X within ± 10° of (90° − convergence) for the
   declared family (HEESY04).
3. **Pupil-shape consistency**: grazing prey → horizontal; ambush predator below 0.42 m → slit
   (BANKS15).
4. **Joint ROM**: every baked clip keeps joints inside section 6.
5. **Gait phase**: a walk clip's foot contacts follow LH → LF → RH → RF with duty factor > 0.5.
6. **Digit count / cloven hoof** per family (section 2).
7. **Landmark heights**: elbow at brisket ± 5 % H; hock and carpus heights within the stance band.

Shipped today: `allometry` and wing loading (`creature-biology.ts`), QA `balance`, QA `mass`,
`measures` (± 2 %), `assertCentreOfMassInside`, `assertUprightOnGround`, `assertLodSilhouette`.

## 10. Do not

- Copy a named creature from any game, film or book; borrow anatomy from real animals only.
- Treat a `[P]` row as a hard gate before checking it against a sourced mount or photo.
- Mix stances on one animal without a reason (a digitigrade fore with plantigrade hind reads as a
  bear-dog collage).
