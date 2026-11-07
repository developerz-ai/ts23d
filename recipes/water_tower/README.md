# Railroad water tank — Frisco, Beaumont, Kansas (c. 1886) (`water_tower`)

## Identity
The St. Louis & San Francisco ("Frisco") 50,000-gallon cypress-stave water tank at Beaumont, KS:
NRHP-listed (93000843) and HABS-recorded (KS-82), so its dimensions are on paper, and it is the
textbook American wayside tank. Signature features: a squat stave tub bound by steel hoops (closer
near the bottom, where the pressure is), a low six-sided shingle roof with a finial, a timber
trestle of posts on concrete footings with X bracing round a wooden central core, and the
goose-neck delivery spout over the track (removed at Beaumont in the 1950s; restored here from the
period type Berg describes).

## Specs
| Dimension | Value | Source |
|---|---|---|
| tank height (staves) | 14 ft (4.267 m) | NRHP nomination 93000843, §7, https://npgallery.nps.gov/GetAsset/f632b7b3-36b4-4a36-be22-47bb617fad0d |
| tank diameter | 22 ft (6.706 m) | same |
| superstructure (ground → tank floor) | 14 ft (4.267 m) | same |
| central core | 10 ft dia × 14 ft high (3.048 × 4.267 m) | same |
| supports | 8 timber pillars on concrete footings, cross-braced | same |
| capacity | 50,000 US gal | same (6.706² π/4 × 4.267 m = 150.7 m³ ≈ 39,800 gal of staves at the inside; the quoted figure is nominal) |
| roof | six-sided, wooden shingles | same |
| spout | goose-neck delivery spout projecting over the track | Berg, *Buildings and Structures of American Railroads* (1893) p. 116, quoted in the nomination |
| roof rise, finial, hoop count | ≈ 1.05 m rise, 14 hoops | ESTIMATE, scaled from the photo (tank height as ruler) |
| spout length / rest angle | 3.4 m, 25° up | ESTIMATE (D&RGW tank practice, railroads procgen recipe station_prop_water_tank_wood) |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| 3/4 side | https://commons.wikimedia.org/wiki/File:Beaumont_Kansas_Water_Tower.jpg | hoops, hexagonal roof, posts on footings, X braces, core, ladder pole |
| record | https://en.wikipedia.org/wiki/Beaumont_St._Louis_and_San_Francisco_Railroad_Water_Tank | HABS KS-82 (12 measured drawings) |
| spout type | https://davesriogrande.net/Structures/WaterTanks/watertanks.htm | D&RG tanks with spouts (Chama double spout, Osier) |

## Parts the engine needs
`spout` (pivot at the tank outlet, `sway` about Y: lowered over a tender) · `socket` `water_fill`
(interact) at the spout mouth · `tank`, `trestle`, `core`, `roof`.

## Open questions
- The current Beaumont trestle (heavy timbers, concrete footings) is a 20th-century replacement; the
  nomination says the original bracing was lighter. The current one is modelled (it is in the photo).
- Roof rise and hoop count are photo estimates; HABS drawings (loc.gov, 403 to fetchers) would fix them.
