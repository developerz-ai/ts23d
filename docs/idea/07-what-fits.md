# 07 — What fits

**Code recipes win where parts line up, repeat, or match real dimensions. They lose on organic, sculpted forms.** Pick the tool by the asset, not by loyalty; many teams will use both.

As of 2026-10. "Today" = shipped in this repo; "Planned" names the milestone ([roadmap](../plans/roadmap.md)).

## Fit matrix

| Category | Examples | Fit | Today | Planned | Why |
|---|---|---|---|---|---|
| Hard-surface props | Crates, barrels, lamps, benches, machinery | **Strong** | `box`, `lathe`, `cylinder`, `prism`, `beam`, `planar`, `sweep`, `loft` | `lattice` truss | Primitive shapes, real dimensions, repetition |
| Architecture | Facades, terraces, towers, stations | **Strong** | `facade` (split grammar), `setbacks`, `prism` gables | `roof`, `tiled`, `cell` (M1) | Grammar-driven repetition, floors × bays |
| Tracked / wheeled vehicles | Tanks, carts, trucks | **Strong** | `trackRun`, `axle`, `prism` sloped armour, `loft` | | Named spinning wheels, pivoted turrets |
| Rail | Steam locos, wagons | **Strong** | `whyteAxles` (Whyte `4-4-0`), `lathe` boilers, `beam` rods; `loco_440` recipe | `orbit` motion for side rods | Domain-native params |
| Aircraft | Props, biplanes, airliners | **Good** | `propeller`, `loft`, `sweep` | Aircraft recipes | Lofted sections + named control surfaces |
| Vessels | Boats, ships, barges | **Good** | — | `hull` from length/beam/draft (M2) | Lofted hull sections |
| Modular kits | Walls, floors, pipes, fences | **Strong** | `box`, `prism`, `beam`, `sweep` | `tiled` (M1) | Snapping on a metre grid |
| Vegetation | Trees, shrubs | **Good** | `tree` (Weber–Penn; oak, pine, palm, birch, willow), `trees` family | Vertex wind weights; crossed-billboard LOD2 impostors | Botanical rules are code |
| Rocks, terrain lumps | Boulders, cliffs | **Fair** | — | `sdf` + noise (M4) | Noise is fine; hero rocks look procedural |
| Stylised creatures | Spore-like critters, mascots | **Fair** | — | `creature`: SDF flesh over a skeleton (M4) | Readable shapes, not anatomy |
| Realistic animals | Horse, dog, bird | **Weak** | — | `/neural` adapter (M5) | Anatomy is sculpted, not specified |
| People | Characters, NPCs | **Weak** | — | `/neural` adapter or `importGlb` of a CC0 base mesh (M5) | Faces, hands, anatomy |
| Cloth, hair, soft goods | Flags, sofas, garments | **Weak** | — | — | Simulation / sculpt territory |
| Photoreal hero assets | Close-up scans | **Out of scope** | — | — | Photogrammetry or a sculptor |

## Where each approach is strong

| Strength | Code recipes (ts23d) | Image-to-3D / AI generators |
|---|---|---|
| Organic and sculpted forms | Weak | Strong |
| Concept art → textured mesh in seconds | No | Strong |
| Auto-rigging characters | No (rigid part hierarchy only) | Exists in several tools; rigs usually need cleanup |
| Parts that line up, repeat, match real dimensions | Strong | Weak |
| Named, pivoted, animatable nodes | Built in | Usually one fused mesh |
| Deterministic, diffable in git | Yes | No |
| Shared material, consistent texel density | Yes | Per-asset textures |
| Cost, licence conditions on outputs | Free, none | Credits; terms vary by tier ([landscape](../landscape.md)) |

## Covering the weak spots

1. **Stylised creature kind** (M4): SDF flesh skinned over a biped/quadruped/bird skeleton. Readable, low-poly, deterministic. Not realistic, by design.
2. **`/neural` adapter** (M5): run an open-weight model (TRELLIS.2, Hunyuan3D 2.1, SF3D/SPAR3D) on your own GPU, wrap the result as an ordinary part, cache it by content hash. [08-neural-adapters.md](08-neural-adapters.md).
3. **`importGlb`** (M5): bring a mesh from anywhere (a CC0 base mesh, a sculpt, another tool) and fit it into the recipe as a part.

Mix them: a recipe-built cart with a neural-generated horse in front, one scene, one material.
