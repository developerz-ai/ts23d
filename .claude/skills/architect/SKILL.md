---
name: architect
description: An architect's workflow for ts23d building assets — brief and programme, site and orientation, massing and setbacks, storey heights, structural grid, facade rhythm, openings, roofs, stairs and human-scale codes (2R+G, headroom, door heights), daylight intuition, BIM-style named parts. Use when building or reviewing any house, apartment block, shop, station, tower, bridge, wall or building recipe, or `mass`/`facade`/`setbacks`/`opening`/`roof`.
---

# Architect

Use with the [author-recipe loop](../author-recipe/SKILL.md), the
[buildings playbooks](../../../docs/playbooks/README.md) (house, apartment-block, shop-front,
station-platform, bridge, fences-walls, road-kerb, street-furniture) and
[16-art-as-text](../../../docs/idea/16-art-as-text.md). ts23d builds the **asset** (a GLB of a
building), not drawings for construction: codes here are realism checks, never compliance advice.
Real landmarks are fine as named public subjects; new buildings are original designs.

## When
Any building, tower, station, bridge, wall, shop front, interior shell or urban block.

## Workflow (RIBA stages 0–4 / NCARB AXP → ts23d)
| # | Architect stage | ts23d | Exit |
|---|---|---|---|
| 1 | Strategic definition + brief (RIBA 0–1): type, era, region, use, storeys | dossier: building type, construction system, sources (drawings, listings, photos per elevation) | variant chosen, era/region fixed |
| 2 | Programme: what spaces, how big, on which floor (ground retail, upper flats) | dossier table: floor → use → height; `ground` vs upper `grammar` in `facade` | storey heights stated |
| 3 | Site and orientation | asset frame: +X = principal facade (front), Z up; footprint `real.length × width` | footprint measured |
| 4 | Massing (RIBA 2 concept) | `mass({ size, at, color, strip })`, `setbacks` for towers, `box` blocks; `roof`/`roofMesh` (`roofInfo`, `ridgeHeight`) | `t3d blueprint`: L × W × H and the 1.8 m figure right |
| 5 | Structural grid and bays | grid constant in code; `split` grammar `pier:0.6 \| {win:1.4 \| pier:0.6}* \| pier:~` | openings align floor to floor |
| 6 | Facade: rhythm, hierarchy (base / middle / top), reveals | `facade(ctx, { floors, floorHeight, grammar, ground, sides })`, `opening` (recessed with sill, lintel, panes), `cell` | windows recessed 0.1–0.3 m, not flush |
| 7 | Envelope materials at true scale | `mass` masonry courses, `tiled` roofs/cladding; strips `brick`, `stone`, `slate`, `concrete`, `glass` | brick course ≈ 75 mm, no stretching |
| 8 | Vertical circulation and human scale | stairs/steps from the rules below (built with `box`/`prism` in a loop; a stairs part is **planned**); `_parts/panel_door`, `casement_window`, `railing` | `measures` on door height, step rise |
| 9 | Technical detail (RIBA 4, LOD0 only) | gutters, downpipes (`pipe`), cornices (`sweep`/`prism`), lettering (`text`) | `raking.png` shows relief |
| 10 | Weathering by exposure | `grime` (base splash zone, under sills), `weathered` strips | water stains below sills, darker base |
| 11 | Present | `t3d shot`, `t3d hero`, `t3d blueprint`, `t3d critique` | scores ≥ 8 |

## Vocabulary → measurable (sources in [skills-matrix](../../../docs/research/skills-matrix.md))
| Word | Meaning here | Check |
|---|---|---|
| Storey height | floor to floor: ≈ 2.7–3.2 m residential, 3.5–4.5 m retail ground *typical, verify* | `real.height` ÷ floors; `measures` |
| Blondel rule | 2 × rise + going ≈ 630 mm (550–700 mm accepted) | measure step parts in a test |
| Private stair (England, Part K) | rise ≤ 220 mm, going ≥ 220 mm, pitch ≤ 42°, headroom ≥ 2.0 m | `assertBetween` on steps |
| Door | leaf ≈ 2.0–2.1 m high, 0.8–0.9 m wide *typical, verify per country* | `measures` on `door_*` |
| Sill / worktop | window sill 0.8–1.0 m, balustrade ≥ 0.9–1.1 m *typical, verify* | `measures` |
| Bay | repeated structural/facade unit; openings align vertically | grammar; review elevations |
| Base-middle-top | tripartite facade: heavier base, regular middle, cornice/roof crown | review `sheet.png` FRONT |
| Reveal | depth of window/door recess; gives shadow | `opening({ depth })` |
| Daylight factor | interior/exterior illuminance %; ≥ 2 % kitchen, 1.5 % living, 1 % bedroom (BS 8206-2) | **no tool**; window-to-floor ratio by hand |
| Programme | list of spaces with areas and adjacencies | dossier only (**no room model**) |

## Quality bar
- [ ] Storey heights, door heights and step rises are human-scale and sourced.
- [ ] Openings sit on a bay grid and align floor to floor (unless the style says otherwise).
- [ ] Windows recessed with sill and lintel; glass on `surface: 'glass'`.
- [ ] Facade has hierarchy (base, middle, top) and rest areas of plain wall.
- [ ] Roof pitch and overhang fit the climate and era; gutters and downpipes at LOD0.
- [ ] Masonry and roof tiles at true scale; weathering follows water.
- [ ] LOD2 drops openings to colour/inset but keeps massing and roofline.

## Common mistakes
- Uniform storey heights on a building whose ground floor is retail.
- Flush windows (no reveal): reads as a texture on a box.
- Doors and steps scaled to the building, not to people.
- Window grid drifting between floors; facade grammar ignored.
- Ignoring the climate: flat roofs with no drainage in a rainy region.
- Claiming code compliance: these are realism checks for a game asset.

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d gaps recipes/<name>/<name>.ts --out renders     # doors short of headers, plates short of rails
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [environment-artist](../environment-artist/SKILL.md): streets and blocks of buildings.
- [material-artist](../material-artist/SKILL.md): masonry, roofing, glass.
- [prop-artist](../prop-artist/SKILL.md): street furniture and fittings.
- [hard-surface-artist](../hard-surface-artist/SKILL.md): bridges, steelwork, towers.
- [art-director](../art-director/SKILL.md): a consistent city.

## Tool status
Shipped: `mass`, `setbacks`, `facade`, `split`, `opening`, `roof`/`roofMesh`/`roofInfo`,
`ridgeHeight`, `roofHeightAt`, `tiled`, `cell`, `lattice` (bridges, trusses), `text`, `_parts`
(`panel_door`, `casement_window`, `railing`, `ladder`, `pipe`, `steel_beam`), `t3d blueprint`.
Planned / gaps: stairs and gutters parts, room/programme model with areas, stair-rule and headroom
checks, daylight analysis, enterable interiors and city kit ([roadmap](../../../docs/plans/roadmap.md)).
Neutral positioning: the free code-based option; not BIM software and not a code checker.
