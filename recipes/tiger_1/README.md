# Tiger I — mid production, Henschel, Oct–Nov 1943 (Eastern Front, winter 1943/44)

## Identity
Variant: mid-production Pz.Kpfw. VI Ausf. E built after the July 1943 changes and after factory
Zimmerit began (Aug–Sep 1943), as photographed in Russia in Jan/Feb 1944 (Bundesarchiv Bild
101I-277-0846-08). Chosen because every ornament the owner listed (Zimmerit, low cupola, single
headlight, spare links on the turret, S-mine dischargers) existed together on this batch.

Signature features:
1. Box hull with overhanging panniers, vertical-ish (9°) driver's plate, short near-flat glacis.
2. Schachtellaufwerk: 8 stations per side at 515 mm, 800 mm rubber-tyred discs, interleaved.
3. Horseshoe turret, wide curved mantlet, long 8.8 cm KwK 36 L/56 with double-baffle brake.
4. Low cast cupola with 7 periscopes (from July 1943), one Bosch light centred on the front plate.
5. Factory Zimmerit: fine horizontal ridges combed in vertical trowel columns on the vertical and
   sloped plates, turret and mantlet (see "Zimmerit" below; corrected Nov 2026).

Mid-production changes relative to early (what is deliberately absent): no Feifel air filters
(deleted ~Aug 1943), no turret smoke-candle dischargers (deleted from June 1943), no second headlight.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| hull length | 6.316 | https://en.wikipedia.org/wiki/Tiger_I |
| length with gun forward | 8.45 | https://en.wikipedia.org/wiki/Tiger_I |
| width (battle tracks) | 3.56 | https://en.wikipedia.org/wiki/Tiger_I (Tiger 131 page lists 3.70 over fenders) |
| height | 3.00 | https://en.wikipedia.org/wiki/Tiger_I |
| ground clearance | 0.47 | https://en.wikipedia.org/wiki/Tiger_I |
| road wheel diameter | 0.80 | https://tankmuseum.org/tiger-wheels/ · https://tiger1.info/EN/RoadWheelSpacing.html |
| wheel station pitch | 0.515 | https://tiger1.info/EN/RoadWheelSpacing.html |
| track width (battle) | 0.725 (transport 0.520) | https://tiger1.info/EN/RoadWheelSpacing.html |
| barrel length, KwK 36 L/56 | 4.928 (56 × 88 mm) | https://en.wikipedia.org/wiki/8.8_cm_KwK_36 |
| turret ring diameter | 1.79 | Jentz & Doyle, *Germany's Tiger Tanks: D.W. to Tiger I* |

## Plate angles (from vertical)
| Plate | Thickness | Angle | Source |
|---|---|---|---|
| driver's front plate | 100 mm | 9° (top leaning back) | Armorsite armour table (after Jentz): "Superstructure 100 mm @ 9°" — https://id3486.securedata.net/fprado/armorsite/tiger1-02.htm ; War Thunder data "102 mm (9°)" — https://old-wiki.warthunder.com/Tiger_(Germany) |
| glacis (short step) | 60–62 mm | 80–81° | Armorsite text "set at 81 degrees to the vertical"; War Thunder "62 mm (80°)" |
| nose plate | 100 mm | 25° (foot tucked back) | Armorsite table "Hull 100 mm @ 25°" |
| superstructure and hull sides | 80 / 60 mm | 0° | Armorsite table |
| rear plate | 80 mm | 8–9° (top leaning in toward the deck) | War Thunder "82 mm (9°)"; Jentz armour table as quoted on Armorsite |
| turret front / sides / rear | 100 / 80 / 80 mm | ~10° / 0° / 0° | Armorsite table |

**What changed in the model (owner question "isn't the back tilted?")**: the first model had a
vertical rear plate. It is now 9° from vertical, foot at the rearmost hull point (x = −3.158),
top 0.13 m further forward where it meets the engine deck. Below it, a sloped lower rear plate
runs forward to the belly behind the idler. The nose plate is now 25° and the glacis 81°, both
from the same table, and the belly sits at 0.47 m. Exhausts, guards, jack and Zimmerit follow
the inclined plate. The angle *direction* of the rear plate (leaning in, as on the front) is
inferred from the side photos; the tables give only the magnitude.

## Photos (by view)
| View | URL | Date / unit | Notes |
|---|---|---|---|
| left side, turret | https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-277-0846-08,_Russland,_Panzer_VI_(Tiger_I).jpg | Jan–Feb 1944, Russia, PK 697 (photographer Jacob); CC BY-SA 3.0 DE | Zimmerit on hull side and turret (horizontal ridge lines under the turret); spare track links on the turret side; outlined three-digit turret number ("…32", first digit partly hidden; modelled as 332); whitewash; stowage bin |
| front | https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-299-1805-10,_Nordfrankreich,_Panzer_VI_(Tiger_I).jpg | 21 Mar 1944, N. France, LSSAH (PK 698, Scheck) | later unit, same batch features: Zimmerit on the front plate and mantlet, spare links on turret sides, single headlight position, driver's visor, bow MG ball, unit emblem on the front plate (not modelled; different unit) |
| side, Wittmann | https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-299-1802-08,_Nordfrankreich,_Michael_Wittmann_auf_Panzer_VI_(Tiger_I).jpg | spring 1944, N. France | Zimmerit texture reference: driver's plate and mantlet close up, horizontal ridges in ~10–16 cm vertical columns, offset at each column seam |
| wheels | https://tankmuseum.org/tiger-wheels/ | Tank Museum, Bovington | rubber-tyred 800 mm discs, 24 per side |
| mid-production change list | https://tamiyausa.com/shop/135-military-miniature/german-tiger-i-mid-production | — | Jul 1943–Jan 1944: new cupola (7 periscopes), single headlight, Zimmerit from Sep 1943 |

Markings modelled: Balkenkreuz (black, white edges) on both pannier sides behind the centre; turret
number 332 as outlined digits on both turret sides, read front-to-back. Weathering: mud from the
ground up to ~1.3 m on running gear and lower hull, soot over the exhausts, three-tone
Dunkelgelb / Rotbraun / Olivgrün patches seeded from `ctx.rng`.

## Parts the engine needs
`turret` (sway ±20° about Z), `gun` (sway ±5° about Y), `wheel_{l,r}_{0..7}`, `sprocket_*`,
`idler_*` (spin about Y), `track_l/r`, emitters `exhaust_smoke_l/r`, `track_dust_l/r`, `muzzle`.

## Open questions
- Width: 3.56 m (Wikipedia Tiger I) versus 3.70 m (Wikipedia Tiger 131, over fenders). 3.56 m is
  used, to the track edges.
- First digit of the photographed turret number is hidden by a crewman; "332" is a guess. The
  unit is unidentified (PK caption only).
- Zimmerit on the glacis and roof: photos show it on vertical faces only; horizontal plates are left
  smooth (Panzerworld: "all vertical and sloped surfaces"; the 81° glacis is treated as horizontal).
- Zimmerit on the lower hull sides behind the road wheels: not modelled (hidden by the wheels; no
  photo of this batch checked).

## Finish and wear (Nov 2026 quality pass; `../_lib/finish/field.ts`)
| What | How |
|---|---|
| Dunkelgelb and the camouflage | project material `armour_paint` (matte film, 8 % flakes) at true scale under the sprayed three-tone vertex colour; Zimmerit keeps its own strip |
| mud | `fieldCoat`: dried dark earth from the ground to ~1.15 m (a third higher behind the tracks; fenders to 1.7 m), wet mud along its lowest part, on hull, Zimmerit, fenders, stowage |
| dust | grey-brown haze on up-facing plates (0.3) |
| wheels | plain Dunkelgelb with radial mud (`wheelMud`): tyre, rim and the outer dish; turns with the wheel |
| track | dark manganese steel, road-polished grouser bar, mud packed either side of it; one link finished and laid round the belt (`treads` gate) |
| soot | plumes from both exhaust mouths over the shrouds, the rear plate and the engine deck; muzzle brake |
| chipping | the Zimmerit's flaked patches are real cuts to the primer (see Zimmerit); weld beads down the interlocked corners |

## Length
`real.length` 8.45 m is the gun-forward length; the model measures 8.70 m (+3 %, gate ±5 %). The
front is exact: the muzzle is 2.13 m ahead of the 6.316 m hull (8.45 − 6.316). The extra is at the
rear, where the exhaust shrouds (to x = −3.41) and the hinged mudguards (to −3.44) stand behind
the rear plate at x = −3.158. Whether the published 6.316 m is the armoured hull or includes those
fittings is not stated by the sources in Specs; the recipe keeps 6.316 m as the armoured hull
(the `hull length` measure) and leaves the fittings where the rear photos put them.

## Triangles
58.6k / 16.4k / 1.35k (was 68.9k / 17.4k / 3.5k). LOD0: the hidden inboard discs of the
interleave are a tyre band and a flat web with fewer sides, the outer discs are flat behind, the
twin guide horns are one block. LOD2: wheels as shallow six-sided cones (6 triangles each),
plates split at 4.2 m only, digits without outlines, a five-sided barrel and
pipes, exhaust shrouds as one box each. LOD2 is now inside the AFV playbook band (≤ 1.5k), so
the `tiger_1` row in `scripts/lib/budget-baseline.ts` can go.

## Rear (rebuilt Nov 2026)
Variant: mid production Oct–Nov 1943, so **no Feifel air filters** (phased out during mid
production) and **armoured exhaust covers** over the two tall vertical exhausts.
- Rear plate 80 mm at 9° (armour table above); the hull side plates stand ~7 cm proud of it
  (interlocked construction), upper and lower.
- Exhausts: a stub out of the plate at ~1.3 m, then a vertical pipe to ~0.3 m above the engine
  deck, each in a three-sided armoured cover with a heat slit, open on top. Pipes are bolted to
  studs on the rear plate. Heights and spacing are estimated from photos (no sourced number, so no
  `measures` entry).
- Rear plate furniture: starter-crank access cover (centre), jack on two brackets, convoy light
  (left) and tail light (right), tow pintle below, tow shackles at the lower corners.
- Engine deck: central engine hatch, mesh radiator grilles left and right, four round fan grilles
  at the rear (two per side). Hinged rear mudguards over the track ends.

| What | Link | Notes |
|---|---|---|
| Feifel phased out in mid production | https://archive.armorama.com/forums/11921/index.htm | forum; dates approximate (Jentz, *Tiger I Design, Production and Modifications*, not accessed) |
| Exhaust covers across Initial–Late | https://www.bnamodelworld.com/military-vehicles-tanks-elefant-corporation-ele-e35291-2-1-35-tiger-i-initial-early-mid-late-(with-casting)-armoured-exhaust-cover-for-rfm-kits | kit listing |
| Exhaust pipes bolted to rear-plate studs | https://forum.armortek.co.uk/viewtopic.php?p=88464 | builder's notes |
| Kursk photos: with/without Feifel and shields | https://www.rctankwarfare.co.uk/forums/viewtopic.php?p=98068 | cites Healy, *Zitadelle* |
| Tiger 131 rear (early production, has Feifel: for layout of deck/plate only) | https://commons.wikimedia.org/wiki/Category:Tiger_131 | Bovington walkaround photos |

## Zimmerit (rebuilt Nov 2026)
Owner question: "why does the tiger have these many bars on the surface?" The first model placed a
box per ridge (20 mm wide, 16 mm proud, 45 mm pitch, *vertical* ridges in 160 mm horizontal bands)
with random missing boxes as "chips". That was wrong in scale, relief and orientation.

**What the sources say**
| Figure | Value | Source |
|---|---|---|
| total coating thickness | 6 mm: a 2 mm base coat, dried 4 h and torch-hardened, then 4 mm more, patterned | Tank Museum, "Zimmerit and why" — https://tankmuseum.org/article/zimmerit |
| paste per vehicle | Tiger I 200 kg (Panther 160, Pz IV 100); order of 29 Dec 1943 | Tank Museum (above); Panzerworld — https://panzerworld.com/zimmerit |
| factory start / stop | Tiger from Aug 1943; stopped 9 Sep 1944 | Panzerworld; Tank Museum. **Disagrees:** Wikipedia (https://en.wikipedia.org/wiki/Zimmerit) says vehicles produced from Dec 1943; Oct–Nov 1943 tanks photographed with factory Zimmerit (this README's photos) support the earlier date |
| where applied | "all vertical and sloped surfaces" in reach of infantry, not hinges, automotive parts, tracks, lamps, tools; also turrets | Panzerworld; Tank Museum ("armoured surfaces in easy reach of troops on foot") |
| pattern, Tiger Ausf. E | "vertical columns of horizontal ridges" (pattern 1; waffle pattern 6 also seen) | Panzerworld pattern catalogue |
| hull vs turret | different styles: hull (Henschel) and turret (Wegmann) were coated in different plants; ridges shaped round plate edges and fittings | tiger1.info — https://tiger1.info/EN/9540-Zimmerit.html |
| composition | barium sulphate 40 %, PVA 25 %, ochre 15 %, zinc sulphide 10 %, sawdust 10 % | Panzerworld |
| primer under factory coat | red-oxide primer; flaked factory Zimmerit shows primer (forum consensus citing T. Chorý; some say grey paste remains) | https://forum.finescale.com/t/what-color-is-under-zimm/133177 · https://archive.armorama.com/forums/67420/index.htm |

**Measured from the photos** (no source gives a ridge pitch or column width in millimetres, so these
are photo estimates, scaled from the driver's visor and bow MG mount in Bild 101I-299-1805-10 and the
front plate in 101I-299-1802-08):
- Column (one trowel stroke) 10–16 cm wide; ridges inside run horizontally and wave a few mm.
- Hull ridge pitch 2–3 cm. Modellers' counts (Missing-Lynx forum, Tiger I Zimmerit thread,
  https://www.tapatalk.com/groups/missinglynx/tiger-i-zimmerit-question-t43544.html) give ≈ 40
  ridges up the hull side (≈ 16–18 mm) and ≈ 1 mm at 1:35 on the turret (≈ 35 mm, 22–23 ridges up
  the side). **Sources disagree** on the hull figure (photo estimate 20–30 mm vs 16–18 mm from the
  counts); the turret figure agrees with the photos (coarser than the hull).
- Orientation: the photos and Panzerworld agree on horizontal ridges in vertical columns. The README
  and model previously said the opposite; corrected.

**What the model uses**
| Choice | Value | Why |
|---|---|---|
| coating slab | 6 mm proud (crest), panel rim sunk 3 mm into the plate | Tank Museum total; seated, not hovering |
| ridge relief | 4 mm (height field, normal map + cavity AO) | the patterned layer |
| hull ridge pitch | 22 mm | between the photo estimate and the modellers' count |
| turret and mantlet ridge pitch | 34 mm | modellers' count, matches the photos |
| column width | 13 cm (each column its own ridge phase) | photo estimate |
| flakes | ≈ 7 % of the hull coat, ≈ 3.5 % of the turret, ≈ 6 % of the mantlet; 10–40 cm patches, more at plate edges and on the front/sides; cut back to a red-oxide primer floor (1.5 mm) with a crisp 4.5 mm broken edge of raw grey-ochre paste | photos show broken patches, not missing single ridges; primer per the forum consensus above |
| coverage | pannier sides, driver's plate, nose, upper rear plate, turret walls and front plate beside the mantlet, mantlet face; not deck, roof, glacis, running gear | Panzerworld, photos |
| markings | Balkenkreuz and turret number painted on intact coat (no flakes under them) | photos |

**Texel density.** The `zimmerit` strip runs U up the plate (4 m span over 4096 px ≈ 1 mm/texel, so
a 22 mm ridge is 22 texels: true pitch, no compromise) and V across one 13 cm column (64 px ≈ 2 mm,
enough for the column seam). The coating is cut into columns so V never wraps inside a triangle.
At hero distance (≈ 1 cm/px) the ridges sit near the pixel pitch and read as fine striping, which is
also how the 1944 photographs look; close views resolve them fully.

**LODs.** LOD0 carries the slab and the flake cuts (11.1k triangles: hull 7.6k, turret 2.5k, mantlet 1.0k;
the ridge boxes were 14.4k on hull and turret alone).
LOD1 and LOD2 add no geometry: the plate faces themselves take the strip (U at the same pitch, V on a
column middle), so the ridged tone, camo and markings carry to the far LODs; only the small flakes
and the column seams drop out.

**Weight.** Weighed as a 6 mm skin of paste at ~1600 kg/m³ (density unverified): 179 kg modelled
against the 200 kg allotment.

