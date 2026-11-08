# Crates, barrels and pallets playbook

Wooden pallets (EUR/EPAL, US GMA, ISO sizes), wooden crates and boxes, cardboard boxes, wooden
casks and barrels, steel drums, plastic IBCs, sacks. The most-placed props in any game: the scale
anchor for warehouses, docks and forklifts. **Scale from the pallet**: EUR pallet 1200 × 800 ×
144 mm; US GMA 48 × 40 in (1219 × 1016 mm); steel drum 55 US gal / 200–216 l.

## Research
Pallet specs (EPAL / UIC 435-2 / EN 13698-1 for EUR; ISO 6780 lists the six international pallet
footprints; GMA for US), drum standards (UN-rated 200 l / 216.5 l tight-head and open-head),
cooperage references (barrel volumes, stave counts, hoop positions), IBC data sheets. Photos:
pallet top, bottom and side (block layout, branding stamps), drum top (bungs, rolling hoops),
barrel ends (head, croze, chime), crate corners (battens, nails).

| Item | Dimensions | Source / note |
|---|---|---|
| EUR / EPAL pallet | 1200 × 800 × 144 mm, 20–25 kg, 1,500 kg SWL | EPAL; ISO 6780 size "1200 × 800" |
| EUR construction | 5 top boards (3 × 145 wide + 2 × 100), 3 stringer boards, 3 bottom boards, 9 blocks; boards 22 mm | 78 nails in a prescribed pattern |
| EUR blocks | 145 × 100 × 78 mm (centre/corner 145 wide) | verify against EPAL drawing |
| US GMA pallet | 48 × 40 in × ~5.5 in (1219 × 1016 × 140), stringer type, 4-way partial | |
| ISO 6780 footprints | 1200×800, 1200×1000, 1219×1016, 1140×1140, 1100×1100, 1067×1067 | |
| steel drum 200 l | Ø 0.571–0.585 × 0.88 m, 2 rolling hoops, 2 bungs (2 in + ¾ in) | UN 1A1 / 1A2 |
| wine barrel (barrique) | 225 l: 0.95 m long, bilge Ø 0.7, head Ø 0.56 | Bordeaux barrique |
| whisky barrel (ASB) | 200 l: 0.88 m long, bilge Ø 0.64, head Ø 0.53 | |
| beer cask (firkin) | 40.9 l: 0.5 m tall, bilge Ø 0.4 | |
| staves | 20–32 per barrel, 22–27 mm thick; 6 hoops (barrique) | |
| IBC tote | 1200 × 1000 × 1160 mm, 1,000 l, cage + HDPE bottle on a pallet | |
| wooden crate | boards 15–22 mm, battens 22 × 70 | |
| cardboard box | double-wall 6–7 mm, flaps meeting at the centre | FEFCO 0201 style |

## Part tree
```
pallet: top_board_<i>, stringer_<i>, block_<i>, bottom_board_<i> (merge into `pallet` per LOD)
        socket attach (fork entry centres: two, at the 4-way openings)
crate: side_*, batten_*, lid (sway Y at hinge or slide off), nails (LOD0) · socket interact (lid)
barrel: stave_<i> (lofted bulge), head_top/_bottom, hoop_<i>, bung · drum: shell, chime_*, hoop_*, bung_*, lid (open-head)
ibc: pallet, cage (lattice of tubes), bottle (translucent), valve (sway X), cap
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| crate lid | sway `oneWay` | Y at hinge | 110° |
| barrel rolling (presentation) | spin | barrel axis | |
| IBC valve lever | sway | X | 90° |
| box flaps | sway `oneWay` | flap hinge | 90–270° |

## Signature details
1. Pallet: gaps between top boards, chamfered fork-entry edges, blocks visible from the side,
   stamps branded on blocks (generic marks: heat treatment "HT", invented IDs — no EPAL logo copies).
2. Nail heads in rows; board ends split and checked; boards cupped slightly.
3. Barrels: bilge bulge (≈ 20 % wider in the middle), staves of varying width, hoops sunk into
   the wood, croze groove and head inset 25–40 mm below the chime.
4. Drums: rolling hoops (two pressed ribs), chime rims top and bottom, bungs at the top edge,
   dented and chipped paint, hazard labels (generic diamonds, no real product names).
5. Crates: battens on the outside corners, stencilled lettering (`text`), rope handles.
6. Stacking: loads on pallets with stretch wrap (`translucent`), straps, corner boards.

## Materials
`pine` / `wood_weathered` (pallets, crates), `oak` (casks; charred interior), `iron_rust` / `steel_painted`
(hoops, drums), `steel_galvanised` (IBC cage), `plastic` (IBC bottle with `translucent` surface,
plastic pallets), `canvas` (sacks), `plain` tinted brown for cardboard. Grime: water staining at
the bottom, dirt on fork entries, rust bloom on drum chimes.

## LOD policy
- LOD0: every board and block with bevels, nail heads (place), stave seams, hoop rivets. Pallet
  600–1,500, barrel 1–3k, drum 600–1,200.
- LOD1: boards merged, no nails; staves as one lofted surface with seam grooves. 100–300.
- LOD2: pallet as 3 boxes (deck + 2 runners) or a box with dark slots, barrel 8-sided. 12–48.
These props appear by the hundred: instance them and keep LOD2 tiny.

## QA
```ts
real: { length: 1.2, width: 0.8, height: 0.144, measures: [
  { label: 'EUR pallet length', axis: 'x', value: 1.2, parts: ['top_board_'] },
  { label: 'EUR pallet width', axis: 'y', value: 0.8, parts: ['top_board_'] },
  { label: 'board thickness', axis: 'z', value: 0.022, parts: ['top_board_0'] },
]},
checks: [touches('top_board_*', 'stringer_*'), touches('stringer_*', 'block_*'),
         noOverlap('top_board_*')],
gaps: [{ parts: ['top_board_*'], why: 'deck board gaps (part of the EUR design)' }],
```

## Common mistakes
- Pallet as a solid slab (it is mostly air: fork entries 100 mm high, board gaps).
- Pallets out of standard size — the forklift forks then don't fit the entries.
- Barrels as cylinders (no bilge); hoops floating proud by centimetres.
- Copying the EPAL / EUR oval brand stamps exactly — use generic marks.
- Everything brand-new: real pallets are grey, cracked and repaired.

## Reuse
`rivet_row` (hoop rivets), `hex_bolt` (crate bolts), `text` (stencils),
`loft` (barrel staves with a bulge profile), `lathe` (drums), `lattice` / `pipe` (IBC cage).
Forklift interplay: [forklift](../vehicles/forklift.md) fork 1070–1220 mm long, 100–122 mm wide.

## Sources
- EUR pallet: https://en.wikipedia.org/wiki/EUR-pallet · overview https://quivo.co/en/euro-pallets-dimensions-explained/
- ISO 6780 pallet sizes: https://en.wikipedia.org/wiki/Pallet#ISO_pallets
- Steel drum: https://en.wikipedia.org/wiki/Drum_(container)
- Barrel sizes: https://en.wikipedia.org/wiki/Barrel
- IBC: https://en.wikipedia.org/wiki/Intermediate_bulk_container
