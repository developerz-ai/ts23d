# 003 — Every asset shares one trim-sheet material

Status: superseded by 008
Date: 2026-10-25
Supersedes: —

## Context
Per-asset textures meant a material and a draw call per asset, texel density that varied by asset size, and a new texture for every recolour. Game scenes with hundreds of props pay for that in draw calls and memory.

## Decision
One 1024² trim sheet (albedo + normal + ORM) holds tiling strips and fixed decal cells. Every primitive maps UVs into it by world size (metres per rect). Hue comes from linear vertex colour multiplied over the greyscale sheet. Every GLB carries exactly one material, `ts23d_trim`. As of 2026-10 the material has no texture bound; the painter is M2.

## Alternatives considered
- **Per-asset unwrapped textures** — why not: a draw call per asset, uneven texel density, needs a painter per asset.
- **Flat colour only, no textures** — why not: caps visual quality; no brick, grain or rivet detail.
- **Texture arrays / bindless per asset** — why not: engine-specific, defeats "drop the GLB into any engine".

## Consequences
- Easier: a whole scene batches into one material; palette swaps are recipe edits; equal texel density everywhere.
- Harder: unique details (a specific logo, a painted mural) must fit a cell; a hero asset can't have its own unwrap.
- Revisit when: a target engine needs per-asset PBR for hero assets. Then add a second, opt-in path; keep the trim sheet the default.
