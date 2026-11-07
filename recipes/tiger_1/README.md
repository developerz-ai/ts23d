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
5. Factory Zimmerit: vertical ridges laid in horizontal bands on the vertical plates.

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
| left side, turret | https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-277-0846-08,_Russland,_Panzer_VI_(Tiger_I).jpg | Jan–Feb 1944, Russia, PK 697 (photographer Jacob); CC BY-SA 3.0 DE | Zimmerit vertical ridges in horizontal bands on hull side and turret; spare track links on the turret side; outlined three-digit turret number ("…32", first digit partly hidden; modelled as 332); whitewash; stowage bin |
| front | https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-299-1805-10,_Nordfrankreich,_Panzer_VI_(Tiger_I).jpg | 21 Mar 1944, N. France, LSSAH (PK 698, Scheck) | later unit, same batch features: Zimmerit on the front plate and mantlet, spare links on turret sides, single headlight position, driver's visor, bow MG ball, unit emblem on the front plate (not modelled; different unit) |
| side, Wittmann | https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-299-1802-08,_Nordfrankreich,_Michael_Wittmann_auf_Panzer_VI_(Tiger_I).jpg | spring 1944, N. France | turret-side numbers and Zimmerit texture reference |
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
  smooth.
