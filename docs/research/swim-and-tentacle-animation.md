# Swimming, tentacles and long bodies: motion as numbers

**Research as of 2026-11-18. Fish, sharks, eels, snakes, hydra necks and octopus arms can all be baked by one
TypeScript generator: a chain of bones posed from fields along arc length (curvature, twist, stretch) that are
functions of `(s, t)`. Only the driver changes: a travelling wave for fish and snakes, a travelling bend pulse for
octopus reaching, a delayed head path for necks. The best-supported targets are Strouhal number 0.2 to 0.4 (median
0.29), stride about 0.7 body lengths per tail beat, tail peak-to-peak amplitude about 0.2 body lengths, and a wave
faster than the body (slip 0.57 to 0.78 in eels). Speed is changed through frequency, with tail swing and wavelength held (an eel's envelope also steepens): across 44 fish species
speed correlates with tail-beat frequency (r = 0.95) and hardly at all with amplitude or wavelength. Build a shark
first. It proves the generator and the swim checks on the best evidence, with no ground contact to solve.**

**How to read the evidence.** Every source in [Sources](#sources) carries an access grade: **F** full text opened,
**A** abstract only, **S** search-result snippet only (page not opened). **[D]** means derived here from cited numbers,
with the arithmetic shown or reproduced in [Numeric checks](#8-numeric-checks-run-for-this-document). *(unverified)*
marks anything without a source. *(design)* marks a choice of ours that no paper prescribes. The checks shipped
since this was written are the QA gates `swim` and `chain-cross` and `T3D_DEFORM_TWIST`; any other check named here is
still a proposal. Tolerances labelled *(design)* are starting values to tune against real assets.

## 0. The shared model

### One pose function
A chain has rest length `L`, arc position `s` in `[0, 1]` (head or base 0, tail or tip 1), `n` links.

| Field | Meaning | glTF channel |
|---|---|---|
| `kn(s,t)` | curvature in the main bending plane (rad per body length) | joint rotation |
| `kb(s,t)` | curvature out of that plane | joint rotation |
| `tw(s,t)` | twist rate about the chain axis | joint rotation |
| `e(s,t)` | axial strain, 0 = rest length | child joint translation |
| `r(s,t)` | radius factor; constant volume gives `(1 + e)^(-1/2)` [D] | joint scale, or none (see [section 6](#6-delivery-in-game-assets)) |

Joint `i` turns by the field integrated over its link. This is a discrete rod, the representation used for octopus arm
models ([W22]: curvature, stretch and shear along a rod) and for snakes ([H09] prescribes body shape as curvature
`k(s,t)`). Links keep their length unless `e` says otherwise, so the body never stretches by accident, which a
per-vertex sideways offset does. Output is ordinary keyframes, so it fits ts23d's rule that motion is baked at build
time and never solved in the engine.

### Drivers
| Driver | Field it writes | Used by |
|---|---|---|
| `travellingWave` | `y(s,t) = A(s) sin(2π(s/λ − f t))`, converted to `kn`, or `kn` directly | fish, sharks, eels, snakes, fin edges, rays |
| `orthogonalWaves` | two waves, `kn` and `kb`, 90° apart | sidewinding |
| `bendPulse` | a curvature bump whose centre `c(t)` runs base to tip, plus `e` behind it | octopus reach, tentacle whip |
| `followPath` | heading at `s` equals head heading at `t − s/U` | hydra necks, snake on a path, eel in a turn |
| `hingeGroups` | curvature collapsed into a few moving joints | octopus fetch |
| `radialPulse` | not a chain: ring radius against time | squid mantle, jellyfish bell, gills |

### Rules shared by every looping clip
| Rule | Statement | Basis |
|---|---|---|
| Wave direction | phase falls with `s` at fixed `t`, so crests run head to tail | [DS21], [T04] |
| Seamless loop | clip length `T = m / f` for integer `m`. Wavelength needs no fit: `λ` can be any number, only time must close | [D] |
| Secondary motion | every other periodic track uses `f_j = m_j / T` with integer `m_j`; round the biological ratio to the nearest integer | [D] |
| Recoil | subtract the chain's mass-weighted lateral mean each key. Without it the prescribed midline's centre of mass swings 2.8 % of `L` peak to peak | [D], sim 3 |
| Key density | 12 to 16 keys per wave cycle keep slerp error under 0.5° for a 15° joint | [D], sim 4 |
| Size scaling | never copy absolute seconds across sizes. Use the frequency bands in section 1, or `t = sqrt(2d/a)` for strikes | [SR23], [D] |

## 1. Fish and sharks

### Rig anatomy that matters
| Part | Fact | Rig consequence |
|---|---|---|
| Axial body | Amplitude grows slowly over the front third and fast behind midbody; the maximum is at or beyond 90 % of length [DS21] | Put links where the amplitude changes: dense toward the tail, sparse at the head *(design)* |
| Swimming "modes" | Anguilliform to thunniform are poor descriptors of the kinematics; species sit on a continuum, and head amplitude is highest in eels **and** tuna [DS21] | Parameters, not a four-value enum |
| Shark body | Leopard shark is subcarangiform [DS03]. Many sharks are classed so by wavelength and amplitude [LD15] | Default shark = trout-like wave on a stiff-looking body |
| Heterocercal tail | Moves in a complex three-dimensional way [LD15]; sheds tilted vortex rings, jet about 30° below horizontal in leopard and bamboo sharks [WL02] | Two lobe chains with independent phase, not one flat plate |
| Pectoral fins | In steady swimming, cambered at negative angle of attack with no significant predicted lift; vortices only in vertical manoeuvres, started by flipping the rear of the fin [WL00] | Nearly still in `cruise`; they act in `rise` and `sink` |
| Jaw | Upper jaw protrusion is 18 % of head length in the lemon shark and 30 % in spiny dogfish [WM98]. In the lemon shark, protrusion belongs to the **compressive** phase and supplies 26 % of the gape distance during closure [M97] | Separate upper-jaw bone; it moves forward while the mouth closes |

**Sources disagree on the shark tail.** The classical view is lift that pitches the head down, and 3D tail
kinematics supported it (Ferry and Lauder 1996, as summarised in [LD15]); later wake data argue the tail directs force
through the centre of mass [WL02]. For animation this does not change the bone motion, so build the shape and do not fake a pitch oscillation
from it. Also, [LD15] says many sharks have "less than a half wavelength" on the body, while [DS21] measures about one
wavelength per body for non-anguilliform fish including three cartilaginous species. Prefer the measured [DS21] range
until a shark-specific midline dataset is opened.

### Motion model
```text
y(s,t) = A(s) sin(2π(s/λ − f t))                     s, y, λ in body lengths
A(s)   = ½ (0.05 − 0.13 s + 0.28 s²)                 all-fish fit of peak-to-peak amplitude [DS21]
A(s)   = A_tail exp(α(s − 1))                        eels, α from 3.90 slow to 2.25 fast [T04]
heading(s,t) = atan(∂y/∂s),  joint_i = heading_i − heading_(i−1)
U = S f L;   V = f λ L;   slip = U/V = S/(λ/L);   St = f·App/U = (App/L)/S
```
`App` is peak-to-peak tail excursion. Watch the definition: [DS21] uses peak-to-peak, [T04] reports half-excursion and
writes St as `2fA/U`. The two agree once converted.

### Parameters
| Quantity | Value | Source |
|---|---|---|
| Strouhal number | 0.2 to 0.4 in cruising swimmers and fliers | [TNT03] |
| Strouhal, 44 fish species | range 0.15 to 0.82, median 0.29, IQR 0.24 to 0.35 | [DS21] |
| Strouhal, American eel | 0.324 ± 0.003, no significant change with speed | [T04] |
| Tail amplitude | peak-to-peak median 0.18 L, IQR 0.15 to 0.21 | [DS21] |
| Tail amplitude, cross-taxon | about 0.2 L, tadpoles to whales | [SR23] |
| Tail amplitude, white shark | 0.24 ± 0.10 BL | [DG25] |
| Head amplitude | median 0.03 L, IQR 0.02 to 0.05 | [DS21] |
| Wavelength at about 1 BL/s | eel 0.58, trout 1.00, mackerel 0.96, tuna 1.17 L | [DS21] |
| Wavelength, group medians | anguilliform 0.75, subcarangiform 0.93, thunniform 1.14 L; some species SD about 0.2 L | [DS21] |
| Wavelength, eel | 0.597 ± 0.005 L, up to 30 % difference between individuals | [T04] |
| Stride | `U = 0.7 L f` | [SR23] |
| Stride, older figure | 0.6 to 0.8 L per beat, attributed to Bainbridge | [W75] |
| Stride constancy | stride length and tail amplitude, as fractions of L, constant across speed | [VW91] |
| Slip U/V, eel | 0.57 ± 0.01 slow to 0.784 ± 0.002 fast | [T04] |
| Slip, trout and saithe | about 0.6 to 0.83 | [CB94] |
| Speed correlations | tail-beat frequency r = 0.95; head amplitude 0.08, max amplitude 0.18, wavelength 0.03, curvature 0.02 | [DS21] |
| Frequency against size | slow bound `f0` 1.9 ± 0.2 Hz, fast bound 22 ± 3 Hz at small size; above the crossover (`Lc` 1.3 ± 0.6 m slow, 0.4 ± 0.2 m fast) `f ≈ c/L` with `c` about 2 m/s slow, 9 m/s fast | [SR23] |
| Mako | cruise 0.90 m/s at 0.51 Hz; burst 5.02 m/s at 3.65 Hz, 2 m female | [W23] |
| White shark | 0.43 ± 0.07 Hz | [DG25] |
| Whale shark, 4 and 7 m | median 0.35 to 0.65 Hz, 0.58 to 0.81 m/s | [FM15] |
| Shark body tilt | 11° at 0.5 L/s falling to 0.6° at 2.0 L/s, leopard shark | [WL00] |
| Shark red-muscle strain | ±3.9 % (0.42 L), ±6.6 % (0.61 L), ±4.8 % (0.72 L), in phase with curvature, at about 1 L/s; a bending-beam model matches | [DS03] |
| Fast start, stage 1 (*Hoplosternum*, 12 to 13 cm) | escape 20.8 to 108.3 ms, mean 51.6 ms, 11° to 194°, mean 77.2° | [D15] |
| Routine turn, same fish | 150 to 550 ms, mean 225.7 ms, mean 51.5° | [D15] |
| Shark fast start | C-start like teleosts, but slower and more variable (spiny dogfish) | [LD15] |
| Lemon shark bite | strong bites average 176 ms | [M91] |
| White shark bite sequence, 3.5 m | 0.75 to 1.71 s, mean about 0.99 s (secondary summary) | [TM] |

**Cross-checks [D].** The numbers agree with each other. [DS21] medians give stride `0.18/0.29 = 0.62`. [SR23] gives
`St = 0.2/0.7 = 0.286`, on the [DS21] median. The mako burst gives stride `5.02/(3.65 × 2) = 0.69`. The eel gives
stride 0.43 and slip 0.72, inside [T04]'s measured slip range. **One conflict:** a 2 m mako cruising at 0.51 Hz sits
below the [SR23] slow band value of `2/2 = 1.0 Hz` (assuming the cruising animal is near the 2 m quoted for the burst),
so treat the slow bound as guidance and do not fail a large cruising shark on it.

### Bones and LOD
From sim 1: uniform links, `λ = 0.95`, error against the continuous midline.

| Links | RMS error (% L) | Tail p-p (L) | Peak joint angle |
|---|---|---|---|
| 3 | 1.03 | 0.210 | 33.8° |
| 4 | 0.58 | 0.199 | 34.4° |
| 6 | 0.35 | 0.190 | 30.2° |
| 8 | 0.30 | 0.187 | 25.7° |
| 16 | 0.25 | 0.184 | 15.1° |

The error floor near 0.24 % is arc length against straight-line `x`, not resolution. Length-keeping chains land about
8 % under the nominal tail amplitude, so **scale the envelope until the measured tail excursion hits the target.**

| LOD | Spine links | Fins and head | Total joints *(design)* | Triangles *(design)* |
|---|---|---|---|---|
| 0 | 14 to 16, denser aft | caudal 2 lobes × 3, pectoral 2 × 2, dorsal 2, jaw 2, gills as morphs | about 32 | thousands |
| 1 | 8 | caudal 2 × 2, pectoral 2 × 1, jaw 1 | about 15 | about 1,500 |
| 2 | 4 | one caudal joint, pectorals rigid on the body | 5 to 6 | 6 sections × 8 sides × 2 = 96, plus caps and fins, about 150 to 200 |

The joint angle grows as links fall, so low LODs need wider skin blends. A 34° bend at a 50/50 blend keeps about 91 % of
the section area by the formula in [section 6](#6-delivery-in-game-assets) [D].

### Clips
| Clip | Definition | Loop |
|---|---|---|
| `idle` | Ram-ventilating sharks keep swimming, so a slow `cruise`. Pumping species and bottom fish hover with fin sculling and gill motion | yes |
| `cruise` | St about 0.29, stride 0.7, frequency from size band | yes |
| `burst` | **only** `f` raised; λ and App held (eels: lower α too) | yes |
| `turn_l/r` | constant `kn` bias added to the wave; root yaw matched | yes |
| `cstart_l/r` | stage 1 single-sided bend to a C, stage 2 opposite bend, then swim; times scaled from [D15], slower for sharks | no |
| `rise`, `sink` | pectoral rear edge flips, then body pitch changes [WL00] | short |
| `bite` | snout up, jaw down, then upper jaw forward **during closure** [M97] | no |
| Gills | Morphs. Rates were not found in any opened source *(unverified)*; ram species do not pump while swimming, buccal pumpers do at rest [CI17]. Gape may widen with speed, then narrow (preliminary) [UD] | integer multiple |

Schools come from the engine: one looping clip, a different start time per instance. No baked school is needed.

### Common mistakes and their checks
| Mistake | Check | Pass range | Source |
|---|---|---|---|
| Tail waves too fast or too slow for the speed | `St = f·App/U` in `cruise` | 0.20 to 0.40; aim 0.24 to 0.35 | [TNT03], [DS21] |
| Body slides, or swims without enough beat | `S = U/(fL)` | 0.40 to 0.80 (eel 0.43 [D], others 0.6 to 0.8) | [SR23], [W75], [T04] |
| Wave no faster than the body, so no thrust | `slip = U/V` | 0.50 to 0.90, always below 1 | [T04], [CB94] |
| Standing wave: everything flips together | phase at `s` falls monotonically; total lag equals `1/(λ/L)` cycles ±10 % *(tolerance: design)* | monotone | [DS21] |
| Wrong number of waves | `λ/L` | 0.55 to 0.80 eel-like; 0.75 to 1.25 others | [DS21], [T04] |
| Flat or front-heavy envelope | amplitude maximum at `s ≥ 0.9`; head:tail 0.02 to 0.35 [D]: exp(−α) from [T04] gives 0.02 to 0.105, [DS21] IQR ratios give 0.095 to 0.33 | as stated | [DS21] |
| Tail too big or small | tail `App/L` | 0.15 to 0.24 | [DS21], [SR23], [DG25] |
| Speed raised by exaggerating the swing | `burst` against `cruise`: `App` and λ within ±15 % *(design)*, f carries speed | ratio | [DS21], [VW91] |
| Whole body swings about its middle | world lateral centre of mass p-p ≤ 0.5 % L *(design)* | after recoil | [D] sim 3 |
| Impossible flesh strain | `κ·d ≤ 0.066`, `d` = distance of red muscle from the midline, about the local half-width *(assumption)* | per station | [DS03] |
| Shark rocks on its fins at cruise | pectoral rotation amplitude ≤ 3° in `cruise` *(design)* | small | [WL00] |
| Jaw shoots out on opening | upper-jaw protrusion peak comes after peak gape starts closing | ordered | [M97] |
| Jaw too far | protrusion ≤ 30 % head length; species default near 18 % | bound | [WM98] |
| Clip pops at the seam | pose(0) = pose(T) within 1e-4, as `bakeSprings` | seam | repo |

## 2. Octopus and squid

### Octopus anatomy for the rig
| Fact | Value | Source |
|---|---|---|
| Structure | Muscular hydrostat. Four elementary movements anywhere on the arm: elongation, shortening, torsion, bending | [Z13] |
| What arms do (*O. bimaculoides*, 16,563 observed deformations) | bending 11,074, elongation 2,723, torsion 1,426, shortening 1,340; every deformation in every arm | [K20] |
| Regional use | proximal third bends less and shortens or elongates more; distal region bends most | [K20] |
| Twist | both directions almost equally: clockwise 739, counter-clockwise 687 | [K20] |
| Front against rear arms | anterior pairs bend about 3× as often (8,227 against 2,847) | [K20] |
| Arm length | 70 to 85 % of total length (*O. vulgaris*) | [NS] |
| Arm shape | thicker at the base, tapering uniformly to the tip | [K20] |
| Suckers | two rows on *O. vulgaris* arms [NS]; juveniles of 6 mm mantle have 20 to 26 per arm [NS]. Adult counts near 200 to 250 per arm appear only in unopened search results *(unverified)* | |

[K20] did **not** measure degrees, strain or curvature, so no twist or bend magnitudes come from it.

### Reach, fetch, crawl
| Behaviour | What the arm does | Numbers | Source |
|---|---|---|---|
| Reach | A bend travels from base to tip. The bend moves in nearly one plane on a slightly curved path from body to target | about 70 % of reaches share one tangential velocity profile, invariant when velocity and distance are normalised | [G96] |
| Velocity shape | bell-shaped bend-point speed, near-constant curvature in the travelling region | shape only | [W25] |
| Duration | straight bend-propagation reaches | 2.4 ± 1.3 s | [R15] |
| Control | activation amplitude and travel time fully specify the modelled reach | 2 parameters | [Y05] |
| Elongation in reach | section from base to bend lengthens; mean strain along the arm from −0.12 to 1.8 at movement end | 0.57 ± 0.41 (n = 64); 0.64 ± 0.28 (n = 30) | [H15] |
| Second reach type | the bend starts distal; the reach is mainly elongation and straightening behind it | qualitative | [H15] |
| Fetch to mouth | arm becomes quasi-articulated around **three dynamic joints**; two muscle waves collide and the collision sets the medial joint; invariants are at joint level | no segment ratio read | [S06] |
| Crawl | any direction regardless of body orientation; body and crawl headings independent; **no rhythmic limb pattern**; thrust by pushing-by-elongation | qualitative | [L15] |

### Motion model
```text
c(t)      = minimum-jerk from 0 to 1 over the reach       (design: gives the bell speed, peak 1.875 × mean)
kn(s,t)   = K exp(−½((s − c)/w)²) + curl(s) for s > c      (bump, plus unfurled curl ahead of it)
e(s,t)    = E(t) for s < c,   0 beyond                     (proximal elongation, E from [H15])
tw(s,t)   = small seeded twist, either sign                (K20 gives frequency, no magnitude)
r(s,t)    = (1 + e)^(−1/2)
```
Constant volume gives radius factors 1.07 at strain −0.12, 0.80 at 0.57, 0.78 at 0.64, 0.60 at 1.8 [D].

**Links needed.** A travelling bend needs resolution everywhere because it visits every point:
`n ≥ K/Δθmax`, with `K` peak curvature in rad per arm length. For the test pose in sim 7 (bump `K = 12`, `w = 0.06`, plus
a curl), tip error against a 2,000-link reference was 20.6 % at 8 links, 9.7 % at 16, 5.6 % at 24, 4.9 % at 32. Real peak
curvature was not obtained from an opened paper *(unverified)*, so this is a resolution rule and not a biological value.
Widen the bump as links fall: keep `w ≥ 1.5/n` *(design)*.

| LOD | Links per arm | Arm joints (× 8) | Other | Triangles *(design)* |
|---|---|---|---|---|
| 0 | 20 to 24, with arm-tip links shorter | 160 to 192 | mantle ring 6 to 8, funnel 2, eyes 2 | Suckers instanced on the skin, two nearest joints |
| 1 | 10 to 12 | 80 to 96 | mantle 4 | suckers in the normal map |
| 2 | 5 | 40 | mantle 1 to 2 | 8 × 5 × 4 × 2 = 320 for arms plus a mantle of about 100; 3-sided distal sections save about 80 |

Tutorial-scale game tentacles use about 12 to 15 bones per chain [AW]. Film octopus rigs layer FK and IK on a spline and
lock tentacle sections for walking [DW], which is the same "plant part of the arm" problem as crawl.

### Clips
`idle` (slow seeded curl fields), `reach_<arm>` (bend pulse), `fetch` (three-joint fold), `crawl` (seeded recruitment,
see below), `jet` (arms trail together, mantle pulse), `flinch`, `colour_*` (optional). Keep `crawl` truly aperiodic in
structure: choose a seeded recruitment schedule inside one looped clip. A repeating walk pattern is the specific thing
[L15] rules out.

### Common mistakes and checks
| Mistake | Check | Pass | Source |
|---|---|---|---|
| Arm waves from the base like a rope | curvature peak position moves monotonically to the tip | `dc/dt ≥ 0` | [G96] |
| Linear bend speed | normalised bend speed is single-peaked with its peak in the middle third | bell | [G96], [W25] |
| Arms crawl like eight legs | no pair of arms has a stable phase across cycles; recruited arms sit toward the travel direction's rear and elongate | autocorrelation low *(design)* | [L15] |
| Rubber stretching | section volume `r²(1 + e)` within 2 % of rest *(design)* | constant | [Z13] |
| Stretch beyond biology | mean arm strain in `[−0.12, 1.8]`; typical 0.3 to 0.9 | range | [H15] |
| Candy-wrapper arms | twist per joint ≤ 45.6° for at least 85 % section area at a 50/50 blend | sim 5 | [D] |
| Self-intersection | no two non-adjacent arm capsules overlap, except an allowed contact list | `clashes` swept | repo |
| Rigid proximal arm | proximal third does the length change, distal third the bending | counts | [K20] |

### Squid
| Quantity | Value | Source |
|---|---|---|
| Jet cycle | hyperinflation (radial muscles), jet (circular muscles), largely elastic refill | [G83] |
| Escape: mantle contraction | average maximum −40 % of resting diameter in hatchlings to −30 % in the largest studied | [TK01] |
| Escape: hyperinflation | +18 % hatchlings to +9 % largest | [TK01] |
| Peak contraction rate | 8.6 to 3.8 mantle circumference lengths per second | [TK01] |
| Jet period, *Lolliguncula brevis* 3.3 to 9.1 cm | 0.62 ± 0.06 s (mode I), 0.70 ± 0.04 s (mode II) | [B09] |
| Fin beat, same animals | 2.23 ± 0.42 and 1.51 ± 0.54 beats/s | [B09] |
| Jet angle | mean 28° to 41° by size class | [B09] |
| Adult *Loligo pealei*, 27 cm mantle | swims 0.33 to 2.06 mantle lengths/s; jet 0.90 to 2.98, always faster than the animal | [AG05] |

Rig: mantle as a morph or a ring of joints (`radialPulse`), head moving against it, fins with `travellingWave` along
their base. Loop [D]: 2.23 × 0.62 = 1.4 and 1.51 × 0.70 = 1.1 fin beats per jet, so use 1 fin beat per jet at low detail,
2 per jet for a busier look. Ten limbs at LOD2: two long tentacles at 3 links, eight arms at 2. Checks: mantle diameter
within −40 % to +18 % [TK01]; arms trail the body in `jet`; root speed below jet speed [AG05]. The split between
contraction and refill time was not found *(unverified)*, so do not gate it.

### Skin colour
glTF morph targets may carry `COLOR_n` displacements [GLTF], so a chromatophore flush can be a morph on vertex colour
with no new material. Engine support for colour morphs was not verified *(unverified)*.

## 3. Hydra and many-necked creatures

No real animal exists, so each rule borrows from long necks, snakes and plain mechanics.

| Topic | Data | Source | Use |
|---|---|---|---|
| Neck flexibility | Ostrich with muscles intact: C3 to C6 dorsal 12° to 19°; C7 to C11 up to 25.6°; C12 to C15 13° to 15°; ventral maximum 15.6° | [C13] | Per-vertebra limits; a game bone spanning `m` vertebrae gets `m ×` limit |
| Neck zones | three sections: slightly flexible near the head, most flexible in the middle, stiff at the base | [C13] | Taper the curvature envelope |
| Soft tissue | more neck muscle reduces flexibility | [C13] | Thick necks get tighter limits |
| Vertebra count | 19 cervicals in *Mamenchisaurus*; mammals 7 | [TW13] | Believable bone count |
| Strike | rat snake and vipers: mean acceleration about 190 m/s², peak 279 m/s²; speed 2.67 to 2.98 m/s; rat snake 16.7 cm in 74 ms; cottonmouth 13.6 cm in 66 ms | [P16] | Strike timing |
| Attention | no published multi-head data found | | *(design)* |

### Motion model
```text
followPath:  heading(s,t) = H(t − s·L/U)                 the neck follows where the head has been
strike:      t_strike ≥ sqrt(2 d / a), a ≤ 190 m/s²      [D from P16]; d = 1.5 m gives 126 ms at least
recoil:      Δx_body = −(Σ m_i Δx_i) / M_body            centre of mass stays put in a strike [D]
phase:       neck i uses integer frequency m_i, phase φ_i from the seed
```
`followPath` needs few links: sim 8 gave maximum deviation from the head's path of 1.20 % L at 4 links, 0.30 % at 8,
0.13 % at 16 (smooth test path). Large creatures should be slower than the acceleration bound: muscle limits at size were
not verified *(unverified)*.

### Hydra specifics *(design, no biological source)*
- **Staggered attention.** One head leads at a time. It looks first; its neck follows along `followPath`; the others idle
  with phases from the seed, so no two necks move in step.
- **No braids.** Keep each neck's angular order around the shoulder through the clip. Pairwise crossing count in the top
  view stays zero unless a clip declares otherwise.
- **Anticipation.** The strike opens with the neck drawn back into an S, so stored length pays out as reach.
- **Weight.** The body counter-shifts and the planted feet stay locked. The existing quadruped gait and foot-lock rules
  apply to the body, with necks added to the mass model.

| LOD (five necks) | Links per neck | Total neck joints | Triangles *(design)* |
|---|---|---|---|
| 0 | 12 to 16 + jaw + 2 eyelids | 75 to 95 | as authored |
| 1 | 6 to 8 + jaw | 35 to 45 | about 2,000 |
| 2 | 4 | 20 | necks 5 × 4 × 4 × 2 = 160, heads 5 × 24 = 120, body about 120: about 400 |

Clips: `idle`, `look_<head>`, `strike_<head>`, `roar`, `recoil`, body gaits layered with neck idle.

| Mistake | Check | Pass | Source |
|---|---|---|---|
| Necks intersect | capsule distance ≥ sum of radii + clearance, every frame | no overlap | repo `clashes` |
| Necks braid | crossing count in the top view | 0 | *(design)* |
| Bones bend past anatomy | per-vertebra-equivalent angle | dorsal ≤ 25.6°, ventral ≤ 15.6° | [C13] |
| Necks in sync | pairwise correlation of head position | absolute value below 0.7 *(design)* | |
| Strike too fast for its size | peak acceleration | ≤ 279 m/s², target about 190 | [P16] |
| Body ignores the strike | centre of mass stays inside the support polygon; body moves opposite the necks | inside | [D] |

## 4. Snakes and eels

**Eel.** A fish with `λ = 0.6`, exponential envelope, `α` from 3.90 to 2.25 as speed rises, tail half-excursion near 0.07 L
[T04]. In eels amplitude tended to rise with speed at every point, fastest at the head [T04], while [DS21] finds little
speed effect across species, so let α fall with speed for eels only.

| Mode | Kinematics | Numbers | Source |
|---|---|---|---|
| Lateral undulation | all points move at once with sliding contact; left and right bends propagate along the whole body | lab snakes: wavelength 0.4 ± 0.1 L, amplitude 0.1 ± 0.03 L, speed 0.22 ± 0.08 L per period, bursts about 0.4 | [J20], [H09] |
| Contact | weight concentrates near points of **zero** curvature; the snake lifts elsewhere | qualitative | [H09] |
| Sidewinding | horizontal and vertical waves, ±90° apart; static contact patches, lifted sections between | differential turn 26° per cycle, reversal 89° by shifting the vertical phase 180° | [A15] |
| Sidewinding on slopes | contact length grows with incline | qualitative | [M14] |
| Sidewinding speed | cycle frequency is the strong speed predictor; amplitude allometric in adults | | [T22] |
| Concertina | head-to-tail distance changes substantially as sections flex and extend | qualitative | [J20] |
| Rectilinear | **no** axial bending; skin moves relative to the skeleton | qualitative | [NJ18], [J20] |

[J20] argues for 11 gaits rather than four. Ship the four familiar clips, named by what they do.

**Model.** [H09] drives shape with `k(s,t) = α cos(kπ(s + t))`, `α = 7`, `k = 2` (dimensionless). Note a mismatch with its
own measurements: this curve puts one wave in one arc length, with mean `cos(heading) = 0.71` [D], so one wave spans
0.71 L along the travel axis, against the 0.4 L measured. Use the measured wave for gates and treat the curve as a
starting shape. On flat cloth `U/V = 0.22/0.40 = 0.55` [D], so a snake there slips a lot. A snake pushing along a fixed
channel should approach `U/V = 1` *(unverified)*, which is `followPath`.

**Rig.** Bones per wave matter more than bones per body. With 2.5 waves per body (`λ = 0.4`), 4 links per wave gives 10
links at LOD2. Use 24 to 32 at LOD0, 14 to 16 at LOD1, 10 at LOD2 *(design, from sim 1 per-wave error)*. A tube of 10
sections × 4 sides × 2 = 80 triangles leaves plenty for the head. Rectilinear needs ventral skin motion, so use a belly
morph or a second row of skin joints.

Clips: `idle` (coil and tongue), `slither`, `sidewind`, `concertina`, `rectilinear`, `strike`.

| Mistake | Check | Pass | Source |
|---|---|---|---|
| Body rotates as one piece | `λ/L` near measured; phase monotone | 0.3 to 0.5 for lateral undulation | [H09] |
| Sidewind waves in the wrong relation | phase between `kn` and `kb` | 90° ± 10° *(tolerance: design)* | [A15] |
| Contact patch slides in sidewinding | foot-lock rule applied to contact sections | < 1 mm per frame | repo `gait` |
| Rectilinear wiggles | lateral curvature amplitude | near zero | [NJ18] |
| Body sinks through the ground | lowest skin point | at or above floor | repo `gait` |
| Eel without speed change in envelope | fitted α decreases with speed | 3.9 to 2.25 | [T04] |

## 5. Other body plans

| Plan | Motion model | Numbers | Bones (LOD0/1/2) *(design)* | First check |
|---|---|---|---|---|
| Jellyfish | `radialPulse`; jetting species contract fully, rowing species only partly [HU18], with a passive coast after relaxation | Mature *Aurelia*: mean peak 0.24 ± 0.11 Hz [J26]. Driven tests peak speed at 0.55 ± 0.05 Hz [J26]. Subumbrellar volume changes up to 50 %, exumbrella area changes more than 1.3× [HY]. Coast adds about 30 % distance per cycle [G13]. Prolate species pause longer after relaxation [HOP] | ring morphs or 8/4/0 radial joints + oral arms by `travellingWave` 4/2/1 | mesoglea volume constant [HY]; speed from pulse only; coast present |
| Rays | `travellingWave` across the disc, chord-wise | 0.4 waves per fin length (*Rhinoptera*, oscillatory, low frequency, high amplitude) to 1.3 (*Dasyatis*, undulatory); 1 to 3 disc lengths/s [R01]. Stingray: about 25 % of the fin moves with significant amplitude [BL12]. Manta turns: 42.65 ± 16.66°/s, radius 2.05 ± 1.26 m at the fast end of slow turns [F18] | grid 6 × 4 / 4 × 3 / 3 × 2 per side | waves per fin length within 0.4 to 1.3; high wave count pairs with low amplitude |
| Insects | phase table on the existing gait solver | Slow to fast: wave, tetrapod, tripod [N21]. Duty factor falls with speed [TBF94]; tripod is the static-stability minimum [TBF94] | 3 per leg | three feet down in tripod, centre of mass inside |
| Spiders, crabs | same solver | no opened source; alternating tetrapod for spiders is common knowledge only *(unverified)* | 4 per leg | foot lock; `clashes` |
| Centipedes | metachronal leg wave + body `travellingWave` | *S. polymorpha* 19 leg pairs: 0.41 ± 0.05 body lengths per cycle; body wave leads leg wave by 2.51 ± 0.71 rad; 1.6 body waves, 2 leg waves [ZH]. | body 12/8/5, legs 2/1/0 per leg | body-leg phase offset and stride |
| Worms | peristaltic strain wave: `e(s,t)` and `r(s,t)` | With mass: speed ∝ m^0.33, stride ∝ m^0.41, frequency ∝ m^−0.07, duty ∝ m^−0.03; faster mainly by longer strides [Q99] | 16/8/4 scale joints or morphs | `r²(1+e)` constant |
| Birds, bats | flap wave along the wing | `f ∝ (mg)^(1/2) b^(−17/24) S^(−1/3) I^(−1/8) ρ^(−3/8)` [P96]; with wing inertia `I ∝ m b²` this is `m^(3/8) g^(1/2) b^(−23/24) S^(−1/3) ρ^(−3/8)` [D]; cruising St 0.2 to 0.4 [TNT03]. Bat stroke data not found *(unverified)* | 3/2/1 per wing section | St in band at cruise |
| Dragon wings | the bird rules at larger scale | The form above, with its constant taken as 1 *(assumption)*, gives about 0.7 Hz for 300 kg, 12 m span, 30 m², sea-level air [D]; a scale guide, not proof of flight | 8/4/2 per wing | St in band; wing clears body |
| Tentacle monsters | `bendPulse`, `travellingWave` and `followPath` per limb; octopus rules | as section 2 | per section 2 | volume, twist, clash |

## 6. Delivery in game assets

### Technique choice
| Technique | Good for | Limits | ts23d verdict |
|---|---|---|---|
| **Baked skeletal chains** | all primary motion here | linear blending, joint count | **Default.** Plain glTF everywhere; computed in TypeScript |
| Spline IK or Bendy Bones, baked | authoring long chains by hand in a DCC. Blender's Spline IK fits a bone chain to a curve, is really forward kinematics, and bones ignore curve tilt [BM] | an extra tool for what the field already gives | Not needed: the field is the spline. Keep Blender for weights |
| Morph targets | mantle, gills, belly skin, bell, colour flush | clients SHOULD support at least 8 morphed attributes [GLTF]; memory per target | Use for small radial motion; keep to 8 or fewer active |
| Vertex animation textures | very large crowds, cloth-like motion | engine-specific material, no glTF standard; Unity's toolbox documents 16,384 points and position plus normal only [VFX] | Out of scope for the GLB; never required |
| Engine vertex shader | thousands of small fish. Godot's tutorial uses cosine side-to-side, pivot, wave and twist in model space, masked toward the tail, and credits the technique to *ABZÛ* [GD] | it is engine code; repo rule: assets, not engines | Do not ship shaders. May later publish wave parameters in the manifest as data *(design)* |

### glTF limits
| Topic | Fact | Consequence | Source |
|---|---|---|---|
| Influences | 4 per `JOINTS_n` / `WEIGHTS_n` set; clients **may** support only one set | Author for 4. Unreal's glTF importer is reported to keep 4 | [GLTF], [UE-INF] |
| Skinning model | joints and weights only; the specification text contains no dual-quaternion option | Assume linear blending on every target | [GLTF] |
| Rotation keys | `VEC4` float, or normalized byte or short | Use normalized short: 8 bytes a key | [GLTF] |
| Interpolation | `LINEAR` rotation uses slerp; `STEP`, `CUBICSPLINE` exist | `LINEAR` with enough keys; cubic spline triples the data | [GLTF] |
| Node transforms | animated nodes use TRS only | Radial scale in a chain inherits (below) | [GLTF] |
| Morph data | `POSITION`, `NORMAL`, `TANGENT`, `TEXCOORD_n`, `COLOR_n` displacements | colour flush is legal | [GLTF] |
| Joint counts | Unreal: mobile capped at 75 bones **per section**; default 65,536; 256 without 16-bit indices | Octopus LOD0 needs arm-wise sections, one material still | [EP] |
| Unity | more than 4 bones per vertex needs compute shaders for GPU skinning | stay at 4 | [UN] |
| three.js, Godot | no official limit opened | test in the gallery viewer | *(unverified)* |

### Twist and the candy wrapper
Two joints blended 50/50 with relative twist `φ` shrink the section by `cos(φ/2)` [D]:

| Twist per joint | Radius | Area |
|---|---|---|
| 15° | 0.991 | 0.983 |
| 30° | 0.966 | 0.933 |
| 45° | 0.924 | 0.854 |
| 90° | 0.707 | 0.500 |
| 180° | 0 | 0 |

So keep twist to at most 45.6° per joint for 85 % of section area (the figure the rigger skill uses for bends), or 25.8° for 95 %, and spread total twist over
the chain. Dual-quaternion skinning avoids this collapse, but cannot be relied on: glTF has no such option, Unreal's
route is reported as a deformer that is slow [UE-DQ], and Unity threads and community code indicate no built-in option
(forum-level and possibly dated) [U-DQ]. Do not depend on it.

### Stretch and thickness
Elongation goes in child joint **translation**, which is safe. Radial thinning needs scale, and non-uniform scale on a
parent combined with a rotated child produces shear in matrix hierarchies, which engines that decompose to TRS may treat
differently *(engine behaviour unverified)*. Options, in order: skip radial scale where strain is small; use one morph per
arm for thinning; or bake a flat skeleton (deform joints directly under a root) where stretch is large, which removes
scale inheritance entirely at the price of easy runtime additive posing. Test on two engines before committing.

### Clip size
Rotation keys at 8 bytes, 16 keys per second, one shared float time track (sim 6): shark LOD0 (24 joints), 2 s: 6.3 KiB.
Octopus LOD0 (128 joints), 2 s: 33.1 KiB; at 30 keys per second 61.2 KiB. Hydra with five 16-link necks, 2 s: 20.8 KiB.
Even a dozen clips stays small beside the textures. Reduce keys by checking the slerp error, not by a fixed frame rate:
for a joint amplitude `Â` and `K` keys per cycle, peak error is `Â(1 − cos(π/K))` [D].

### Root motion and determinism
Follow the existing gait convention: root travel per clip equals `U·T` and the manifest records the speed, so engines can
play in place or with travel. All drivers are closed-form functions of `(s, t)` and parameters; only seeded choices
(octopus recruitment, hydra attention, idle noise) need `ctx.rng`. Keys quantised to normalized shorts also hide tiny
floating-point differences between platforms. All of this can be computed deterministically in TypeScript, with no
solver, GPU or external tool.

## 7. Ranked build table

Ranked by evidence strength, reuse and visual payoff. The first row carries the shared work.

| # | Body plan | Motion generator needed | Rig needs | Checks | Effort | What makes it impressive |
|---|---|---|---|---|---|---|
| 1 | **Shark** (then tuna, trout presets) | chain field + `travellingWave`, recoil, loop fit | spine chain, two-lobe tail, pectoral and jaw joints, gill morphs | St, stride, slip, λ, envelope, seam, jaw order | M | Burst and C-start from numbers; jaw thrown forward as the bite closes |
| 2 | **Eel, sea snake** | row 1 + exponential envelope | long uniform chain | row 1 with eel ranges | S | Same code, new animal, proves the abstraction |
| 3 | **Land snake** | row 1 + `orthogonalWaves`, ground contact | 24 to 32 links, belly morph | phase 90°, contact lock, sink | M | Sidewinding track marks; four named gaits |
| 4 | **Hydra** | `followPath`, strike, body counter-motion on existing gaits | quadruped + necks | crossings, clash, neck limits, acceleration, balance | M | Heads taking turns, one striking while the body braces |
| 5 | **Squid** | `radialPulse` + fin wave + trailing arms | mantle ring or morph, two fins, 10 limbs | mantle range, fin ratio, jet speed | M | Jet pulse with fins folding in at speed |
| 6 | **Octopus** | `bendPulse`, stretch, twist, `hingeGroups`, seeded crawl | 8 × 20 to 24 links, arm-wise sections | bell speed, volume, twist per joint, self-contact | L | A reach that reads as alive; a fetch that folds into joints |
| 7 | **Jellyfish** | `radialPulse` + trailing wave | ring morphs, oral arms | volume, coast, pulse rate | S | Cheap, beautiful, very low triangle count |
| 8 | **Manta or stingray** | `travellingWave` on a surface grid | fin grid | waves per fin, amplitude trade-off | M | Slow banking glide |
| 9 | **Centipede** | wave + leg phase table | body chain, many short legs | leg-body phase, stride | M | Rippling legs in phase with the body |
| 10 | **Insects, spiders, crabs** | phase tables on the gait solver | leg chains | static stability, foot lock | S to M | Reuses the shipped gait work |
| 11 | **Dragon wing flap** | flap wave + existing creature | wing chains | St, clearance | M | Upgrades existing dragons |
| 12 | **Worm, tentacle monster** | `e`/`r` peristalsis or row 6 drivers | scale joints or morphs | volume | S to M after 6 | Fun extras once the fields exist |

Note on the owner's priority order: octopus ranks below shark, snake and hydra here only because it needs the most new
machinery (twist, stretch, arm-wise sections) and the weakest numeric evidence on curvature. Rows 1 to 3 build the code it
reuses. A model-first body also needs a spine-chain skeleton fit, which the current quadruped-oriented flow may not cover;
the rig audit should confirm this.

## 8. Numeric checks run for this document

A throwaway `bun` script (not in the repo) reproduced these results:

| # | Test | Result |
|---|---|---|
| 1 | Link count against the continuous fish midline | table in section 1; 4 links 0.58 % L RMS |
| 2 | Consistency of published ratios | [DS21] stride 0.62, slip 0.67; `U = 0.7Lf`, `A = 0.2L` gives St 0.286; eel stride 0.43, St 0.324, slip 0.72 |
| 3 | Lateral centre of mass with no recoil | 2.80 % L uniform mass, 2.75 % L tapered |
| 4 | Slerp error | 15° joint: 1.14° at 8 keys, 0.51° at 12, 0.29° at 16 |
| 5 | Twist collapse, 50/50 blend | table in section 6 |
| 6 | Clip bytes | section 6 |
| 7 | Bend pulse resolution | section 2; minimum-jerk peak speed 1.875 × mean at mid-reach |
| 8 | Follow-the-leader deviation | section 3 |
| 9 | Snake ratios | `U/V = 0.55`; one arc wave = 0.71 L along travel |
| 10 | Frequency bands by length | [SR23] bounds; the `min(f0, c/L)` blend is ours and ignores the published crossover shape |

## 9. What could not be verified

- **Paywalled or blocked:** Bainbridge 1958, Videler and Wardle 1991, Wardle 1975, Domenici and Blake 1997 full text, Sumbre
  2006 full text (no segment ratio for the fetch), Anderson and Grosenbaugh 2005 full text (no jet timing), Gutfreund 1996
  full text (no bend speed in m/s), Kier and Smith 1985, Kavan's dual-quaternion paper.
- **Not found in any opened source:** real peak curvature and twist magnitude in octopus arms; shark gill and teleost
  opercular rates; a shark-specific midline dataset with λ and envelope; shark tail lobe phase; squid contraction against
  refill durations; spider, crab and bat kinematics; multi-head behaviour (none exists); schooling phase statistics; GDC
  detail on *ABZÛ* beyond the Godot tutorial's credit; any GDC talk on game tentacles; official three.js and Godot joint limits.
- **Snippet-level numbers (grade S)** should be opened before they become hard gates: [TNT03], [W75], [VW91], [CB94], [M91],
  [DG25], [R15], [P16], [P96], [HY], [TBF94].

## Sources

Links are on each tag. Grades: **F** full text opened, **A** abstract only, **S** search snippet only.

**Full text opened.** [B09] Bartol et al. 2009, *J. Exp. Biol.*, jetting in juvenile and adult squid; [C13] Cobley, Rayfield and Barrett 2013, *PLOS ONE*, ostrich neck; [D15] Domenici et al. 2015, *Biology Open*, C-starts; [DS21] Di Santo et al. 2021, *PNAS* 118, 44 fish species; [EP] Epic Games, skeletal mesh rendering paths; [FM15] *Frontiers in Marine Science* 2015, whale shark tags; [GD] Godot documentation, animating thousands of fish; [GLTF] Khronos, glTF 2.0 specification; [H09] Hu, Nirody, Scott and Shelley 2009, *PNAS*, slithering; [HOP] arXiv 2103.09894, *Hopscotching jellyfish*, duty cycles; [J20] Jayne 2020, *Integr. Comp. Biol.*, snake modes; [J26] arXiv 2604.14491, jellyfish swimming speed against stroke frequency; [K20] Kennedy et al. 2020, *Sci. Rep.*, octopus arm deformations; [LD15] Lauder and Di Santo 2015, elasmobranch locomotion chapter; [N21] Nirody 2021, arXiv 2104.01203, panarthropod coordination; [NS] Naturalis, Marine Species of the North Sea, *Octopus vulgaris*; [SR23] Sánchez-Rodríguez, Raufaste and Argentina 2023, *Nat. Commun.*, tail-beat scaling; [T04] Tytell 2004, *J. Exp. Biol.* 207, eel hydrodynamics II; [T22] Tingle et al. 2022, *J. Exp. Biol.*, sidewinder scaling (tables not readable); [W22] Wang et al. 2022, arXiv 2110.07211, bend propagation model; [W25] arXiv 2510.25520, whipping and octopus reach; [WL02] Wilga and Lauder 2002, *J. Exp. Biol.*, heterocercal tail; [Z13] Zelman et al. 2013, *Front. Comput. Neurosci.*, arm decomposition.

**Abstract only.** [A15] Astley et al. 2015, *PNAS*, orthogonal waves in sidewinding; [AG05] Anderson and Grosenbaugh 2005, *J. Exp. Biol.* 208, jet flow in adult squid; [BL12] Blevins and Lauder 2012, *J. Exp. Biol.*, stingray fin kinematics; [DS03] Donley and Shadwick 2003, *J. Exp. Biol.*, leopard shark; [F18] Fish et al. 2018, *J. Exp. Biol.*, manta turning; [G13] Gemmell et al. 2013, *PNAS*, jellyfish energy recapture; [G96] Gutfreund et al. 1996, *J. Neurosci.*, octopus reaching; [H15] Hanassy et al. 2015, *Bioinspir. Biomim.*, reach and elongation; [L15] Levy, Flash and Hochner 2015, *Curr. Biol.*, crawling; [M14] Marvi et al. 2014, *Science*, sidewinding on sand; [M97] Motta, Tricas and Summers 1997, *J. Exp. Biol.*, lemon shark jaws; [NJ18] Newman and Jayne 2018, *J. Exp. Biol.*, rectilinear locomotion; [Q99] Quillin 1999, *J. Exp. Biol.*, earthworm scaling; [R01] Rosenberger 2001, *J. Exp. Biol.*, batoid fins; [S06] Sumbre et al. 2006, *Curr. Biol.*, fetching; [TK01] Thompson and Kier 2001, *Biol. Bull.*, oval squid mantle; [W23] Waller et al. 2023, *J. Fish Biol.*, mako speeds; [WL00] Wilga and Lauder 2000, *J. Exp. Biol.*, shark pectoral fins; [WM98] Wilga and Motta 1998, *J. Exp. Biol.*, spiny dogfish feeding; [Y05] Yekutieli et al. 2005, *J. Neurophysiol.*, arm model II; [ZH] Zhong et al., SICB abstract, centipede coordination.

**Search snippet only; confirm before using as a hard gate.** [AW] 80 Level on a Godot tentacle set-up; [BM] Blender manual, Spline IK; [CB94] *J. Exp. Biol.* 192:169, elongated-body theory (Cheng and Blickhan as identified in the snippet); [CI17] *Copeia* 2018, tiger shark respiratory mode; [DG25] DiGiacomo, Abraham and Block 2025, *Wildlife Research*, white sharks by drone; [DW] DreamWorks, octopus rigging extended abstract; [G83] 1983 study, *Patterns of circular and radial mantle muscle activity in respiration and jetting of the squid Loligo opalescens*; [HU18] Georgia Tech study of jellyfish contraction across six species (`Hu18-jellyfish.pdf`); [HY] *Hydrobiologia*, *Aurelia* bell geometry, doi 10.1007/s10750-008-9589-4; [M91] Motta et al. 1991, *J. Morphol.*, lemon shark bites; [P16] Penning, Sawvel and Moon 2016, *Biol. Lett.*, snake strikes; [P96] Pennycuick 1996, *J. Exp. Biol.* 199, wingbeat frequency; [R15] Richter, Hochner and Kuba, *J. Exp. Biol.* 218:1069, constrained octopus arms; [TBF94] Ting, Blickhan and Full 1994, *J. Exp. Biol.*, hexapedal runners; [TM] ReefQuest summary of Tricas and McCosker, white shark bite; [TNT03] Taylor, Nudds and Thomas 2003, *Nature* 425; [TW13] Taylor and Wedel 2013, *PeerJ*, sauropod necks; [U-DQ] Unity discussion, dual-quaternion skinning; [UD] University of Delaware, dogfish gape study, preliminary; [UE-DQ] Unreal forum, dual-quaternion support; [UE-INF] Epic issue UE-392966, glTF influences; [UN] Unity scripting reference, `QualitySettings.skinWeights`; [VFX] Unity VFX Toolbox, Houdini VAT notes; [VW91] Videler and Wardle 1991, *Rev. Fish Biol. Fish.*; [W75] Wardle 1975, *Nature* 255, quoting Bainbridge.

[AG05]: https://doi.org/10.1242/jeb.01507
[A15]: https://doi.org/10.1073/pnas.1418965112
[AW]: https://80.lv/articles/check-out-this-creepy-but-cute-procedural-pixel-art-tentacle-set-up-with-godot
[B09]: https://fs.wp.odu.edu/ibartol/wp-content/uploads/sites/209/2015/08/adults_2009.pdf
[BL12]: https://doi.org/10.1242/jeb.068981
[BM]: https://www.blender.org/manual/en/animation/armatures/posing/bone_constraints/inverse_kinematics/spline_ik.html
[C13]: https://pmc.ncbi.nlm.nih.gov/articles/PMC3743800/
[CB94]: https://cob.silverchair.com/jeb/article-pdf/192/1/169/2854472/jexbio_192_1_169.pdf
[CI17]: https://dx.doi.org/10.1643/CI-17-683
[D15]: https://researchonline.jcu.edu.au/41883/1/41883%20Domeniciet%20al%202015.pdf
[DG25]: https://www.publish.csiro.au/WR/WR24193
[DS03]: https://doi.org/10.1242/jeb.00206
[DS21]: https://sites.harvard.edu/glauder/files/2022/02/DiSanto.Goerig.etal_.megakinematics.ALL_.2021.pdf
[DW]: https://research.dreamworks.com/wp-content/uploads/2018/07/octopus_rigging_digipro_extended_abstract_FINAL-Edited.pdf
[EP]: https://dev.epicgames.com/documentation/en-us/unreal-engine/skeletal-mesh-rendering-paths-in-unreal-engine
[F18]: https://doi.org/10.1242/jeb.166041
[FM15]: https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2015.00064/full
[G13]: https://doi.org/10.1073/pnas.1306983110
[G96]: https://doi.org/10.1523/jneurosci.16-22-07297.1996
[GD]: https://docs.godotengine.org/en/3.5/tutorials/performance/vertex_animation/animating_thousands_of_fish.html
[GLTF]: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
[H09]: https://math.nyu.edu/~shelley/papers/HNSS2009.pdf
[HU18]: https://hu.gatech.edu/wp-content/uploads/2018/08/Hu18-jellyfish.pdf
[G83]: https://scilit.com/publications/6df97ec76d4d7a188b64652208ef81ae
[H15]: https://doi.org/10.1088/1748-3190/10/3/035001
[HOP]: https://arxiv.org/abs/2103.09894
[HY]: https://link.springer.com/article/10.1007/s10750-008-9589-4
[J20]: https://pmc.ncbi.nlm.nih.gov/articles/PMC7391877/
[J26]: https://arxiv.org/abs/2604.14491
[K20]: https://pmc.ncbi.nlm.nih.gov/articles/PMC7704652/
[L15]: https://doi.org/10.1016/j.cub.2015.02.064
[LD15]: https://sites.harvard.edu/glauder/files/2022/03/Lauder.diSanto.2015.pdf
[M14]: https://doi.org/10.1126/science.1255718
[M91]: https://zendy.io/title/10.1002/jmor.1052100106
[M97]: https://doi.org/10.1242/jeb.200.21.2765
[N21]: https://arxiv.org/abs/2104.01203
[NJ18]: https://doi.org/10.1242/jeb.166199
[NS]: https://ns-zooplankton.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=132450
[P16]: https://pmc.ncbi.nlm.nih.gov/articles/PMC4843225
[P96]: https://cob.silverchair.com/jeb/article-pdf/199/7/1613/3391219/jexbio_199_7_1613.pdf
[Q99]: https://doi.org/10.1242/jeb.202.6.661
[R01]: https://doi.org/10.1242/jeb.204.2.379
[R15]: https://cob.silverchair.com/jeb/article-split/218/7/1069/14549/Octopus-arm-movements-under-constrained-conditions
[S06]: https://doi.org/10.1016/j.cub.2006.02.069
[SR23]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10492801/
[T04]: https://sites.harvard.edu/glauder/files/2022/03/Tytell.2004.pdf
[T22]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9080748/
[TBF94]: https://scholarblogs.emory.edu/neuromechanicslab/files/2024/06/Ting-Blickhan-Full-1994.pdf
[TK01]: https://doi.org/10.2307/1543330
[TM]: https://www.elasmo-research.org/education/white_shark/muscles_jaw.htm
[TNT03]: https://ideas.repec.org/a/nat/nature/v425y2003i6959d10.1038_nature02000.html
[TW13]: https://peerj.com/articles/36
[U-DQ]: https://discussions.unity.com/t/unity-and-dual-quaternion-skinning/431001
[UD]: https://www.urp.udel.edu/?p=18081
[UE-DQ]: https://forums.unrealengine.com/t/dual-quaternion-support/144831?page=2
[UE-INF]: https://issues.unrealengine.com/issue/UE-392966
[UN]: https://docs.unity3d.com/2019.1/Documentation/ScriptReference/QualitySettings-skinWeights.html
[VFX]: https://plastichub.unity.cn/unity-tech-cn/VFXToolbox/commit/57bd4570-484d-49b1-92fd-b83b3b410cac
[VW91]: https://dx.doi.org/10.1007/BF00042660
[W22]: https://arxiv.org/abs/2110.07211
[W23]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10952363/
[W25]: https://arxiv.org/abs/2510.25520
[W75]: https://www.nature.com/articles/255725a0.pdf
[WL00]: https://doi.org/10.1242/jeb.203.15.2261
[WL02]: https://sites.harvard.edu/glauder/files/2022/03/WilgaLauder2002.pdf
[WM98]: https://doi.org/10.1242/jeb.201.9.1345
[Y05]: https://doi.org/10.1152/jn.00685.2004
[Z13]: https://pmc.ncbi.nlm.nih.gov/articles/PMC3662989
[ZH]: https://sicb.org/?p=39562
