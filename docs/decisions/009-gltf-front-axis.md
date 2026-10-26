# 009 — Exported GLBs face glTF +Z

Status: accepted
Date: 2026-10-25
Supersedes: 004 (export orientation only; authoring stays metres, Z up, +X front)

## Context
ADR 004 exported with one −90° X rotation on the root (`[-√½, 0, 0, √½]`). That makes glTF Y-up, but maps authoring +X front to glTF **+X**, which the glTF spec defines as the asset's *left* ("the front side of a glTF asset faces +Z, the left side faces +X", [spec §coordinate-system-and-units](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#coordinate-system-and-units)). Every asset faced sideways in engines that honour model-front. Found by [glb-production.md](../architecture/glb-production.md) (M10, G1).

## Decision
The root node's rotation is `[-0.5, -0.5, -0.5, 0.5]`. It maps authoring +X (front) → glTF +Z, +Z (up) → +Y, +Y (left) → +X, verified numerically in the exporter tests. Authoring conventions from ADR 004 are unchanged; part nodes keep their Z-up numbers under the root.

## Alternatives considered
- **Keep `[-√½, 0, 0, √½]`** — why not: violates the spec's front axis; assets face left in every engine that uses model-front.
- **Author in +Z front (or Y-up, +Z front) so no root rotation is needed** — why not: breaks every recipe's readable numbers. Length along X, height along Z is how specs and drawings read; transposing them invites the unit and axis mistakes ADR 004 exists to prevent.
- **Bake the rotation into every vertex** — why not: part pivots and node translations would no longer match the recipe's numbers, and engines bind to those nodes.

## Consequences
- Easier: assets face forward in Godot, Unity (glTFast), three.js, Babylon and Unreal without per-asset fixes.
- Harder: **breaking** for anyone who placed earlier GLBs by hand: rotate them −90° about Y. Raw node data is still Z-up below the root.
- Revisit when: never, short of a glTF spec change.
