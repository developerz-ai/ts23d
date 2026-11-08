# 010 — AI finish is a projected texture layer on LOD0, never geometry

Status: accepted
Date: 2026-11-07

## Context
ADR 001 chose recipes over AI-generated meshes: code owns dimensions, parts, pivots, motion, LODs
and QA. Image models now produce surface detail (soot, rust, wear) code struggles to write by hand.
We want that detail without giving up anything code guarantees, and without making builds depend on
a model or a GPU.

## Decision
An optional `/finish` module (tier 4) renders deterministic control maps (depth, normals, part ids,
atlas UVs, albedo) per view, sends them to a `FinishModel` (procedural mock, or the user's HTTP
server), and projects the returned images onto a per-asset atlas with part masking. The result is
ONE extra material, `ts23d_finish`, on LOD0's opaque unpainted parts; LOD1/2 keep the trim sheet.
Model outputs are cached by content hash and replay offline; the gate never runs a model. Finish QA
rejects palette drift and part-mask leaks (`T3D_FINISH_*`).

## Alternatives considered
- **Let the model generate or edit geometry (image/text-to-3D)** — why not: loses names, pivots,
  motion, LOD gating and measured dimensions; contradicts 001.
- **Replace the trim sheet on every LOD** — why not: per-asset textures at every LOD break the
  shared-sheet batching of 003/008 for distant copies; the detail only reads up close.
- **Run the model in `t3d build`** — why not: builds become non-deterministic and need a GPU.
- **Paint the trim sheet strips from the model** — why not: strips are shared by every asset; one
  asset's rust would appear on all of them.

## Consequences
- Easier: hero-quality surfaces on code-built assets; any ControlNet-capable local model plugs in.
- Harder: one more material and an atlas (≈ 1–4 MB) per finished asset; LOD0 vertices split at
  atlas chart seams (same triangles and positions, more vertices); lighting baked into a real
  model's images must be avoided in the prompt.
