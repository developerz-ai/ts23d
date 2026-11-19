# 007 — Agent feedback is a CPU-rendered contact sheet

Status: accepted
Date: 2026-10-25
Supersedes: —

## Context
The agent loop needs to see the asset. Options are many images (one per view) or one. Each image read costs context and a turn. Proportion errors show only from some angles (height in elevation, footprint in plan). The loop must also run in CI and on headless VPSes with no GPU and no display.

## Decision
`t3d shot` renders **one** PNG: six labelled orthographic views (3/4 front, front, side, top, 3/4 rear, LOD2 far) on a shared metre grid, with a header giving bounding-box dimensions, grid step and LOD. Rendering is a z-buffered CPU rasteriser with flat Lambert shading over vertex colour: no GPU, no WebGL, no native dependency.

## Alternatives considered
- **Headless GPU (Puppeteer + three.js, or EGL)** — why not: a browser or GPU driver in CI, non-deterministic pixels across drivers, slow cold start.
- **One image per view** — why not: six reads instead of one; the agent compares across turns instead of within one image.
- **Perspective beauty renders** — why not: perspective hides proportion errors; a metre grid under an orthographic view makes them measurable.

## Consequences
- Easier: one read shows every side; runs anywhere Bun runs; deterministic pixels.
- Harder: no textures, shadows or AO in the sheet; it judges form, not surface. The gallery shows the real material.
- Revisit when: surface quality (texture painter, M2) needs judging in the loop. Then add a textured view to the sheet, still on the CPU.

## Revisited 2026-11-19: the sheet shows base colour
The trigger arrived. Materials now carry their own colour in the strip (wood, bark, leather, soil, rock: near-white vertex tint), so a sheet shaded from vertex colour alone showed them near-white, terrain flat grey and glass opaque, while `hero.png` showed the real colours. Agents judge assets from the sheet; reviewers flagged the disagreement on about 15 recipes (D297).

**Decision.** The six panels (and `thumb.png`) show the hero's base colour: trim-sheet albedo × vertex colour. Still one PNG, orthographic, CPU, flat Lambert, one colour per triangle, deterministic.

- **How.** `contactSheet(asset, { sheet })`. The sheet is reduced once to 88 colours: the alpha-weighted mean linear albedo of each of the 56 strip rows and 32 cells (`src/render/sheet-tones.ts`). A triangle takes the colour under its UV centroid.
- **Why a mean per strip, not a texel or a coarse mip.** A flat-shaded triangle has one colour. A point sample lands on a board or a joint at random and sparkles between neighbours; a mip coarse enough to hide that blends neighbouring 1/64 strip rows. The row mean is exact, noise-free, the same for every U (strips tile along U) and what the hero's texture converges to at a distance.
- **See-through parts** (`glass`, `translucent`, `ice`, `liquid`, `jelly`) are drawn after the opaque ones as one nearest layer, blended at the surface's `alpha` (the same number the GLB writes for loaders without transmission). One layer, so the result does not depend on part or triangle order. No refraction, no reflection.
- **Cost.** The CLI paints one 512² preview sheet per process (`previewSheet()`, about 0.2 s; the hero's 2048² takes about 2 s) and passes it to `shot`, `review` and `critique`, so the three write the same bytes. Rasterising costs the same as before.
- **Unchanged.** Without `sheet` the output is the vertex-colour render, pixel for pixel (library callers, `blueprint.png`). `icon.png`, `rts.png`, `portrait.png` and `hero.png` already sampled the sheet. Parts with their own texture set keep their per-pixel path (ADR 016).
- **Cutout cards** (`surface: 'cutout'` on a leaf, needle or strand cell) are alpha-tested per pixel against the same sheet: the nearest texel's alpha under 0.5 drops the pixel (`cutAt`, D300), so the panels and `thumb.png` show the foliage silhouette, in the cell's mean colour. At 512² a 32-texel leaf cell is about one texel per pixel in a 400 px panel: coarse, and enough to judge silhouette and LOD. Measured on `oak` (16 k triangles): `t3d shot` 8.96 s before, 9.09 s after. Without `sheet` there is no alpha to test and cards stay solid.
- **Still not in the sheet:** texture detail inside a strip, normal and roughness maps, shadows, AO, emission. The sheet judges form, silhouette and base colour; the hero judges surface.
