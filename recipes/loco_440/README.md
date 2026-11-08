# Jupiter — Central Pacific No. 60, 4-4-0 "American" (Schenectady 1868; 1979 replica)

## Identity
The operating replica at Golden Spike National Historical Park (O'Connor Engineering, Costa Mesa,
1979), in the livery it has worn since the 1994 repaint: Jim Wilke's scheme from 1868–69 newspaper
descriptions ("gleaming in blue and crimson with gold"), with the blue later refined from "Pepsi"
blue to Caledonian blue. Signature features: black balloon stack, big box headlamp on scrolled
brackets, polished brass steam dome and brass-lagged cylinders, blue sand dome lettered "60",
brass bell in a yoke, Russia-iron boiler with brass bands, blue slatted pilot with gold lining,
blue wooden cab with vermilion window frames and roof, red spoked drivers with polished rods,
riveted blue tender with a red "JUPITER" panel and a "C.P.R.R." coping band. The recipe is a family
over the Whyte arrangement: frame, boiler and rods are laid out from `'4-4-0'`.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| driver diameter (5 ft 4 in) | 1.626 | https://en.wikipedia.org/wiki/Jupiter_(locomotive) |
| cylinders | 16 × 24 in | https://en.wikipedia.org/wiki/Jupiter_(locomotive) |
| track gauge | 1.435 | https://en.wikipedia.org/wiki/Standard-gauge_railway |
| engine weight / adhesive | 27 / 18 short tons | https://en.wikipedia.org/wiki/Jupiter_(locomotive) |
| boiler pressure (replica) | 160 psi | https://en.wikipedia.org/wiki/Jupiter_(locomotive) |
| tender water | 2,000 US gal | https://en.wikipedia.org/wiki/Jupiter_(locomotive) |
| lead truck wheel diameter | 0.762 | typical for the type; not in the Jupiter infobox |
| driver wheelbase | ≈ 2.44 | estimated from the side photo, drivers as ruler |
| boiler barrel diameter | ≈ 1.24 | typical 49 in; matches the photo |
| stack height | ≈ 1.6 | estimated from the side photo |
| engine + tender length | ≈ 17.4 | estimated from the side photo, drivers as ruler |
| width / height | ≈ 2.8 / 4.6 | estimated from the front and side photos |

## Livery → material library
| Surface | Strip | Vertex colour | Evidence |
|---|---|---|---|
| boiler jacket (Russia iron) | `chrome` | `#6a717c` (dark blue-grey) | planished iron: dark, glossy, horizon highlights in every photo |
| smokebox, stack | `iron_cast` | `#5a5a5c` + soot grime | graphite-black, sooted lip |
| domes, bell, whistle, bands, cylinders, steam chests, handrails, lining, lettering | `brass` | `#f2cf86` (warm tint) | polished brass; tinted because the measured albedo reads cream in the studio render |
| cab, pilot, headlamp case, tender frame | `wood_painted` | Caledonian blue `#2a44b8` | wooden cab and pilot slats |
| tender tank, sand dome, truck frames | `steel_painted` | Caledonian blue | riveted iron tank (rivet rows in the tender photo) |
| wheel centres, window frames, roof, panels, stripes | `steel_painted` / `wood_painted` | vermilion `#c92a22` | |
| tyres, axles, bearings | `iron_cast` | natural | unpainted steel tyres |
| side + main rods, crossheads, guides | `aluminium` | natural | bright polished steel; brushed aluminium is the closest library strip (chrome is too mirror-like) |
| frames, saddle, firebox, lead truck | `steel_painted` | black `#2b2b2e` | |
| ties | `wood_weathered` | natural | grey weathered ties at Promontory |
| rails, tie plates, spikes | `iron_rust` | natural; railhead band `aluminium` | |
| ballast | `stone` | `#b9b2a4` | light gravel |
| wood box on tender, end sills | `pine` / `oak` | natural | |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side 3/4 (fireman's side) | https://commons.wikimedia.org/wiki/File:Replica_of_Central_Pacific_Railroad_-_60_steam_locomotive_(4-4-0)_(Golden_Spike_National_Historic_Site,_Utah,_USA)_1_(22825879887).jpg | proportions, dome order (steam dome, sand dome, bell, stack) |
| front 3/4 | https://commons.wikimedia.org/wiki/File:Replica_of_Central_Pacific_Railroad_-_60_steam_locomotive_(4-4-0)_(Golden_Spike_National_Historic_Site,_Utah,_USA)_2_(23220025425).jpg | headlamp, brass cylinders, pilot, smokebox "60" plate |
| cab + drivers | https://commons.wikimedia.org/wiki/File:Replica_of_Central_Pacific_Railroad_-_60_steam_locomotive_(4-4-0)_(Golden_Spike_National_Historic_Site,_Utah,_USA)_3_(22592928283).jpg | cab arch, name panel, gold stars on hubs, splashers |
| tender side | https://commons.wikimedia.org/wiki/File:Replica_of_Central_Pacific_Railroad_-_60_steam_locomotive%27s_tender_(Golden_Spike_National_Historic_Site,_Utah,_USA)_(23219999275).jpg | rivet rows, panel, C.P.R.R. band, arch-bar trucks |
| front | https://commons.wikimedia.org/wiki/File:Central_Pacific_Jupiter_01.jpg | pilot V, headlamp size, brass posts, saddle |
| cab close-up | https://commons.wikimedia.org/wiki/File:Jupiter_train_engine,_Golden_Spike_National_Historic_Site,_Promontory_Utah_-_May_2010.jpg | green door, window frames |
| paint history | https://utahrails.net/utahrails/promontory-locomotives.php · https://home.nps.gov/gosp/learn/historyculture/horse-of-a-different-color.htm | 1979 red scheme → 1994 blue/crimson/gold |

## Parts the engine needs
`axle_lead_*`, `axle_driver_*`, `axle_tender_*` (spin), `rod_side_*` / `rod_main_*` / `crosshead_*`
(slide: the DSL has no orbit, so rods slide through the crank throw), `cab_glass` and
`headlamp_lens` (glass surface), emitters `stack_smoke`, `cylinder_steam_*`.

## Modules
`loco_440.ts` (family, specs, checks) · `shared.ts` (constants, livery → strips, layout, helpers) ·
`wheels.ts` · `running-gear.ts` · `boiler.ts` · `fittings.ts` (headlamp, boards, pilot, pipework) ·
`cab.ts` · `tender.ts` · `track.ts`.

## Open questions
- Overall length, width and height are photo estimates (±5% gate), not published figures.
- The brief described the cab as red/maroon; every post-1994 photo shows a Caledonian-blue cab with
  vermilion frames and roof. The photos win; the 1979–1994 red scheme is not modelled.
- Gold scrollwork on the tender, headlamp and sand dome is approximated by brass lining; the
  lettering uses the library's 5 × 7 block font, not the replica's serif face.
