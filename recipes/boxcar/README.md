# USRA 50-ton single-sheathed boxcar — 1918 (`boxcar`, `boxcar_nw`)

## Identity
The US Railroad Administration's standard 40 ft single-sheathed boxcar (spec 1001-B, 25,000 built
from Oct 1918), chosen because it is THE generic American freight car of 1918–1950 and because its
outside steel framing reads at any distance. `boxcar` is Clinchfield (C.C.& O.) 8024 as built by
Bettendorf (NARA photo below); `boxcar_nw` is a Norfolk & Western car (same body, other livery).

Signature features: vertical wood sheathing with the steel posts and diagonal braces OUTSIDE it
(braces lean toward the door), a 6 ft sliding door hung on a bottom track, a low steel roof with a
wooden running board, grab-iron ladders at diagonally opposite corners, a vertical brake staff with
a horizontal wheel at roof level on the B end, knuckle couplers, cast-steel side-frame trucks.

## Specs
| Dimension | Value | Source |
|---|---|---|
| inside length | 40 ft 6 in (12.344 m) | B&M RHS ORER table, https://bostonmaine.squarespace.com/box_71000_series (via search summary; page 404s to fetchers) |
| inside width / height | 8 ft 6 in / 8 ft 7 in (2.591 / 2.616 m) | same |
| outside (body) length | 41 ft 3 in (12.573 m) | same |
| extreme width | 9 ft 6 in (2.896 m) | same |
| extreme height (top of running board over rail) | 13 ft 3 in (4.039 m) | same |
| length over pulling faces | ≈ 43 ft 9 in (13.34 m): body + 2 × 15 in coupler reach | coupler reach from PRR X29 plan (railroads/tools/procgen recipe wagon_goods_boxcar) |
| wheel diameter | 33 in (0.838 m), the US freight standard | https://kadee.com/553-ho-scale-andrews-1898-self-centering-trucks-with-33-ribbed-back-wheels-metal-fully-sprung |
| truck wheelbase | 5 ft 6 in (1.676 m) | Andrews truck, https://www.nasg.org/Gallery/reports/scale/cars/modeltype/StrucksAndrews.php |
| door opening | ≈ 6 ft (1.83 m) | scaled from the NARA photo against the 41 ft 3 in body |
| coupler centre over rail | 34½ in (0.876 m), MCB standard | MCB / AAR standard height |
| truck centres | ≈ 30 ft 9 in (9.37 m) | ESTIMATE, scaled from the NARA photo |
| gauge | 4 ft 8½ in (1.435 m) | standard gauge |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side, 3/4 front | https://commons.wikimedia.org/wiki/File:Military_Administration_-_Transportation_-_Rail_-_Construction_-_50_TON_SINGLE_SHEATHED_BOX_CAR_being_constructed_for_U.S._Railroad_Administration_by_the_Bettendorff_Co.,_Bettendorff,_Iowa_-_NARA_-_45502055.jpg | Clinchfield 8024, Bettendorf 1918: 4 braced panels each side of the door, lettering layout |
| model reference, all views | https://rapidotrains.com/ho-scale/freight-car/usra-ss-boxcar.html | N&W 42574 livery, ends, roof, brake gear |
| background | https://en.wikipedia.org/wiki/USRA_standard | spec 1001-B, 25,000 built |

## Parts the engine needs
`truck_a`, `truck_b` (pivots; engines yaw them on curves) · `axle_a_0` … `axle_b_1` (spin about Y,
children `*_wheel_l/_r`) · `door_l`, `door_r` (slide one way toward −X, `oneWay`) · `coupler_a`, `coupler_b` (+X / −X).

## Open questions
- The ORER row (B&M 71000) carries 8 ft 7 in inside height; another page claims 9 ft. The ORER value
  is used; 13 ft 3 in extreme height is consistent with it.
- Truck centres are not published in the sources found: 9.37 m is scaled from the photo.
- Lettering is painted on the boards and post faces; the diagonal braces cross over it (a stroke
  painted on a brace face jumps sideways in parallax and garbles the word at 3/4 views).

## Materials
Painted plank sheathing and door (`wood_painted`: car colour over grey wood, worn at board edges and
ends), silver-grey running board and saddles (`wood_weathered`), painted steel frame, sills and roof
(`steel_painted`), sand-cast trucks, wheels and bolsters (`iron_cast`), and rusty hardware: grab
irons, couplers, brake gear (`iron_rust`). The numbers and sources are in
`docs/architecture/materials.md`.
