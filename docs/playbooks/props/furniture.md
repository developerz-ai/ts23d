# Furniture playbook

Chairs, tables, sofas, beds, shelving, cabinets, wardrobes, desks — domestic, office and period.
Original designs in the class; famous designer pieces are protected designs, so learn their
proportions, not their silhouettes. **Scale from seat and table height**: the body sets them
(seat 0.42–0.48 m, dining table 0.72–0.76 m) and every viewer feels a wrong one instantly.

## Research
Ergonomic standards (EN 1335 office chairs, EN 1729 educational furniture with size marks, EN 527
office desks, ISO 7250 body dimensions), maker product sheets for overall sizes, joinery references
for construction (mortise and tenon, dowel, knock-down fittings). Photos: front, side, 3/4, under
side (frame and joints), detail of legs and handles.

| Item | Key dimensions (typical) | Source / note |
|---|---|---|
| dining chair | seat 0.43–0.47 m high, 0.40–0.45 deep, 0.42–0.48 wide; back top 0.85–1.0 | |
| office chair | seat 0.40–0.51 adjustable; back 0.45–0.6 above seat | EN 1335 range (verify) |
| school chair (size mark 6) | seat 0.46 m, table 0.76 m (marks 1–6: 0.26–0.46 / 0.46–0.76) | EN 1729-1 |
| dining table | 0.72–0.76 m high; 0.6 m width per diner; 0.8–1.0 deep | |
| desk | 0.72–0.75 m (adjustable 0.62–1.25), 0.7–0.8 deep, 1.2–1.8 wide | EN 527 |
| coffee table | 0.4–0.45 high | |
| sofa | seat 0.40–0.45 high, 0.5–0.6 deep, back 0.75–0.9, arms 0.55–0.65; 2-seat 1.5–1.8 m long | |
| bed (mattress) | single 0.9 × 1.9–2.0, double 1.35–1.4 × 1.9–2.0, king 1.5–1.8 × 2.0; top 0.45–0.6 m | |
| bookshelf | shelf pitch 0.25–0.35 m, depth 0.25–0.3, board 18–25 mm, span ≤ 0.8 m (sag) | |
| wardrobe | 0.55–0.6 deep, 1.8–2.2 high, rail at 1.7–1.8 m | |
| cabinet door / drawer | handle 0.9–1.1 m for wall-height, drawer fronts 0.12–0.25 m | |

## Part tree
```
chair: seat, leg_fl/_fr/_rl/_rr, stretcher_*, back_post_l/_r, back_slat_* · socket seat
table: top, apron_*, leg_* · extension leaf (slide ±Y, `oneWay`)
sofa: frame, seat_cushion_<i>, back_cushion_<i>, arm_l/_r, foot_* · sockets seat ×N
bed: frame, headboard, footboard, slats, mattress, pillow_*, duvet (sculpt)
cabinet: carcass, shelf_<i>, door_l/_r (sway Z at hinge side), drawer_<i> (slide +X), handle_*
office chair: base (5-star), castor_<i> (sway Z + spin Y), gas_lift (slide Z), seat (sway Z swivel), back
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| cabinet door | sway `oneWay` | Z at hinge edge | 95–110° (170° with special hinges) |
| drawer | slide `oneWay` | +X (front) | 0.75–1.0 × drawer depth |
| office chair seat | sway | Z | 360° swivel; bake ±30° |
| gas lift | slide | Z | 0.1 m |
| castor | sway Z + spin Y | | |
| recliner back | sway `oneWay` | Y | 30° |
| fold-down table leaf | sway `oneWay` | Y at hinge | 90° |

## Signature details
1. Joints you can see: tenons through legs, dowels, corner blocks under aprons, screws in knock-down pieces.
2. Leg taper, chamfered edges (2–5 mm bevel) — nothing is a sharp-edged box.
3. Panel construction: doors as frame + panel, carcass back panel inset.
4. Upholstery: cushions with seams and piping, compression where you sit (sculpt or loft).
5. Wood grain direction along the length of every member.
6. Hardware: hinges, handles, shelf pins, castors, glides under feet.
7. Use: a cushion askew, a book left open, wear on armrest tops and table edges.

## Materials
`oak` / `pine` / `wood_painted` timber (grain along members), `leather` / `canvas` upholstery
(fabric colour via vertex colour on `canvas`), `chrome` / `aluminium` / `steel_painted` metal
frames, `plastic` shells and castors, `brass` period hardware, `glass` table tops and cabinet
doors. Grime: subtle — darker at hand-contact edges, lighter wear on chair seat fronts.

## LOD policy
- LOD0: bevels on every edge (`box({ bevel })` + `weightedNormals`), joints, hardware, cushion
  seams. Chair 1–4k, sofa 4–12k, cabinet 2–6k.
- LOD1: no hardware, cushions as lofts with fewer sections. 300–1,000.
- LOD2: boxes. Chair 30–80, table 30–60, sofa 50–150.

## QA
```ts
real: { length: 0.5, width: 0.46, height: 0.9, measures: [
  { label: 'seat height', axis: 'z', value: 0.45, parts: ['leg_fl'], source: 'leg + seat top' },
  { label: 'seat depth', axis: 'x', value: 0.42, parts: ['seat'] },
]},
checks: [touches('seat', 'leg_*'), touches('leg_*', 'stretcher_*'), symmetric('_l', '_r', 'y'),
         clear('drawer_*', 'carcass', 0.002)],
gaps: [{ parts: ['door_*', 'carcass'], why: '2 mm door reveal' }],
```
The legs-up-to-seat measure is a common pattern: a parts-extent of the leg equals seat height when
the leg runs from the floor to the seat underside; state that convention.

## Common mistakes
- Dollhouse scale: seat at 0.6 m, table at 0.9 m, doors 0.3 m wide.
- Boxes with no bevels or joints; shelves spanning 1.5 m with no sag or support.
- Upholstery as a hard box; pillows and duvets with no softness.
- Copying a famous designer chair silhouette.

## Reuse
`hinge`, `door_handle`, `hex_bolt` (knock-down), `panel_door` (wardrobe doors scaled), `sculpt`
(cushions, duvets), `lathe` (turned legs), `extrudeSvg` (fretwork, chair backs from a drawing).
Planned: `drawer`, `castor`, `shelf_pin`.

## Sources
- EN 1729-1 size marks (seat/table heights): https://officeboffins.co.uk/info/information/table-chair-height-guide
- Human factors: ISO 7250-1 (body measurements); https://en.wikipedia.org/wiki/Anthropometry
- Bed sizes: https://en.wikipedia.org/wiki/Bed_size
- Joinery: https://en.wikipedia.org/wiki/Woodworking_joints
