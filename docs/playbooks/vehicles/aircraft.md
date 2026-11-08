# Aircraft playbook (light prop plane, airliner basics)

High-wing and low-wing single-engine light aircraft, light twins, and narrow/wide-body airliner
basics. Historic types (1930s–1960s) are good named subjects; modern airliners: original designs
in the class, original liveries, no airline marks. **Scale from wingspan and fuselage length**
(type certificate data) and, for light aircraft, the propeller diameter and door height.

## Research
Type Certificate Data Sheet (FAA TCDS / EASA TCDS: propeller diameter limits, wheel/tyre sizes),
the Pilot's Operating Handbook dimension page (span, length, height, wing area, track, wheelbase),
three-view drawings (essential: wing planform, dihedral, tail shapes). Airport planning manuals
from airliner makers publish full dimension drawings and door sill heights. Photos: three-view,
3/4 front, wing root, landing gear, cockpit, engine cowling, tail close-up.

| Dimension | Light single (4-seat) | Light twin | Narrow-body airliner | Wide-body |
|---|---|---|---|---|
| wingspan | 10–11.5 m | 11.5–12.5 | 34–36 | 60–65 |
| length | 7.3–8.8 | 8.5–9.5 | 37–40 | 55–70 |
| height (to fin top) | 2.4–2.9 | 2.9–3.2 | 11.8–12.6 | 17–19 |
| fuselage width | 1.1–1.25 | 1.2–1.3 | 3.7–4.0 | 5.6–6.2 |
| prop Ø | 1.88–1.93 (fixed pitch 74–76 in) | 1.8–1.95 | — | — |
| fan Ø | — | — | 1.7–2.1 | 2.8–3.4 |
| main gear track | 2.4–2.6 | 3.0–3.5 | 5.7–7.6 | 9.5–11 |
| dihedral | 1.5–7° | 5–7° | 5–6° | 5–7° |
| wing chord (root) | 1.5–1.65 | 1.6–1.8 | 6–7 | 10–14 |
| door sill (from ground) | wing walk 0.5 | | 2.7–3.5 | 4.5–5.5 |

A 4-seat high-wing trainer: span 11.0 m, length 8.28 m, height 2.72 m (Cessna 172S figures,
AOPA/Cessna data) — use as a sanity anchor for the class.

## Part tree
```
fuselage (static: lofted shell) · wing_l / wing_r (or one wing on high-wing) · strut_l/_r
├── propeller (spin X; kind builder `propeller`) · spinner · cowling · exhaust (emitter)
├── aileron_l / _r (sway Y at hinge line, ±20°) · flap_l/_r (sway `oneWay` 0–30/40°)
├── elevator (sway Y ±25°) · rudder (sway Z ±20°) · trim_tab_* (optional)
├── gear_nose (sway Z steering ±30°) → wheel_nose (spin Y) · gear_main_l/_r → wheel_main_* (spin Y)
├── door_l/_r (sway Z or Y at hinge) · canopy (slide or sway) · glass_* (glass surface)
├── airliner: engine_l/_r (nacelle + fan spin X), slat_* (slide), spoiler_* (sway), gear doors
└── lights: nav_l (red, left wing tip = +Y), nav_r (green), beacon, strobe (glow); sockets: seat, camera
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| propeller / fan | spin | X | 2,000–2,700 rpm (props); bake slow + blur disc LOD |
| ailerons | sway | hinge line (≈ Y swept) | ±15–20°, opposite sides opposite sign |
| elevator | sway | Y | −15 / +25° |
| rudder | sway | Z | ±17–25° |
| flaps | sway `oneWay` | Y | 0–40° (light) / 0–30° + slide aft (Fowler) |
| nose wheel steer | sway | Z | ±10–30° |
| retractable gear | sway `oneWay` | gear pivot | 90° into the bay |

## Signature details
1. Correct planform: rectangular or tapered wing, the root chord at the right station.
2. Dihedral visible from the front; wing incidence 1–2° to the fuselage.
3. Control surface gaps (8–15 mm) along hinge lines — declare them as `gaps`.
4. Navigation lights: red on the left (+Y) tip, green on the right, white at the tail.
5. Light aircraft: wheel fairings, struts with fairings, step on the strut, fuel caps on the wing.
6. Airliner: windows as a row of rounded rectangles, doors with outlines, antennas, static wicks,
   engine pylon, fan blades and spinner, gear bogies with 2–4 wheels.
7. Riveted aluminium panels with lap lines; walkway marks on wings.
8. Cockpit: seats, panel, yoke/stick, visible through the glass.

## Materials
`steel_painted` or `plastic` for painted skins (original livery), `aluminium` for bare metal and
leading edges, `chrome` / `aluminium` spinner, `rubber` tyres, `glass` windows and canopy,
`canvas` for fabric-covered vintage wings, `plastic` interior, `iron_cast` brakes. Grime: exhaust
streaks along the belly behind the cowling, oil on the cowl, hand marks at the door.

## LOD policy
- LOD0: lofted fuselage ≥ 24 sections, control surfaces separate, rivet lines (`rivet_row` sparse),
  cockpit, gear detail, antennas. Light single 20–50k; airliner 80–200k.
- LOD1: 12 sections, cockpit blocks, gear simplified. 5–12k / 20–40k.
- LOD2: cross of fuselage + wings + tail, prop as a disc. 300–800 / 1,500–3,000.

## QA
```ts
real: { length: 8.28, width: 11.0, height: 2.72, measures: [
  { label: 'wingspan', axis: 'y', value: 11.0, parts: ['wing_'] },
  { label: 'propeller diameter', axis: 'z', value: 1.90, parts: ['propeller'] },
  { label: 'main gear track', axis: 'y', value: 2.5, between: ['wheel_main_l', 'wheel_main_r'] },
]},
checks: [clear('propeller', 'cowling', 0.01), symmetric('_l', '_r', 'y'), touches('strut_*', 'wing_*')],
gaps: [{ parts: ['aileron_*', 'wing_*'], why: 'aileron hinge gap' }],
```
`real.width` here is the span (+Y), since +X is the nose direction.

## Common mistakes
- Wings mounted at the wrong station (the CG is ~25 % chord; the wing root sits around the cabin).
- No dihedral; tail too small (horizontal tail span ≈ 1/3 of wingspan on light aircraft).
- Prop disc intersecting the cowling or the ground (prop tip clearance ≥ 0.18 m on a nose-gear plane).
- Nav light colours swapped.
- Airline livery or logo copied.

## Reuse
`propeller` kind builder, `loft` + `ringXY` (fuselage, nacelles), `sweep` (wing struts, antennas),
`wheel` (`spokes: 0`, small), `rivet_row`, `lamp` (`glow` for nav lights), `hinge` for doors.

## Sources
- FAA TCDS search: https://drs.faa.gov/ · EASA TCDS: https://www.easa.europa.eu/en/document-library/type-certificates
- Light single anchor (172S: 11.0 m span, 8.28 m length, 2.72 m height): https://www.aopa.org/go-fly/aircraft-and-ownership/aircraft-fact-sheets/cessna-172
- Navigation lights: https://en.wikipedia.org/wiki/Navigation_light
- Aircraft planning manuals (airliners): maker "airport compatibility" pages
