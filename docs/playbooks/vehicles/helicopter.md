# Helicopter playbook

Single main rotor + tail rotor helicopters: light piston (2-seat trainers), light turbine (4–6
seats), medium twin (12–15 seats), and historic utility types (1950s–1970s are well documented and
make good named subjects). Original liveries; no operator marks. **Scale from the main rotor
diameter**: it is the first line on every spec sheet and the most visible shape in flight.

## Research
Rotorcraft Flight Manual / maker spec: main rotor Ø, tail rotor Ø, length (rotors turning and
fuselage only), height (to rotor head or tail fin top), cabin width, skid width or gear track,
blade count, rotor rpm. Three-view drawing. Photos: side, front, top (blade planform and tip
shape), rotor head close-up (swashplate, pitch links), tail rotor, skids or wheels, cockpit.

| Dimension | Light piston 2-seat | Light turbine 5-seat | Medium twin |
|---|---|---|---|
| main rotor Ø | 7.7–8.4 m | 10.0–11.3 | 12.5–14.0 |
| blades | 2 | 2–4 | 4–5 |
| tail rotor Ø | 1.05–1.3 | 1.6–2.0 (or shrouded fan ~0.75) | 2.2–2.8 |
| fuselage length | 7.0–8.9 (incl. tail boom) | 9.5–11.5 | 13–14.5 |
| length, rotors turning | 8.7–10 | 12.5–13 | 16–18 |
| height (rotor head top) | 2.7–3.0 | 3.1–3.6 | 3.9–4.5 |
| cabin width | 1.0–1.3 | 1.4–1.8 | 2.0–2.4 |
| skid track | 1.9–2.2 | 2.0–2.5 | wheels 2.5–3.0 |
| rotor rpm | 500–530 | 380–410 | 260–320 |
| blade chord | 0.18–0.25 | 0.27–0.35 | 0.4–0.6 |

## Part tree
```
fuselage (static: cabin pod + tail boom + fin) · glass_* (glass surface) · door_l/_r (sway Z / slide X)
├── mast → rotor_main (spin Z) → hub, blade_0..n (static under the hub; optional flap sway)
│   └── swashplate (static) · pitch_link_* (static)
├── rotor_tail (spin Y, at the boom end; left or right side) → blades
├── skid_l/_r + cross_tube_f/_r (static) · or gear_* → wheel_* (spin Y)
├── engine_cowling (static; access panels sway), exhaust (emitter smoke/heat)
├── stabiliser (horizontal tail, static) · tail_skid
└── lights: nav, beacon (glow); sockets: seat (pilot, passengers), attach (cargo hook), camera
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| rotor_main | spin | Z | 4–9 rps (bake a slow clip; engines drive the rest) |
| rotor_tail | spin | Y | ≈ 5–6 × main rotor rps |
| blades | sway (droop at rest) | Y at the hinge | −3° static droop, optional ±5° flap |
| sliding cabin doors | slide `oneWay` | −X | door width |
| hinged doors | sway `oneWay` | Z at front hinge | 90° |

Main rotor direction: rotation chosen by the design; tail rotor on the side that counters it.
Be consistent with your torque direction in the dossier.

## Signature details
1. Blades long and thin (aspect ratio 15–20), with droop at rest, tip shape per type.
2. Rotor head: hub, pitch links, swashplate, mast fairing.
3. Bubble or large-glass cockpit with chin windows; framing thin.
4. Tail boom tapering to the tail rotor gearbox, fin, horizontal stabiliser, tail skid.
5. Skids on cross tubes with steps; ground handling wheel fittings.
6. Engine intakes with screens, exhaust pipes, cowling access panels.
7. Antennas under the boom, nav lights, anti-collision beacon on top.

## Materials
`steel_painted` / `plastic` fuselage (original livery), `aluminium` skids, cross tubes, rotor hub
and bare panels, `steel_painted` grey/black blades with `steel_galvanised` leading-edge strip,
`glass` cockpit, `plastic` interior, `leather` / `canvas` seats, `rubber` seals and tyres.
Grime: exhaust soot streak down the boom, oil at the transmission deck, scuffed skid steps.

## LOD policy
- LOD0: rotor head linkages, blade tip caps, door handles, cockpit with instruments, rivet lines,
  intake screens (`cutout`). 20–60k.
- LOD1: hub as a block, blades as flat lofts, cockpit seats only. 5–12k.
- LOD2: pod + boom + rotor disc (or 2–4 flat blades) + skids. 300–800.

## QA
```ts
real: { length: 12.9, width: 10.7, height: 3.3, measures: [
  { label: 'main rotor diameter', axis: 'y', value: 10.69, parts: ['rotor_main'] },
  { label: 'tail rotor diameter', axis: 'z', value: 1.86, parts: ['rotor_tail'] },
  { label: 'skid track', axis: 'y', value: 2.3, between: ['skid_l', 'skid_r'] },
]},
checks: [clear('rotor_main', 'fuselage', 0.3), clear('rotor_tail', 'fin', 0.05),
         touches('skid_*', 'cross_tube_*'), symmetric('_l', '_r', 'y')],
```
Bake rotors with blades along ±Y at rest so the rotor-diameter measure reads across Y.

## Common mistakes
- Rotor too small (≈ fuselage length is right for most light helicopters).
- Blades thick and short like a fan; no droop.
- Tail rotor spinning about Z, or on the wrong side for the torque direction.
- Main rotor clearing the tail boom by centimetres — the blade path must clear the boom when flapping.
- Skids floating under the cross tubes.

## Reuse
`propeller` kind builder (main and tail rotors: `blades`, `radius`), `loft` (cabin and boom),
`sweep` (cross tubes, skids), `pipe` (exhaust), `lamp` (glow), `hinge` (doors).

## Sources
- Helicopter rotor systems: https://en.wikipedia.org/wiki/Helicopter_rotor
- Tail rotor: https://en.wikipedia.org/wiki/Tail_rotor
- FAA type certificate data sheets (rotorcraft): https://drs.faa.gov/
