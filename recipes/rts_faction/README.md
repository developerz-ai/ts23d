# Saltmarch Accord — sample RTS faction (original)

## Identity
An **original** strategy-game faction written as code, to show ts23d's RTS kit end to end: salt-flat
engineers who mine amber *sunstone*. Not based on any existing game's faction, unit names or
designs. `rts_faction` is the lineup scene; each asset has its own folder:

| Asset | Folder | What |
|---|---|---|
| `rts_worker` | [`rts_worker/`](../rts_worker/README.md) | Delver: worker with tool pack and sunstone pick |
| `rts_soldier` | [`rts_soldier/`](../rts_soldier/README.md) | Warden: line infantry with the sunlance carbine |
| `rts_tank` | [`rts_tank/`](../rts_tank/README.md) | Brinehound: light tank |
| `rts_barracks*` | [`rts_barracks/`](../rts_barracks/README.md) | Warden Hall: 3 build stages × 3 damage states |
| `rts_resource*` | [`rts_resource/`](../rts_resource/README.md) | Sunstone deposit + harvested variant |
| `rts_faction` | here | All of the above in one compound (`rts_faction.ts` places the roster, `ground.ts` builds the forecourt, perimeter and stores), one team slot |

Shared code: [`style.ts`](../_lib/rts/style.ts) (palette, team slot, shape helpers), [`finish.ts`](../_lib/rts/finish.ts)
(materials per role colour, wear presets, the `Kit` that weathers parts together), [`figure.ts`](../_lib/rts/figure.ts)
(the one body both infantry units use). Test: [`rts_faction.test.ts`](rts_faction.test.ts).

## Style guide (the art bible, enforced where it can be)

| Rule | Value | Enforced by |
|---|---|---|
| Team colour | one `team` paint slot; variants `red blue green yellow purple orange teal white` (KHR_materials_variants) | test: every asset has exactly these 8 |
| Team placement | large **top-facing** planes: roofs, pauldrons, crest, pack lid, turret roof, deck, banners, floor inlay, claim plaque | test: ≥ 8 % of the 64-px LOD2 silhouette from a 58° camera changes between red and blue (`teamCoverage`); `t3d icon` warns below it. Ruins (the three `*_rubble` halls: paint under ash and rubble, 1–3 % near) are held to their near read instead: the far share within 4 points of LOD0's and never below it, so the owner's chevron stays and nothing pops to red at the switch |
| Neutral masses | bone ceramic `#cfc4a8` / slate `#4a5058` / gunmetal `#2c3034`: low saturation so team colour owns the chroma | review |
| Accent | brass `#a87a2c` on edges and fittings; amber sunstone glow `#ffb13a` for lenses, windows, crystals (the focal accent) | `glow` sets |
| Materials | every role colour on a real strip (`finish.ts` `restrip`): ceramic `plastic` armour, `canvas` suits and banners, `leather` boots/gloves, matte `armour_paint` on the tank's bone and slate plates (`../_lib/finish/field.ts`), `steel_painted` team plates (chips show steel), `iron_cast` fittings, `brass`, `rubber`, `oak`/`pine` timber, dressed `concrete`/`stone` masonry, lime-plaster gables | review (`t3d critique`) |
| Wear | `weather()` presets in `finish.ts` (`wearOf`): convex-edge chips 10–14 %, dust on up-faces, mud from the ground on units and vehicles, moss and damp at the hall foot, rain streaks off the eaves and sills, exhaust soot; team parts wear in one shared vocabulary (`teamWearOf`: hero-sized chips to dark bare steel, their borders cut inside the triangles so they come out ragged, salt dust on top; `read: 'close'` for a small part like a hat; the slot is `TEAM_PAINT_WORN`, so the wear keeps its colour in every livery), never at LOD2, so the far team share holds | QA `weather` (exact %, physically placed) |
| Shape language | **pebbles** (bevelled, rounded masses) + **forward chevrons** (helmet crest, turret nose, prow, porch, roof marks) + **round lenses** | `chevron`, `chevronPlan`, `pebble` in `style.ts` |
| Proportions | infantry ≈ 6 heads, chunky limbs, big hands and pauldrons (read at 64 px) | `figure.ts` |
| LOD | LOD2 is brutal (crowds): infantry ≤ 380 tris, tank ≤ 600, hall ≤ 1 200; pivots kept at every LOD | `budget`, QA |
| Readability | LOD2 keeps the LOD0 silhouette (IoU ≥ 0.85 front/side/¾); `assertArt` passes on the units | test |

## The compound (`rts_faction`)
A 30 × 25 m plate: the hall on the −X half, its forecourt on +X.

| Element | What | Where |
|---|---|---|
| salt flat | pale pitted crust at true texture scale (0.5 m bands of the greyscale `concrete` strip under the salt colour, each band phased along U), mottled and trodden darker in vertex colour, five standing patches (gate, stores, Delvers' pitch, sandbag post) as their own skins | `ground.ts` `forecourt` |
| road and hardstand | `gravel` at true scale, 3 mm proud: gate → gap in the wall; 7.8 × 4.6 m tank park with an oil stain | `forecourt` |
| track ruts | two 0.46 m ribbons at 2.45 m centres from the hardstand round to the road (LOD0/1) | `forecourt` |
| perimeter | low wall of dressed blocks with capstones on two edges, open where the road leaves; a sandbag post each side of the gap | `perimeter` |
| stores | five fuel drums and four crates by the park (parts kit `barrel`, `crate`, one LOD below their own) | `stores` |
| roster | hall; Brinehound on the hardstand, nose to the gate; three Wardens in a wedge on the road; two Delvers at the claimed deposit | `rts_faction.ts` |

Triangles 159k / 35k / 4.4k, of which the scene's own ground and dressing are 9.3k / 2.2k / 0.5k;
draws 36 / 36 / 22, all from the roster's moving pivots and team parts (the ground, perimeter and
stores add none: they are static and on the trim sheet).

## Specs (design envelope — an invented faction: this brief is the source)

| Dimension | Value (m) | Why |
|---|---|---|
| infantry height | 1.83–1.95 | human, slightly heroic; helmets and antenna on top |
| infantry shoulders | 0.75–0.82 | pauldrons wide enough to read from above |
| tank | 6.1 × 3.05 × 3.2 (with antenna) | light-tank class (AFV playbook ranges), road wheel Ø 0.60 |
| barracks gate | 3.5 high | ×1.8 a Warden: units path in and out cleanly |
| barracks | 15.8 × 18.5 × 11.05 | hall 10 × 14 m, two rear drum towers, porch |
| resource node | 4.9 × 4.4 × 3.6 | one worker-crew's mining site |

## Photos (by view)
Original design: no photo references. Proportion and scale references only:
[AFV playbook](../../docs/playbooks/vehicles/afv.md) (light-tank dimensions),
[house playbook](../../docs/playbooks/buildings/house.md) (door / storey scale),
[rocks playbook](../../docs/playbooks/nature/rocks.md) (fracture planes, weathering).

## Parts the engine needs
Team: every part with `paint: 'team'`. Units: `hand_r_socket` (weapon/tool mount), `grip_r` joint,
`muzzle` / `work_dust` emitters. Tank: `turret` (spin Z), `gun` (sway), `wheel_*`, `idler_*`,
`sprocket_*` (spin Y), `muzzle`, `exhaust_*`, `dust_*`, `commander` seat. Hall: `rally` spawn,
`door` interact, smoke/fire emitters on damaged states. Deposit: `mine_point_*` interact sockets.

## Open questions
- `ctx.use` now keeps (prefixes) `clearOf`, so the tank's road-wheel hubs declare `clearOf: ['hull']`
  (stub axles in their bearings) and the lineup scene inherits it.
- Impostor LOD3 for thousands of units is planned (roadmap), not built here.
