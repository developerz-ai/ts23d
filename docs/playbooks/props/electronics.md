# Office and electronics playbook

Desktop PCs, monitors, laptops, keyboards, mice, phones, tablets, printers, desk lamps, TVs,
retro electronics (CRTs, radios, cassette decks — good historic subjects). Original designs and
invented brand marks only; no maker logos or recognisable product silhouettes. **Scale from the
standard interfaces**: key pitch 19.05 mm, screen diagonal and aspect ratio, ATX motherboard
305 × 244 mm, phone ≈ the hand.

## Research
Form-factor standards (ATX / micro-ATX case sizes, VESA mount 75 / 100 mm patterns, keyboard
ISO/IEC 9995 layout, display aspect ratios), product dimension tables. Photos: front, side, back
(ports), top, close-ups of keys, ports, vents, stands.

| Item | Typical size | Source / note |
|---|---|---|
| key pitch | 19.05 mm (0.75 in) centre to centre; keycap top ≈ 12–13 mm | ISO/IEC 9995 practice |
| full keyboard | 0.44–0.46 × 0.13–0.15 × 0.03–0.04 m (104/105 keys) | |
| tenkeyless / laptop deck | 0.36 × 0.14 / 0.28–0.32 wide keys area | |
| mouse | 0.11–0.13 × 0.06–0.07 × 0.035–0.045 | |
| 24 in 16:9 monitor | panel 0.531 × 0.299 m; overall ~0.54 × 0.32 + stand; bezel 2–10 mm | |
| 27 in 16:9 | 0.598 × 0.336 m panel | |
| VESA mount | 75 × 75 or 100 × 100 mm holes (M4) | VESA MIS-D |
| ATX mid-tower | 0.2–0.23 × 0.43–0.5 × 0.43–0.5 m | ATX spec |
| 15 in laptop | 0.35–0.36 × 0.23–0.25 × 0.015–0.02 (closed) | |
| phone | 0.145–0.165 × 0.07–0.078 × 0.0075–0.009 | |
| tablet 11 in | 0.25 × 0.18 × 0.006 | |
| CRT monitor 15 in (1990s) | 0.36 × 0.38 × 0.38 m deep | |
| 55 in TV 16:9 | 1.21 × 0.68 panel, 0.03–0.08 deep | |

Screen size arithmetic: width = d × 16/√(16²+9²) = 0.8716 d; height = 0.4903 d.

## Part tree
```
monitor: panel, bezel, screen (emissive `glow` or dark glass), stand_neck (slide Z height),
         panel_pivot (sway Y tilt −5/+20°, sway Z swivel), base, button_*
laptop: base (keys, touchpad, ports), lid (sway Y at hinge, 0–135°) → screen, bezel, webcam
keyboard: case, key_<row>_<i> (merge per row at LOD0), feet (sway Y)
pc: case, side_panel (glass), front_panel, fan_<i> (spin), port_*, button_power, led_* (glow)
phone: body, screen (glow), camera_bump, button_*
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| laptop lid | sway `oneWay` | Y at hinge | 0–135° |
| monitor tilt / height | sway Y / slide Z | | −5…+20° / 0.1–0.13 m |
| case fans | spin | fan axis | 10–25 rps |
| keyboard feet | sway `oneWay` | Y | 90° |
| optical drive tray (retro) | slide `oneWay` | +X | 0.15 m |

## Signature details
1. Keyboards: stepped (sculpted) rows, legends as small `text` or decals, gaps between caps.
2. Screen: thin bezel with a reflective dark surface when off; a seeded UI when on (glow).
3. Ports in standard shapes on the back/side (USB-A 12 × 4.5 mm, HDMI 14 × 4.5, 3.5 mm jack).
4. Vents as slots or hex mesh; rubber feet; screws on the back.
5. Cables! Power and video cables (`pipe` hose mode) make a desk read as real.
6. Laptop: hinge barrel, touchpad inset, keyboard recessed into the deck.
7. Retro: beige plastic yellowed unevenly, CRT curved glass, chunky buttons.

## Materials
`plastic` (black, white, beige; vertex colour), `aluminium` (laptop and monitor shells),
`glass` screens (glow for on-state), `rubber` feet and cables, `chrome` small trims, `copper` /
`brass` connector pins at LOD0. Grime: dust on vents, shine on worn keys (WASD, space).

## LOD policy
- LOD0: individual keys, ports, vents, cables, screws. Keyboard 3–8k, monitor 1–3k, PC 3–10k.
- LOD1: keys as rows of bumps or a texture-bearing deck, cables simplified. 200–800.
- LOD2: boxes with screen faces. 12–60.
Tiny props are usually seen at LOD1 distance: spend detail on silhouette and screen first.

## QA
```ts
real: { length: 0.2, width: 0.54, height: 0.5, measures: [
  { label: 'panel width (24 in 16:9)', axis: 'y', value: 0.531, parts: ['screen'] },
  { label: 'key pitch', axis: 'y', value: 0.01905, between: ['key_3_0', 'key_3_1'] },
]},
checks: [touches('panel', 'stand_neck'), touches('key_*', 'case'), noOverlap('key_*')],
```

## Common mistakes
- Keys 30 mm wide (toy) or keyboards with 50 identical keys and no spacebar/enter shapes.
- Screen surface the same plastic as the bezel; no reflections, no glow.
- No cables; devices floating with nothing plugged in.
- Logos copied from real brands.

## Reuse
`text` (key legends, invented brand mark), `pipe` hose (cables), `hex_bolt` small (M3/M4 scale via
metric table is M6 minimum — build screws with `lathe` instead), `lamp` (desk lamp), `extrudeSvg`
(logo emblems of invented brands). Furniture: [furniture](furniture.md).

## Sources
- Key pitch and layouts: https://en.wikipedia.org/wiki/Keyboard_layout · ISO/IEC 9995
- VESA mounting interface: https://en.wikipedia.org/wiki/Flat_Display_Mounting_Interface
- ATX form factor: https://en.wikipedia.org/wiki/ATX
- USB connector sizes: https://en.wikipedia.org/wiki/USB_hardware
