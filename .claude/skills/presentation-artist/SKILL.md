---
name: presentation-artist
description: A lighting and presentation artist's workflow for ts23d — beauty renders, contact sheets, review and critique packs, thumbnails, gallery shots. Three-point lighting vocabulary (key/fill/rim, ratios), camera azimuth/elevation/field of view, framing, greyscale value check, raking light for relief, LOD strips, light sockets that become KHR_lights_punctual. Use when making, judging or fixing hero.png / sheet.png / thumbnails / gallery images, or adding lights to an asset.
---

# Lighting & presentation artist

Use with the [author-recipe loop](../author-recipe/SKILL.md) (steps 3, 6, critique),
[ADR 007 CPU contact sheets](../../../docs/decisions/007-cpu-contact-sheets.md) and
[16-art-as-text](../../../docs/idea/16-art-as-text.md). Presentation never hides a weak model: the
studio light is fixed so assets compare fairly; the camera and framing are yours.

## When
Producing or reviewing `hero.png`, `sheet.png`, `thumb.png`, a review/critique pack, a gallery
image, or adding lamps/headlights to an asset.

## Workflow
| # | Presentation stage | ts23d | Exit |
|---|---|---|---|
| 1 | Neutral look first: orthographic views on a metre grid | `bun run t3d shot recipes/x/x.ts --out renders` → READ `sheet.png` | silhouette right in six views |
| 2 | Hero camera: 3/4 front, slightly above eye level | `bun run t3d hero … --az -35 --el 18 --fov 30 --size 1600x900` (defaults) | asset fills ~60–80 % of frame width *typical* |
| 3 | Pick the view that sells the design | vary `--az` (front-left 3/4 default; rear 3/4 for engines/exhausts), `--el` low for heroic scale, high for top detail | focal part faces camera |
| 4 | Check values: squint / greyscale | read `hero.png`; critique rubric `materials` | distinct value groups; focal part has max contrast |
| 5 | Relief check under grazing light | `t3d critique` → `raking.png`, `raking_detail.png` | modelled detail casts shadow; painted detail stays flat |
| 6 | Distance check | `review/` LOD strip (`lodStrip`), `sheet.png` FAR LOD2 cell, `thumbnail` | reads at thumbnail size |
| 7 | Machine review | `t3d review` → `review.json` warnings (exposure, tiny-in-frame, LOD popping) | no warning you cannot explain |
| 8 | Lights the asset carries | `ctx.socket('headlamp_l', { kind: 'light', dir, data: { light: 'spot', color, intensity, range, cone } })` → KHR_lights_punctual; `glow` for emissive parts | lamps light the scene in engines |
| 9 | Publish | `bun run shots <name>` (refreshes committed `out/<asset>/hero.png`, `sheet.png`, `thumb.png`) | recipes gate sees current images |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Key light | the dominant light; ts23d studio key ≈ 50° camera-left, 55° up | fixed in `render/lighting.ts` |
| Fill | lifts shadows; key:fill ratio 2:1 commercial, 4:1 portrait, 8:1 dramatic | fixed studio rig; judge shadow detail |
| Rim | back light separating silhouette from background | not separately controllable (gap) |
| Raking light | light at ~80° incidence to show relief | `raking.png` in critique |
| Azimuth / elevation / FOV | camera angle from front (+X), height angle, vertical field of view | `--az`, `--el`, `--fov` |
| Framing | subject size in frame; too small = `tiny-in-frame` warning | `review.json` |
| Exposure | no clipped whites, no crushed blacks on the subject | `review.json` exposure warning |
| Value grouping | 3–5 clear value masses; focal part highest contrast | **planned** focal check; judge by eye |
| Grounding | contact shadow under the asset | beauty render ground shadow |

## Quality bar
- [ ] `sheet.png` read before `hero.png`; both current (`bun run shots`).
- [ ] Hero view shows the signature features; nothing important hidden behind a wheel or wall.
- [ ] Asset fills the frame; contact shadow grounds it; no clipped highlights.
- [ ] Raking light shows real relief on LOD0 detail.
- [ ] LOD2 reads at thumbnail size.
- [ ] Lamps on the asset are light sockets with physical units, not just glowing parts.

## Common mistakes
- Judging the asset from one flattering angle; always read all six sheet views.
- Lowering elevation to hide a bad top or a floating part.
- Treating QA PASS as "looks good": critique scores decide.
- Changing renders after the critique was written (critique becomes stale: `critique-drift`).
- Presenting the asset inside a game scene: the gallery shows assets, not games.

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d review recipes/<name>/<name>.ts --out review   # READ review/*.png, clear review.json
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [art-director](../art-director/SKILL.md): consistent presentation across a set.
- [material-artist](../material-artist/SKILL.md): when materials read wrong in the hero.
- [technical-artist](../technical-artist/SKILL.md): LOD popping warnings.
- [concept-artist](../concept-artist/SKILL.md): silhouette and value plan.
- [automotive-designer](../automotive-designer/SKILL.md): low stance camera.

## Tool status
Shipped: `t3d shot | hero | review | critique | blueprint | gaps`, `contactSheet`, `beauty`,
`thumbnail`, `lodStrip`, `reviewPack`, light sockets → KHR_lights_punctual, `glow`.
Planned: HDRI / IBL environments for the beauty render, custom light rigs (rim control),
turntable/animated presentation, zebra reflection renders, `photoMatch` side-by-side with
reference photos (stub throws `T3D_NOT_IMPLEMENTED`), greyscale focal-point check.
Neutral positioning: the free code-based option, no claims against other tools.
