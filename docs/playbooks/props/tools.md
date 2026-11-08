# Tools playbook (hand and power tools)

Hammers, wrenches/spanners, screwdrivers, pliers, saws, chisels, axes for wood, shovels and rakes,
wheelbarrows, workbenches, vices; power tools (drill/driver, angle grinder, circular saw, jigsaw);
workshop kit (toolbox, ladder, sawhorse). Original designs and colours — the big power-tool
brands' colour schemes are trade dress. **Scale from the grip and the fastener**: handles fit a
hand (Ø 25–40 mm), and wrenches and bits are sized to standard fasteners.

## Research
Tool standards (ISO 3318 spanner sizes, ISO 2380 screwdrivers, DIN/ISO 1174 sockets, EN 131
ladders), maker catalogues (overall length, head size, mass), museum collections for
historic tools. Photos: profile, top, head close-up, grip texture, the tool in use (scale with hands).

| Tool | Key dimensions (typical) | Notes |
|---|---|---|
| claw hammer | 0.30–0.34 m long, head 0.12–0.14 m, face Ø 25–30 mm, 450–570 g (16–20 oz) | |
| club / lump hammer | 0.25–0.28 m, head 1–1.8 kg | |
| sledgehammer | 0.75–0.9 m, head 3–6 kg | |
| combination spanner | length ≈ 12–15 × jaw size (13 mm → 0.17 m) | ISO 3318 opening sizes |
| screwdriver | handle 0.09–0.12 × Ø 30–38 mm, shaft 75–150 mm | ISO 2380 |
| pliers (combination) | 0.16–0.2 m | |
| hand saw | blade 0.5–0.55 m, 7–10 TPI | |
| wood chisel | blade 6–38 mm wide, overall 0.22–0.3 | |
| felling axe | 0.7–0.9 m haft, head 1.0–1.6 kg | see [weapons](weapons-historic.md) for battle axes |
| spade / shovel | 1.0–1.1 m overall, blade 0.18–0.2 × 0.28 | |
| wheelbarrow | 1.4–1.6 × 0.6–0.7 × 0.6, wheel Ø 0.35–0.4, 85–100 l | |
| cordless drill | 0.18–0.22 long × 0.2–0.25 tall, chuck Ø 10–13 mm capacity | |
| angle grinder | disc 115 / 125 mm, body 0.28–0.32 | |
| workbench | 0.85–0.95 m high, 0.6–0.8 deep | |
| step ladder | treads 80+ mm deep, rise 0.25–0.3 | EN 131 |

## Part tree
```
hammer: handle (sway about the grip for swing anims), head, wedge (LOD0)
pliers: jaw_l (fixed), jaw_r (sway Z at the rivet ±20°), rivet
drill: body, grip, battery (detachable: socket attach), chuck (spin X), bit, trigger (slide −X), led (glow)
grinder: body, guard, disc (spin about its axis), side_handle
wheelbarrow: tray, frame, handle_l/_r, axle (spin Y) → wheel, leg_l/_r
vice: body (fixed jaw), jaw_moving (slide −X), screw (spin X), handle (slide along itself)
sockets: interact / attach at the grip (engine hand IK), 'mount' for tool racks
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| drill chuck | spin | X | 5–30 rps |
| grinder disc | spin | disc axis | 160–200 rps (bake slow) |
| circular saw blade | spin | Y | |
| pliers / scissors jaw | sway | Z at pivot | ±20–30° |
| vice jaw | slide | X | 0–0.15 m |
| wheelbarrow wheel | spin | Y | |
| folding tools | sway `oneWay` | pivot | 180° |

## Signature details
1. Handles with real shape: oval sections, flared ends, swell at the grip, finger grooves.
2. Wear: polished steel at striking faces and edges; paint worn off at grip zones.
3. Wooden handles with grain along the length; wedges in hammer and axe eyes.
4. Forged look: hammer heads with chamfered faces, claws with a V-slot.
5. Power tools: two-tone plastic (body + rubber overmould), vents, battery with contacts,
   rating stickers (invented), chuck jaws, cooling slots.
6. Size markings stamped on spanners and sockets (`text`, tiny).
7. Shadow board / toolbox context: tools hanging on pegs, open drawers.

## Materials
`steel_galvanised` / `chrome` (polished tool steel, chrome vanadium), `iron_cast` (vice bodies,
anvils), `steel_painted` (hammer heads, wheelbarrow trays), `oak` / `pine` / `wood_weathered`
handles, `rubber` grips and tyres, `plastic` power-tool bodies (original colour), `brass` (vintage
levels and fittings). Grime: rust spotting on unpainted steel, sawdust, grease at pivots.

## LOD policy
- LOD0: grip texture as geometry rings, stamped markings, vents, screws. Hand tool 0.5–3k;
  power tool 3–8k.
- LOD1: smooth handles, no markings. 100–600.
- LOD2: 12–60 triangles; tools are tiny at distance — keep the head shape, drop the rest.

## QA
```ts
real: { length: 0.33, width: 0.03, height: 0.13, measures: [
  { label: 'overall length', axis: 'x', value: 0.33, parts: ['handle', 'head'] },
  { label: 'face diameter', axis: 'y', value: 0.028, parts: ['head_face'] },
]},
checks: [touches('head', 'handle'), clear('jaw_r', 'jaw_l', 0.0)],
```

## Common mistakes
- Tools scaled to the wrong hand: 0.6 m hammers, 50 mm-thick screwdriver handles.
- Uniform grey: no polished edges, no handle material contrast.
- Power-tool colour schemes copied from a brand.
- Handle and head interpenetrating with no eye or wedge.

## Reuse
`hex_bolt` / `hex_nut` / `washer` (fasteners the tools act on, from the metric table — spanner
openings should match `METRIC[size].s`), `wheel` (wheelbarrow), `ladder`, `lathe` (handles),
`extrudeSvg` (spanner profiles, saw blades from SVG drawings).

## Sources
- ISO 3318 spanner sizes: https://en.wikipedia.org/wiki/Wrench#Standards
- Screwdriver types: https://en.wikipedia.org/wiki/Screwdriver
- Hammer types: https://en.wikipedia.org/wiki/Hammer
- EN 131 ladders: https://en.wikipedia.org/wiki/Ladder#Standards
