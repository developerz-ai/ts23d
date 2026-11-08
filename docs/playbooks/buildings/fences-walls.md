# Fences and walls playbook

Timber fences (close-board, picket, post-and-rail, panel), metal fences (railings, palisade, mesh,
chain-link), masonry walls (brick, stone, dry-stone, retaining) and hedges as boundaries. Built as
**modular runs**: one bay authored once, placed along a path, with posts at the joints. **Scale
from post spacing and height**: posts are 1.8–3.0 m apart and fences 0.9–2.0 m tall.

## Research
Product/standard sheets (BS 1722 fence series in the UK, chain-link ASTM F567/F668 in the US,
mesh panel catalogues), regional dry-stone guides (batter, through-stones, copes), brick sizes
(see [house](house.md)). Photos: elevation of one bay, post top detail, base / ground contact,
gate and its hardware, corner and end posts.

| Type | Height | Post spacing / module | Members |
|---|---|---|---|
| close-board | 1.2–1.8 m | 2.4–3.0 m | posts 100 × 100, rails (arris) 2–3, boards 100–150 × 20 mm overlapping 20 mm, gravel board 150 mm |
| picket | 0.9–1.2 | 1.8–2.4 | pickets 70–90 × 20, gaps 50–75 mm, pointed tops |
| post-and-rail | 1.1–1.3 | 2.5–3.0 | 2–4 rails 87 × 38 or half-rounds |
| fence panel (lap) | 0.9–1.8 | 1.83 m panels | slotted concrete or timber posts |
| railing (metal) | 0.9–1.8 | 1.8–2.5 | bars Ø 12–20 mm at ≤ 100 mm gaps, spear or ball finials |
| palisade | 1.8–3.0 | 2.75 | W or D pales, triple-point tops |
| welded mesh / 2D panel | 1.0–2.4 | 2.5 m panels | 200 × 50 mm mesh, Ø 5–6 mm wire |
| chain-link | 0.9–2.4 | 3.0 m | 50 mm diamond, top rail Ø 42 mm, tension wire |
| brick garden wall | 0.9–1.8 | piers every 2–3 m | half-brick or one-brick, coping |
| dry-stone wall | 1.2–1.5 | — | base 0.6–0.9 wide, top 0.3–0.4, batter 1:6, copes, throughs every ~1 m |

## Part tree
```
fence (group, one asset per style; length a family param)
├── post_<i> (static) · cap_<i> / finial_<i>
├── bay_<i> (rails + boards / bars / mesh, merged per bay)
├── gravel_board_<i> / plinth_<i>
├── gate (pivot at the hinge post; sway Z, `oneWay` 90°) → latch, hinge_*
└── wall: mass_<i> (masonry courses), coping_<i>, pier_<i>, through_stone_*
```
Follow terrain: posts plumb, rails stepped or raked with the slope; sample the ground with the
same `heightfield` function the scene uses.

## Motion
Gates only: sway Z at the hinge, `oneWay` 90–110°; field gates swing both ways (no `oneWay`).
Hedges: crown sway ±1–2° (wind).

## Signature details
1. Posts go into the ground (concrete collar, spike, or buried 0.6 m) — show the collar or soil mound.
2. Close-board: overlapping feather-edge boards, arris rails on the back side, capping strip.
3. Railings: bars through top and bottom rails, finials, dog bars at the bottom on period railings.
4. Masonry walls: coping (brick on edge, stone, or concrete), piers at intervals and ends.
5. Dry-stone: two faces, hearting, through-stones, cope stones on top, irregular but coursed.
6. Gates with real hinges and latches on the correct side; gate posts heavier than line posts.
7. Uneven: timber varies in tone, a board or two slightly crooked (`ctx.rng`), moss at the base.

## Materials
`wood_weathered` / `pine` / `wood_painted` timber, `steel_painted` (black railings),
`steel_galvanised` (mesh, chain-link, palisade), `iron_cast` finials, `brick` / `stone` via `mass`,
`concrete` posts and copings, `rock_strata` / `cliff` / `stone` for dry-stone, `moss` at the base.
Chain-link and mesh: `cutout` surface on a card at LOD1/2.

## LOD policy
- LOD0: every board and bar, nails/bolts, finials, individual stones (`sculpt`/`sdf` rocks placed
  in courses for dry-stone). 500–3,000 per bay.
- LOD1: boards merged into panels with grooves; mesh and chain-link as `cutout` cards; stones as a
  bumpy wall mass. 50–300 per bay.
- LOD2: one quad strip (or `cutout` card) per bay, posts dropped below a size. 4–20 per bay.

## QA
```ts
real: { length: 0.1, width: 12, height: 1.8, measures: [
  { label: 'post spacing', axis: 'y', value: 2.4, between: ['post_0', 'post_1'] },
  { label: 'fence height', axis: 'z', value: 1.8, parts: ['bay_0'] },
]},
checks: [touches('bay_*', 'post_*'), touches('post_*', 'ground'), noOverlap('post_*')],
gaps: [{ parts: ['bay_*'], why: 'picket gaps are the design' }],
```

## Common mistakes
- Posts floating on the ground or sunk without a collar; fence not following terrain.
- Mesh and chain-link modelled as solid geometry at every LOD (huge triangle counts).
- Railings bars too thick (> 25 mm) or gaps too wide (> 100 mm on a guard).
- Brick wall with no coping; dry-stone wall as a box with a rock texture.

## Reuse
`railing` part (guard railings), `hinge`, `door_handle` (gate latch stand-in), `steel_beam`
(angle posts), `mass` (masonry runs), `pipe` (chain-link frame tubes), `sculpt` / boulder
techniques from [rocks](../nature/rocks.md). Hedges: [plants](../nature/plants.md).

## Sources
- BS 1722 fence series (BSI): https://knowledge.bsigroup.com/
- Dry-stone walling: https://en.wikipedia.org/wiki/Dry_stone · https://www.dswa.org.uk/
- Chain-link fencing: https://en.wikipedia.org/wiki/Chain-link_fencing
