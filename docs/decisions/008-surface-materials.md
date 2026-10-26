# 008 — One trim sheet, up to four surface materials

Status: accepted
Date: 2026-10-25
Supersedes: 003

## Context
ADR 003 put every asset on exactly one material. Real assets need glass (windows, lenses), cutouts (leaves, grilles, fences) and translucent parts (bottles, liquids). One opaque material can't shade those, and per-asset materials would bring back the draw-call and texture cost 003 removed.

## Decision
Keep ONE shared texture set (the trim sheet) and vertex-colour tint. A part picks `surface: 'opaque' | 'cutout' | 'glass' | 'translucent'`; each GLB carries at most four materials, one per surface in use, differing only in shading model. Glass and translucent use `KHR_materials_transmission`, `_volume` and `_ior`, with an alpha-blend fallback. Batching splits per pivot and surface (`<pivot>_<surface>`).

## Alternatives considered
- **Opaque only (keep 003 as is)** — why not: no windows, foliage or bottles that read correctly.
- **Per-part materials** — why not: draw calls scale with parts again.
- **Fake glass via vertex alpha on the opaque material** — why not: engines sort and shade it wrongly; no refraction.

## Consequences
- Easier: windows, foliage and bottles in the same pipeline; a shampoo bottle is 2 draw calls.
- Harder: transmission isn't supported everywhere; the fallback looks flatter.
- Revisit when: an engine target needs a fifth shading model (e.g. emissive-only, subsurface).
