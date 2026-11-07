# 07 — What fits

**Code recipes win where parts line up, repeat, or match real dimensions. Organic forms work as stylised sculpts (SDF edit lists); realistic anatomy is still the weak spot.** Pick the tool by the asset, not by loyalty; many teams will use both.

As of 2026-11. "Today" = shipped in this repo; "Planned" names the milestone ([roadmap](../plans/roadmap.md)).

## Fit matrix

| Category | Examples | Fit | Today | Planned | Why |
|---|---|---|---|---|---|
| Hard-surface props | Crates, barrels, lamps, benches, machinery | **Strong** | `box({ bevel })`, `lathe`, `prism`, `beam`, `planar`, `sweep`, `loft`, `lattice`, `text`; `weightedNormals` | | Primitive shapes, real dimensions, repetition |
| Architecture | Facades, terraces, towers, stations | **Strong** | `facade({ kit })`, `setbacks`, `roof`, `opening`, `mass`, `tiled`, `cell`; `station_halt`, `water_tower` recipes | | Grammar-driven repetition, floors × bays |
| Tracked / wheeled vehicles | Tanks, carts, trucks | **Strong** | `trackRun`, `axle`, `prism` sloped armour, `loft` | | Named spinning wheels, pivoted turrets |
| Rail | Steam locos, wagons | **Strong** | `whyteAxles` (Whyte `4-4-0`), `lathe` boilers, `beam` rods; `loco_440` recipe | `orbit` motion for side rods | Domain-native params |
| Aircraft | Props, biplanes, airliners | **Good** | `propeller`, `loft`, `sweep` | Aircraft recipes | Lofted sections + named control surfaces |
| Vessels | Boats, ships, barges | **Good** | `hull` from length / beam / draft / sheer | Ship recipes | Lofted hull sections |
| Modular kits | Walls, floors, pipes, fences | **Strong** | `box`, `prism`, `beam`, `sweep`, `tiled` | | Snapping on a metre grid |
| Vegetation | Trees, shrubs | **Good** | `tree` (Weber–Penn; oak, pine, palm, birch, willow), `trees` family | Vertex wind weights; crossed-billboard LOD2 impostors | Botanical rules are code |
| Rocks, terrain | Boulders, cliffs, mountain tiles | **Good** | `sdf` / `sculpt` + noise; `heightfield` + hydraulic / thermal erosion + `terrainColor`; `boulders`, `asteroid`, `mountain_range` recipes | Rivers carved as meshes | Erosion is what makes terrain read as real |
| Stylised characters | Fantasy busts, mascots | **Fair** | `head` kind (orc, goblin, human, dwarf, elf presets) on `sculpt`; jaw and eyes as pivots | Skinned bodies (`creature`, glTF skins) | Readable stylised shapes; realism is not the goal |
| Realistic animals | Horse, dog, bird | **Weak** | — | `/neural` adapter (M5) | Anatomy is sculpted, not specified |
| People | Characters, NPCs | **Weak** | — | `/neural` adapter or `importGlb` of a CC0 base mesh (M5) | Faces, hands, anatomy |
| Cloth, hair, soft goods | Flags, sofas, garments | **Weak** | — | — | Simulation / sculpt territory |
| Photoreal hero assets | Close-up scans | **Out of scope** | — | — | Photogrammetry or a sculptor |

## Where each approach is strong

| Strength | Code recipes (ts23d) | Image-to-3D / AI generators |
|---|---|---|
| Organic and sculpted forms | Stylised: fair (`sculpt`); realistic: weak | Strong |
| Concept art → textured mesh in seconds | No | Strong |
| Auto-rigging characters | No (rigid part hierarchy only) | Exists in several tools; rigs usually need cleanup |
| Parts that line up, repeat, match real dimensions | Strong | Weak |
| Named, pivoted, animatable nodes | Built in | Usually one fused mesh |
| Deterministic, diffable in git | Yes | No |
| Shared material, consistent texel density | Yes | Per-asset textures |
| Cost, licence conditions on outputs | Free, none | Credits; terms vary by tier ([landscape](../landscape.md)) |

## Covering the weak spots

1. **Stylised creature kind** (M4): the `sculpt` + `head` work extended to whole bodies, SDF flesh over a biped/quadruped/bird skeleton, skin weights from the sculpt's own blend weights ([glTF capabilities](../architecture/gltf-capabilities.md)). Readable, deterministic. Not realistic, by design.
2. **`/neural` adapter** (M5): run an open-weight model (TRELLIS.2, Hunyuan3D 2.1, SF3D/SPAR3D) on your own GPU, wrap the result as an ordinary part, cache it by content hash. [08-neural-adapters.md](08-neural-adapters.md).
3. **`importGlb`** (M5): bring a mesh from anywhere (a CC0 base mesh, a sculpt, another tool) and fit it into the recipe as a part.

Mix them: a recipe-built cart with a neural-generated horse in front, one scene, one material.
