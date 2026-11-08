# Shop front playbook

Ground-floor retail frontages: traditional (Victorian / Georgian timber shop fronts with
pilasters and fascia), modern glazed fronts, kiosks, market stalls. Signage is invented — never a
real brand name or logo. **Scale from the door and the stall riser**: a shop door is 0.9–1.0 m
wide (accessible ≥ 0.8 m clear), the fascia sign sits 2.6–3.2 m above the pavement.

## Research
Local conservation guides (they publish annotated drawings of the traditional shop front: plinth,
stallriser, pilasters, console brackets, fascia, cornice), accessibility rules (door clear
width, level threshold), signage rules (projecting sign clearance over the footway, awning
clearance). Photos: elevation square-on, 3/4 along the street, door detail, signage, night shot.

| Dimension | Typical | Notes |
|---|---|---|
| ground floor height | 3.5–4.5 m | |
| stallriser (base under the window) | 0.3–0.7 m | |
| display window | 2.0–2.6 m tall | mullions 0.05–0.1 m |
| fascia (sign board) | 0.4–0.9 m tall, top 3.0–3.8 m | |
| pilasters | 0.3–0.5 m wide, project 0.05–0.15 | |
| door | 0.9–1.0 × 2.1–2.4 m, clear opening ≥ 0.8 m | UK Approved Document M / ADA 404 (32 in min) |
| projecting sign clearance | ≥ 2.1–2.6 m above footway | local highway rules |
| awning / blind clearance | ≥ 2.1–2.4 m, set back ≥ 0.6 m from kerb | |
| roller shutter box | 0.25–0.35 m deep under the fascia | |

## Part tree
```
frontage (static: plinth, stallriser, pilaster_l/_r, cornice)
├── fascia (sign board) → sign_text (text / extrudeSvg; glow for illuminated)
├── window_display_<i> (frame + glass, glass surface) · mullion_*
├── door_shop (leaf sways Z about hinge, glass panel) · threshold · bell/handle
├── awning (sway Y at the top bar: retracted ↔ extended) · shutter (slide `oneWay` −Z)
├── projecting_sign (sway X small, wind) · lamp_* (glow)
└── interior: shelves, counter, products as cards (ctx.use furniture), sockets: interact (door)
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| door leaf | sway `oneWay` | Z at hinge | 90° |
| awning | sway `oneWay` | Y at wall bar | 0–70° (extend) |
| roller shutter | slide `oneWay` | −Z | window height |
| hanging sign | sway | X at hanger | ±5°, wind |
| automatic sliding doors | slide `oneWay` | ±Y per leaf | leaf width |

## Signature details
1. Traditional order: plinth → stallriser → window → fascia → cornice, framed by pilasters with
   console brackets.
2. Real glass with an interior behind (shelves, goods, lights) — a shop is read through its window.
3. Sign lettering raised or painted on the fascia, invented name, period-appropriate font.
4. Recessed entrance (lobby) on traditional fronts, with tiled floor.
5. Awning with scalloped valance or roller shutter box; projecting hanging sign.
6. Step / threshold, door handle and letterbox at hand height (0.9–1.1 m).
7. Window decals: opening hours, prices — generic, invented.

## Materials
`wood_painted` (traditional joinery, deep colours), `aluminium` (modern frames), `glass`,
`stone` / `brick` piers above, `canvas` awnings (striped via vertex colour), `steel_galvanised`
shutters, `plastic` / `aluminium` modern sign trays, `brass` door furniture. Grime: dirt along the
stallriser and threshold, worn paint at the door edge.

## LOD policy
- LOD0: mouldings (sweep a profile along the cornice), console brackets, glazing bars, interior
  dressing, lettering as geometry. 5–20k per frontage.
- LOD1: frames and glass, fascia text kept (it is the identity), interior as a back card. 1–3k.
- LOD2: frontage panel with a dark window and a coloured fascia. 50–150.

## QA
```ts
real: { length: 0.6, width: 6.0, height: 4.2, measures: [
  { label: 'door clear width', axis: 'y', value: 0.9, parts: ['door_shop_leaf'] },
  { label: 'fascia height', axis: 'z', value: 0.6, parts: ['fascia'] },
]},
checks: [touches('fascia', 'frontage'), touches('awning', 'frontage')],
```

## Common mistakes
- Real brand names or logos on signs — always invent.
- Opaque windows; no interior.
- Fascia at 5 m or door at 3 m — the human scale breaks.
- Modern frameless glazing on a Victorian front (period mismatch).

## Reuse
`text` (fascia lettering: `font: 'serif'`, `'script'` or `'gothic'` for period sign-writing, raised with `depth`; `'5x7'` / `'block'` for stencils) or `extrudeSvg` (custom letterforms), `opening`, `sweep`
(cornice mouldings), parts `panel_door`, `door_handle`, `hinge`, `lamp`; furniture and props from
[furniture](../props/furniture.md). Compose into a building with `ctx.use`.

## Sources
- UK Approved Document M (access): https://www.gov.uk/government/publications/access-to-and-use-of-buildings-approved-document-m
- ADA Standards 404 doors: https://www.access-board.gov/ada/#ada-404
- Traditional shop front anatomy: https://en.wikipedia.org/wiki/Storefront
