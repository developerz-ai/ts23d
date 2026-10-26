# 004 — Author in metres, Z up, +X front

Status: accepted; export orientation superseded by 009
Date: 2026-10-25
Supersedes: —

## Context
Recipes are written from reference data: drawings, spec sheets, Wikipedia infoboxes. Those are in metres (or convertible), in plan + elevation. glTF is Y-up; engines differ (Unity Y-up left-handed, Unreal Z-up, Godot Y-up, Blender Z-up). Every asset also needs one agreed "front" so a scene can place and orient it.

## Decision
Author in metres, right-handed, **Z up, +X front**, +Y left, ground at z = 0. The GLB writer applies one −90° X rotation on the root node to meet glTF's Y-up; part nodes keep their Z-up numbers.

## Alternatives considered
- **Y-up, matching glTF** — why not: plan coordinates become (x, z) and height becomes y, so every architectural and vehicle dimension is transposed while writing. More agent mistakes.
- **Centimetres or engine units** — why not: reference data is in metres; a factor of 100 is a silent class of bugs.
- **−Y or +Y front (Blender convention)** — why not: +X front keeps "length along X" for vehicles and ships, matching how specs list L × W × H.

## Consequences
- Easier: dimensions drop straight in from references; `SIDE -Y` in the contact sheet shows the profile with the front on the right.
- Harder: one root rotation to remember when reading raw glTF nodes. `extras.up` records it.
- Revisit when: never, short of a 1.0 → 2.0 break. It's in every recipe.
