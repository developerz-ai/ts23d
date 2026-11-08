# Boat playbook (small boat, ship basics)

Rowing boats and dinghies, small motor boats (open, cuddy cabin), work boats, fishing vessels, and
ship basics (coaster, tug, cargo ship). Historic vessels with published lines plans are good named
subjects. **Scale from length overall (LOA), beam and draft** — the three numbers every listing
gives — and, on small boats, from human fittings: thwart (seat) height, cleats, oarlocks.

## Research
Builder's specs (LOA, LWL, beam, draft, displacement, freeboard, deadrise for planing hulls), a
lines plan (body plan sections, profile, half-breadths — museum ships often publish them), and
regulations for scale cues (ISO 12217 stability categories, ISO 8666 principal data definitions,
COLREGs for navigation lights). Photos: profile at waterline level, bow-on, stern, deck from above,
out-of-water hull (bottom shape, keel, rudder, propeller).

| Dimension | Rowing dinghy | Motor boat (open, 5–6 m) | Tug (harbour) | Coaster / small cargo |
|---|---|---|---|---|
| LOA | 2.4–4.5 m | 5.0–6.5 | 24–32 | 80–100 |
| beam | 1.2–1.6 | 2.0–2.5 | 9–12 | 13–16 |
| draft | 0.15–0.3 | 0.3–0.5 (drive up) | 3.5–5.5 | 4.5–6.5 |
| freeboard (amidships) | 0.35–0.5 | 0.6–0.9 | 1.5–2.5 | 1.5–3 |
| beam / length | 0.35–0.45 | 0.35–0.42 | 0.33–0.4 | 0.15–0.18 |
| deadrise (planing) | — | 14–22° | — | — |
| thwart / seat height above floor | 0.25–0.35 | 0.4–0.45 | — | — |
| bulwark / rail height | — | 0.6 (rail) | 1.0 | 1.0–1.1 (SOLAS rails ≥ 1 m) |
| propeller Ø | — | 0.33–0.36 (outboard) | 2.3–3.0 | 3–4.5 |

## Part tree
```
hull (static, closed; waterline at z = 0, keel at −draft) · hull_deck
├── bulwark_*, rail_*, cleat_*, fender_* · thwart_* (seats) · floorboards
├── rudder (sway Z at the rudder stock, ±35°) · propeller (spin X) · outboard (sway Z steering, ±35°; tilt sway Y)
├── oar_l/_r (rowing: sway Z + sway X in a nested pair) · oarlock_*
├── wheelhouse (static) → door_* (sway Z), glass_* · mast → antenna, radar (spin Z), nav lights (glow)
├── ship: crane_* (sway Z), hatch_cover_* (slide), anchor_l/_r, winch_* (spin), funnel → emitter smoke
└── sockets: seat (helm), attach (tow bitts), spawn (wake emitter at the stern)
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| propeller | spin | X | 10–30 rps (small), 1.5–2.5 rps (ship) |
| rudder / outboard steer | sway | Z at stock | ±35° |
| outboard tilt | sway `oneWay` | Y at the transom bracket | 0–70° |
| radar scanner | spin | Z | 0.4–0.8 rps |
| oars | sway | Z at the oarlock (stroke) ±35°, nested sway X (lift) | |
| whole hull (rocking, presentation only) | sway | X | ±3°, 0.2 hz |

## Signature details
1. Sheer line: the deck edge rises toward the bow (and stern); never a straight line.
2. Flare at the bow, tumblehome or flat sides amidships, transom or rounded stern as sourced.
3. Waterline with boot-top stripe; antifouling colour below (red/black/blue).
4. Strakes / chines on planing hulls; plank lap lines on clinker dinghies.
5. Rubbing strake (fender) along the sheer; cleats, fairleads, bitts.
6. Wheelhouse windows raked forward on work boats; railings everywhere people walk.
7. Ships: hatch covers, cranes, accommodation block aft, funnel, lifeboat davits, draft marks.
8. Navigation lights: red port (left, +Y), green starboard, white masthead and stern.

## Materials
`steel_painted` for steel hulls and superstructure (original livery), `plastic` white for GRP boats,
`wood_painted` / `oak` / `pine` for wooden boats (clinker planks), `steel_galvanised` / `chrome`
fittings, `rubber` fenders, `canvas` covers and dodgers, `glass` windows, `iron_rust` streaks on
working ships. Grime: rust bleed below scuppers and hawse pipes, waterline scum band, salt-faded
paint on decks.

## LOD policy
- LOD0: planks or plate seams, cleats, rails, rope coils (`sweep`), fenders, wheelhouse interior,
  draft marks (`text`). Small boat 8–25k; ship 60–150k.
- LOD1: hull + deck + superstructure blocks, rails as single tubes. 2–6k / 15–30k.
- LOD2: hull and superstructure silhouette. 300–800 / 1,500–3,000.

## QA
```ts
real: { length: 5.8, width: 2.3, height: 1.6, measures: [
  { label: 'beam', axis: 'y', value: 2.3, parts: ['hull'] },
  { label: 'draft', axis: 'z', value: 0.35, parts: ['hull_below_waterline'] },
]},
checks: [touches('cleat_*', 'hull_deck'), touches('thwart_*', 'hull'), symmetric('_l', '_r', 'y')],
```
Height in `real` is keel to the highest fixed point; keep the waterline at z = 0 and say so in the dossier.

## Common mistakes
- Bathtub hull: flat sheer, vertical sides, square bow.
- Hull not watertight (QA and physics need a closed shell; `hull` kind builder guarantees it).
- Freeboard too high for a dinghy or too low for a ship; no boot-top.
- Port and starboard light colours swapped.
- Rails missing on a ship's deck edges.

## Reuse
`hull` / `hullMesh` / `hullLines` kind builders (sheer, flare, deadrise, transom, boot-top),
`propeller`, `railing` (EN ISO 14122-3 heights for ship decks), `ladder`, `pipe`, `valve_wheel`,
`lamp` (glow), `text` (name, draft marks). Sci-fi variant reference: [`dropship`](../../../recipes/dropship/README.md).

## Sources
- ISO 8666 (principal data), ISO 12217 (stability), from ISO/TC 188 *Small craft*
- COLREGs lights: https://en.wikipedia.org/wiki/International_Regulations_for_Preventing_Collisions_at_Sea
- Lines plans and hull terms: https://en.wikipedia.org/wiki/Lines_plan · https://en.wikipedia.org/wiki/Sheer_(ship)
