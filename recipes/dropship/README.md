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
| portholes | `#3f7598` |
| canopy glazing | `#1c3649` smoked (surface `glass`, `optics.glass`: transmission 0.3, roughness 0.1); `#101d28` opaque at LOD2 |
| cockpit shade behind the canopy | `#0d0f12` (`canopy_shade`, LOD0–1) |
| cockpit fittings on the shade | seats `#5d574c`, headrests `#34322e`, console and pedestal `#2a2d31`, screens `#3d9fc4` (LOD0–1) |
| thruster glow | `#6fd2ff` (glow strength 3; nav lights 2, tail and cabin lamps 1.5) |

## Parts the engine needs
| Name | What | Motion |
|---|---|---|
| `nacelle_l`, `nacelle_r` | engine pods, pivot at the wing-tip bearing | sway ±30° about Y (thrust vectoring) |
| `fan_l`, `fan_r` | ducted fans (children of the nacelles) | spin 6 rps about Z |
| `thruster_l`, `thruster_r`, `thruster_tail_l/_r` | exhaust discs | glow |
| `ramp` | rear loading ramp, pivot on the hinge line | rests closed (40°); one-way sway 62.5° about −Y down to the ground (−22.5°) |
| `turret` › `gun` | chin turret, twin guns | turret sway ±50° about Z, gun ±12° about Y |
| `canopy` | windscreen + side glass | surface `glass` at LOD0–1, opaque colour at LOD2 |
| `canopy_shade` | matt cockpit shadow on the nose skin under the panes, with the two crew seats, centre pedestal and the console with two screens laid on it (the glass is 2 cm over the skin: no room in the round) (LOD0–1) | static |
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

## Wear and far-LOD identity
- Exhaust scorch: soot in each nacelle's bore, on the nozzle lip and up the cowl to the lower
  armour ring, burnt brown paint above it, clean again 1.5 m up (the cowl has two extra rings at
  LOD0–1 to carry the gradient); soot round the tail thrusters on the last 1.3 m of the boom.
  Applied after the finish pass, so it overrides paint, chips and dust.
- Oil weeping from the gear-bay fasteners: dark runs 9–17 cm wide down the sponson armour under
  the bolts by the main gear, drawn aft; hydraulic lines down each strut (LOD0).
- Plates (LOD0–1): two replaced roof panels in the lighter grey, two older roof panels, the
  tumblehome ahead of the first porthole and the nose access hatches a tone darker, each on one
  skin face between two frame stations.
- Canopy: the white speckle on one pane was the beauty render's noise, not geometry: clear
  glass (transmission 1) reflects 4 % face-on, the path tracer picks that lobe for 4 % of its 16
  samples and weights it 25×, so the pane that mirrors the key light came back as scattered
  white pixels (it moved to another pane when the camera moved). The glazing is now smoked
  (transmission 0.3), which samples the reflection two times in three, and a matt shade sheet
  covers the chipped hull paint that showed through the panes. A fix in the renderer would
  be to add the reflected sun at every thin-surface vertex instead of choosing the lobe.
- Hero camera: `hero: { azDeg: -38, elDeg: 11 }`, low enough to see the scorched cowls, the
  sponson flank and the gear.
- The nose is faired: three sections per design station span on a Catmull-Rom curve (the five
  stations themselves unchanged). Straight spans made every nose panel a twisted quad that
  shaded as two triangles; the canopy panes and frames follow the faired sections.
- LOD1 and LOD2 keep the nacelle hazard rings (one stripe per cowl facet) and LOD2 keeps the
  hull number on the sponsons: the strongest colour accents no longer vanish at distance.
- Not done here: thinner paint chipping on the big plates needs a `steel_painted` variant in the
  material library (the strip's chip density is fixed on the shared sheet).
