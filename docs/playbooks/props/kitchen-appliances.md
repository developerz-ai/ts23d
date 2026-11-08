# Kitchen appliances playbook

Fridges and fridge-freezers, cookers (freestanding range, built-in oven, hob), dishwashers, washing
machines, sinks, microwaves, kettles, toasters, range hoods — plus the kitchen units they sit in.
Original designs; no maker badges or control-panel graphics. **Scale from the 600 mm module**:
European kitchens are coordinated on EN 1116 (600 mm wide units, 850–950 mm worktops); US on the
24 in / 36 in module.

## Research
EN 1116 coordinating sizes (worktop heights, recess sizes, unit widths), appliance installation
sheets (cut-out sizes, door swing clearances), ergonomics for handle and control heights. Photos:
front, side (depth, handle projection), door open, controls close-up, installed context.

| Item | Typical size (W × D × H) | Source / note |
|---|---|---|
| worktop | 850 / 900 / 950 mm high, ≥ 600 mm deep, 30–40 mm thick | EN 1116 |
| base unit | 400 / 500 / 600 / 900 mm wide, plinth ≥ 80 mm (100–150 typical) | EN 1116 |
| built-under recess | ≥ 820 / 870 / 920 mm high | EN 1116 |
| wall units | 300–350 deep, bottom ≥ 450 mm above worktop | EN 1116 |
| US base cabinet | 24 in deep, 34½ in + 1½ in top = 36 in (914 mm) | |
| fridge-freezer (EU) | 595–600 × 600–680 × 1,750–2,000 | |
| US French-door fridge | 0.75–0.91 × 0.75–0.9 × 1.7–1.78 m | |
| freestanding cooker | 500–600 (EU) / 760 (30 in, US) × 600 × 900 | |
| dishwasher | 450 or 600 × 550–600 × 815–870 | |
| washing machine | 600 × 550–600 × 850 | |
| microwave (counter) | 0.45–0.55 × 0.35–0.45 × 0.26–0.33 | |
| sink bowl | 0.35–0.5 × 0.4 × 0.18–0.22 deep | |
| kettle | 0.2–0.25 tall, 1.5–1.7 l | |
| hob burner / zone | Ø 140–280 mm | |

## Part tree
```
fridge: cabinet, door_upper (sway Z at hinge side), door_lower / drawer_freezer (slide +X), handle_*,
        interior: shelf_*, door_bin_*, light (glow), seal (rubber)
cooker: body, hob (zones / burners + pan supports), oven_door (sway Y at bottom hinge, 90°) → glass,
        knob_<i> (sway X ±135°), grill_door, drawer, socket heat (emitter steam over hob)
dishwasher / washer: body, door (sway Y bottom hinge / sway Z porthole), drum (spin X), rack_* (slide +X)
microwave: body, door (sway Z), turntable (spin Z), window (glass)
sink: bowl (cut into worktop), tap (spout sways Z ±60°), drainer
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| fridge door | sway `oneWay` | Z at hinge side | 110–130° |
| oven / dishwasher door | sway `oneWay` | Y at bottom | 90° |
| freezer drawer, racks | slide `oneWay` | +X | 0.4–0.5 m |
| washing machine drum | spin | X (front-loader) | 0.2–20 rps |
| microwave turntable | spin | Z | 0.1 rps |
| knobs | sway | X | ±135° |
| tap spout | sway | Z | ±60° |

## Signature details
1. Door gaps and rubber seals; handles that stand 30–60 mm proud with real grips.
2. Rounded corners (radius 5–30 mm) on white goods; enamel or stainless finish.
3. Controls: knobs with indicator lines, buttons, a display window (glow when on).
4. Oven: glass door with a dark inner pane, visible racks, enamel cavity.
5. Hob: pan supports (cast iron grids) over burners, or flush black glass with ring markings.
6. Fridge interior: shelves, bins, a light, feet with adjustable levelling.
7. Installed context: kickboard (plinth), worktop overhang 20–40 mm, wall tiles.

## Materials
`plastic` / `steel_painted` white or coloured enamel bodies, `aluminium` / `chrome` for stainless
look (aluminium = brushed), `glass` doors, panels and displays (glow for displays), `rubber`
seals and feet, `iron_cast` pan supports, `plastic` black controls. Grime: light; fingerprints on
handles via roughness variation (custom material), burnt residue around burners.

## LOD policy
- LOD0: bevelled bodies, seals, handles, knobs, interiors behind glass, vents. 2–8k each.
- LOD1: handles and knobs as simple shapes, no interior. 300–1,000.
- LOD2: rounded box + darker door. 24–80.

## QA
```ts
real: { length: 0.6, width: 0.6, height: 0.9, measures: [
  { label: 'appliance width (600 module)', axis: 'y', value: 0.597, parts: ['body'], source: 'EN 1116' },
  { label: 'worktop height', axis: 'z', value: 0.9, parts: ['body'] },
]},
checks: [clear('door_*', 'body', 0.003), touches('handle_*', 'door_*'), touches('knob_*', 'body')],
gaps: [{ parts: ['door_*', 'body'], why: 'door seal reveal' }],
```

## Common mistakes
- Appliances not on the module (a 0.7 m wide built-in oven, a fridge 1.5 m deep).
- Doors without gaps or handles; knobs as flat discs.
- Mirror-chrome everywhere — stainless steel is brushed `aluminium`, not `chrome`.
- Copied maker logos or control layouts.

## Reuse
`hinge`, `door_handle` (bar handles via `pipe` with fillets), `valve_wheel` (knob stand-in at
small scale), `lamp` (fridge light, hood lights with glow), `pipe` (tap spouts), `box({ bevel })`
bodies. Furniture context: [furniture](furniture.md).

## Sources
- EN 1116 coordinating sizes summary: https://catas.com/uploads/media/unien1116-eng.pdf
- Kitchen cabinet standards (US): https://en.wikipedia.org/wiki/Kitchen_cabinet
- Major appliance overview: https://en.wikipedia.org/wiki/Major_appliance
