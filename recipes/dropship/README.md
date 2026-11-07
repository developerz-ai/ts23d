# VTD-20 "Kite" — VTOL troop dropship (`dropship`)

## Identity
An **original** design, made to show the mid-poly hard-surface sci-fi look (the "military
near-future" prop style of big modern shooters). It copies no franchise ship, name or logo.
It is a 20 m troop transport that lands on skid gear and loads through a rear ramp. Two tilting
ducted-fan nacelles on stub wings give it VTOL and thrust vectoring.

Signature features: a chamfered, tumblehomed fuselage with a wrap-around canopy; armoured gear
sponsons along the lower flanks; a dorsal drive hump; big nacelles with hazard-striped intakes and
glowing exhausts; an upswept tail boom with a V-tail and twin thrusters; a chin gun turret.

## Scale references (real aircraft)
| Dimension | Real reference | Value (m) | Source |
|---|---|---|---|
| fuselage length | V-22 Osprey | 17.47 | https://thedefensepost.com/2026/08/03/v-22-osprey-guide/ |
| stowed width / rotor Ø | V-22 Osprey | 5.6 / 11.6 | https://www.boeing.com/defense/military-rotorcraft/v-22-osprey |
| height, nacelles vertical | V-22 Osprey | 6.7 | https://thedefensepost.com/2026/08/03/v-22-osprey-guide/ |
| fuselage length / width | CH-47F Chinook | 15.88 / 3.78 | https://www.boeing.com/defense/military-rotorcraft/h-47-chinook |
| cabin L × W × H | CH-47 Chinook | 9.3 × 2.29 × 1.98 | https://www.inetres.com/gp/military/ar/rotor/CH-47.html |

## Design spec (what `real` / `measures` hold the model to)
| Dimension | Value (m) | Why |
|---|---|---|
| overall L × W × H | 20.2 × 13.4 × 6.0 | between the V-22 (17.5 m fuselage) and a CH-47 with rotors |
| fuselage width | 3.70 | CH-47 3.78 m |
| fuselage depth (belly → roof) | 3.00 | CH-47 1.98 m cabin + floor and roof structure |
| cabin (inside the walls) | 9.9 × 3.54 × 2.84 | 24 troop seats; 2 m headroom under the lamps |
| nacelle centres | 11.10 | ducted fans sit inboard of where V-22 rotors sit |
| nacelle length | 4.20 | |
| main gear track | 4.10 | under the sponsons |
| ramp width / length | 2.80 / 3.20 | CH-47 ramp is full cabin width (2.29 m) |

## Shape language
- **Big:** the fuselage loft (10-point chamfered section with 0.26 m tumblehome above the waist),
  the sponsons, the dorsal hump, the nacelles and the tail boom. Weighted normals with a
  25–35° hard angle keep the panels flat and the chamfers crisp.
- **Medium:** bevelled armour plates with 6 cm seams, the crew door, intakes, vents, wing
  panels, gear struts and pads, ramp side rails.
- **Small (LOD0 only):** canopy frames, panel seams, bolt rows, intake slats, ramp anti-slip ribs,
  antennae, pitot probes, seeded roof greebles (`ctx.rng.fork('greeble')`), hazard bands.
- **Readability:** hazard stripes mark everything that moves or blows: intake lips, the ramp lip,
  gear pads, the sponson step, fin tips and the wing-tip pivots.

## Palette (sRGB)
| Role | Hex |
|---|---|
| hull / roof | `#636b71` / `#788086` |
| armour panels | `#4b5258` |
| belly | `#2c3135` |
| seams, dark metal | `#1f2326`, `#222528` |
| accent stripe | `#c8641c` |
| hazard | `#d9a421` + `#17181a` |
| glass | `#3f7598` (surface `glass`) |
| thruster glow | `#6fd2ff` (glow strength 8) |

## Parts the engine needs
| Name | What | Motion |
|---|---|---|
| `nacelle_l`, `nacelle_r` | engine pods, pivot at the wing-tip bearing | sway ±30° about Y (thrust vectoring) |
| `fan_l`, `fan_r` | ducted fans (children of the nacelles) | spin 6 rps about Z |
| `thruster_l`, `thruster_r`, `thruster_tail_l/_r` | exhaust discs | glow |
| `ramp` | rear loading ramp, pivot on the hinge line | rests closed (40°); one-way sway 62.5° about −Y down to the ground (−22.5°) |
| `turret` › `gun` | chin turret, twin guns | turret sway ±50° about Z, gun ±12° about Y |
| `canopy` | windscreen + side glass | surface `glass` |
| sockets | `nav_l` red (port = +Y), `nav_r` green, `nav_tail` white strobe, `landing_light` spot, `cabin_light`, `muzzle_gun` mount | KHR_lights_punctual |
| emitters | `thrust_l/_r` (always), `thrust_tail_l/_r` (moving), `downwash_l/_r` dust (moving), `muzzle` (event) | |

Static parts, AO-baked against each other: `fuselage`, `sponson_l/_r`, `dorsal`, `tail_boom`,
`hull_detail`, `cabin` (deck, wall panels, 24 seats), `wing_l/_r`, `gear_l/_r/_nose`,
`hinge_ramp`, `turret_ring`. Glowing parts: `navlight_l/_r/_tail`, `cabin_lamp`.

## Markings
Hull number `07` in stencil off-white (`#d6d3c8`) on both sponsons (0.45 m) and both faces of
both fins (0.5 m); `NO STEP` on the wing walkway panels (LOD0). Built with `text`.

## Open questions / known gaps
- The ramp's closed pose leaves a 15 cm seam under the boom: the clash sweep bins the arc in 5°
  steps, so the boom underside was raised to clear the widened bin. `rampArc` still checks the
  ground, which isn't geometry.
- `clearOf` only lists real interlocks now: `hinge_ramp` (ramp knuckles on the rod),
  `turret_ring` (turret in its ring), `turret` (gun housing in the ball), `wing_*` (nacelle shaft
  in its bearing).
- No true-arc check for turret and gun beyond the clashes sector sweep.
