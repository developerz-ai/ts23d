# Roadster V10 — original front-engine V10 two-seat roadster (`roadster_v10`, `roadster_v10_open`)

## Identity
An ORIGINAL design in the class of big-displacement front-mid-engine American-style roadsters:
a very long hood over a 90° V10 set behind the front axle, the cabin pushed far back over the rear
axle, side-exit exhausts running under the doors, wide rear haunches over 355-section tyres, twin
"speed hump" fairings behind the headrests and a short ducktail. No manufacturer's name, badge,
logo or body design is copied: car designs are licensed IP in games, so the body lines, lamps,
grille, wheels and lettering ("V10 8.4" on the valve covers, a plain hexagon badge) are invented
here. Dimensions are chosen inside the class envelope and every engineering number below comes
from a public reference.

Signature features: clamshell hood hinged at the nose, opening forward with the fender tops ·
fender gills behind the front wheels · chrome side pipes under the sills · twin roll hoops in the
humps · double-wishbone suspension and big vented, cross-drilled discs with 6-piston (front) and
4-piston (rear) calipers visible through the spokes.

## Specs
| Dimension | Value | Source |
|---|---|---|
| overall length | 4.46 m | class envelope, 4.4–4.5 m for front-engine V8/V10 two-seaters; design choice |
| body width (no mirrors) | 1.94 m | class envelope 1.85–1.95 m; design choice. Over mirrors 2.22 m (measured on the model) |
| height (top of windscreen) | 1.235 m | class envelope 1.21–1.26 m; design choice |
| wheelbase | 2.51 m | class envelope 2.44–2.69 m; design choice |
| track front / rear (tyre centres) | 1.58 / 1.56 m | design choice; tyres fill the arches of a 1.94 m body |
| front tyre | 295/30 ZR18 → Ø 634 mm, 295 mm wide | ISO metric tyre code: Ø = rim + 2 × 0.30 × 295 mm, https://en.wikipedia.org/wiki/Tire_code |
| rear tyre | 355/30 ZR19 → Ø 696 mm, 355 mm wide | same formula |
| loaded radius | 98.5 % of free radius | contact-patch deflection of low-profile tyres, https://en.wikipedia.org/wiki/Tire#Dimensions |
| ground clearance | 0.12 m at the floor pan | design choice; class 0.10–0.13 m |
| engine | 8.4 L 90° V10, OHV 2 valves/cyl, bore 103 mm × stroke 100.6 mm, bore pitch 119.4 mm | V10 layout: https://en.wikipedia.org/wiki/V10_engine · 90° V and firing: https://en.wikipedia.org/wiki/V_engine · displacement check 10 × π/4 × 0.103² × 0.1006 = 8.38 L |
| suspension | unequal-length double wishbones, coil-over dampers, anti-roll bars both ends | https://en.wikipedia.org/wiki/Double_wishbone_suspension |
| brakes | 355 mm vented cross-drilled discs, 6-pot front / 4-pot rear opposed calipers | https://en.wikipedia.org/wiki/Disc_brake (vented, drilled, multi-piston calipers) |
| roll-over protection | two hoops behind the seats, faired into the deck | https://en.wikipedia.org/wiki/Roll_bar |
| layout | front-mid engine, rear-wheel drive, transaxle-free (gearbox behind the engine in the tunnel) | https://en.wikipedia.org/wiki/Front-engine,_rear-wheel-drive_layout |
| dimension conventions | length/width/height/wheelbase/track as SAE J1100 | https://www.sae.org/standards/content/j1100_202311/ |
| panel gaps | 3–5 mm shut lines | typical production fit-and-finish, https://en.wikipedia.org/wiki/Panel_gap |

## Photos (by view)
Original design: no single reference car. Class references for proportion and engineering read
(open licences, Wikimedia Commons), used only for "how big is a V10 in a bay, where do side pipes
run, how far back does the cab sit" — never for the body lines:
| View | URL | Notes |
|---|---|---|
| V10 engine bay layout | https://commons.wikimedia.org/wiki/Category:V10_engines | plenum on top of the V, manifolds outboard, coil packs on the heads |
| double wishbone corner | https://commons.wikimedia.org/wiki/Category:Double_wishbone_suspension | upright, two A-arms, coil-over to a tower |
| drilled vented discs + calipers | https://commons.wikimedia.org/wiki/Category:Disc_brakes | radial drill pattern, vanes between the plates |
| side-exit exhausts | https://commons.wikimedia.org/wiki/Category:Side_exhausts | pipes under the door sill, heat shields |

## Parts the engine needs
Moving: `hood` (sway about +Y at the nose pivots, `oneWay` 58°; gooseneck arms in `hood_trim`) ·
`door_l`, `door_r` (sway about ∓Z at the A-pillar hinge line, `oneWay` 65°; cards, mirrors and hinge
leaves in `door_*_trim`) · `trunk_lid` (sway about +Y, `oneWay` 50°) · `fuel_door` (sway, `oneWay`
85°) · `steer_fl`, `steer_fr` (sway about Z at the kingpin, ±8°) carrying `upright_*` and
`wheel_fl/fr` · `wheel_rl/rr` · every `wheel_*` spins about Y and carries its `rim_*` (brushed
finish).

Static, named for damage models and decals: `fender_l/r`, `sill_l/r`, `quarter_l/r`, `cowl`,
`rear_deck`, `nose_fascia`, `tail_fascia`, `door_jambs`, `engine_bay` (all paint slot `body`),
`body_stripes` / `hood_stripes` / `trunk_lid_stripes` (paint slot `stripe`), `windscreen`
(glass), `windscreen_frame`, `wipers`, `body_trim`, `headlamps`, `headlamp_lenses`, lamps
`headlamp_l/r_drl` and `taillight_l/r_led` (emissive), `engine_block`, `engine_heads`,
`engine_intake`, `exhaust`, `cooling`, `bay_ancillaries`, `driveline`, `suspension_fl/fr/rl/rr`,
`front_axle`, `rear_axle`, `frame`, `floor_pan`, `wheel_liners`, `under_tray`, `trunk_tub`,
`hinges`, `seats`, `dashboard`, `gauge_faces` (emissive), `steering_wheel`, `controls`, `carpet`,
`roll_hoops`.

Sockets: `seat_driver`, `seat_passenger`, `camera_cockpit`, `camera_chase`, `engine_audio`,
`exhaust_audio_l/r`, `tow_front`, `tow_rear`; lights (KHR_lights_punctual) `headlamp_l/r` (spot)
and `taillight_l/r` (point); emitters `exhaust_smoke_l/r` at the side-pipe tips.

Liveries (paint slots `body` + `stripe`, clearcoat + metallic flake kept by every livery):
`crimson` (default), `cobalt_stripes` (blue, white twin stripes), `sun_yellow`, `gloss_black`.

## Open questions / decisions
- Width is checked as the body (1.94 m, `measures`); the proportions gate sees mirrors too, so
  `real.width` is the over-mirror width.
- The QA `clashes` gate sweeps a hinged panel to millimetres (D23). `clearOf` keeps only true contacts and the nose lip, which dips into the fascia because the hood hinge sits 13 cm behind the hood front.
  Open design question: move the hood hinge to the lip so it no longer dips into the nose.
- Front track 1.55 m (not 1.58): with ±8° of steer the 295 tyre's corners need ~4 cm inside the
  fender skin, and the clashes gate proved 1.58 m too tight.
- `roadster_v10_open` declares its own `real` envelope (3.8 m wide with both doors out, 1.93 m
  tall with the hood up), derived from the hinge geometry, and the open shut lines as gaps.
