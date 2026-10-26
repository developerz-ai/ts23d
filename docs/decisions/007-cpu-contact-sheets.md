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
