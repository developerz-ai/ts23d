# Research — Surfaces and volumes: scales, fur, particles, porous, jelly, liquids, clouds, ice, mist, melting, lava

**Most of these are three things ts23d already has, combined: an SDF edit list (shape), a painted
strip (surface detail) and a surface material (how light passes). The gaps are a per-surface
optical parameter set (IOR, attenuation), an emissive texture channel, morph targets, and baked
flipbooks for the engine's particles.** Each section below gives real-time and film techniques
with sources, what glTF can carry, engine notes, and a ts23d proposal (API sketch, module, effort
S/M/L). Research as of 2026-11-07; everything under "Proposed" is **planned, not shipped**; claims
without a fetched source are marked *(unverified)*. Hair is deep enough for its own page:
[hair.md](hair.md).

## What glTF can carry (2026-11)

| Extension | What it adds | Status | three.js r186 `GLTFLoader` |
|---|---|---|---|
| `KHR_materials_transmission` | light through the surface (glass, liquids) | Ratified | yes |
| `KHR_materials_ior` | index of refraction; default 1.5; spec examples: water **1.33**, eyes 1.38, window glass 1.52, diamond 2.42 | Ratified | yes |
| `KHR_materials_volume` | `thicknessFactor` (0 = thin-walled; > 0 = volume, mesh **must be manifold**), `attenuationDistance` (world m, default ∞), `attenuationColor`; homogeneous, not texturable except thickness; needs a transmission extension | Ratified | yes |
| `KHR_materials_dispersion` | `dispersion` = 20 / Abbe number (0 = none); builds on volume | Ratified | yes |
| `KHR_materials_diffuse_transmission` | thin translucency (leaves, paper) and dense media (candle wax with volume); transmission overrides it | **Release Candidate** | **no** |
| `KHR_materials_volume_scatter` | scattering inside the volume (`multiscatterColor`, `scatterAnisotropy`) | draft (Babylon: experimental; luma.gl: approximate) | no |
| `KHR_materials_subsurface` | SSS | Initial draft | no |
| `KHR_materials_sheen` | velvet / short fur rim | Ratified | yes |
| `KHR_materials_emissive_strength` | emission > 1 | Ratified (ts23d ships it) | yes |
| `KHR_texture_transform` | UV offset/scale/rotation per texture | Ratified | yes |
| `KHR_animation_pointer` | animate any property (UV offset → flipbook / flow scroll, emissive pulse) | Ratified | **no** (not in r186's list) |
| `EXT_mesh_gpu_instancing` | one mesh, N transforms | multi-vendor EXT | yes |
| Morph targets (`targets` + `weights`) | per-vertex deltas, animatable | core | yes |
| Volumetric grids (VDB) | — | **no glTF extension**; film uses OpenVDB files | — |

Sources: [Khronos registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md),
specs for [ior](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_ior),
[volume](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume),
[dispersion](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_dispersion),
[diffuse_transmission](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_diffuse_transmission);
volume_scatter status via [Babylon](https://doc.babylonjs.com/typedoc/classes/_babylonjs_loaders.GLTF2.KHR_materials_volume_scatter)
and [luma.gl](https://luma.gl/docs/api-reference/gltf/gltf-materials); three.js column read from
`node_modules/three@0.186.1/.../GLTFLoader.js`. Unity glTFast 6.8 lists transmission, IOR, sheen as
planned or partial ([features](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.8/manual/features.html)).

**ts23d today:** `surface: 'glass' | 'translucent'` write transmission + IOR 1.5 + thin volume
with an alpha-blend fallback, **one fixed parameter set per surface** (`src/export/materials.ts`,
ADR 008). `glow` makes whole parts emissive by `emissiveFactor` (no emissive texture). Nature strips
`water`, `lava`, `ice` and creature strips `dragon_scales`, `reptile_scales`, `hair`, `fur` exist
(`src/material/nature-*.ts`, `creature.ts`). `ctx.emitter` writes particle hints (`smoke`, `steam`,
`dust`, `muzzle`, `fire`, `sparks`) to `extras.ts23d.emitter` (`src/core/part.ts`). No morph
targets, no skins.

### Cross-cutting proposal: optical presets per surface (S–M)
```ts
// src/core/part.ts — a surface can carry optics; each distinct set = one material (like paint slots)
type Optics = { ior?: number; attenuation?: { color: Vec3; distance: number };
                thickness?: number; roughness?: number; dispersion?: number; transmission?: number };
ctx.part('water', mesh, { surface: 'glass', optics: OPTICS.water });   // presets in /material
export const OPTICS = { water: { ior: 1.33, attenuation: { color: [0.75, 0.92, 0.95], distance: 2 } },
  ice: { ior: 1.31, roughness: 0.08 }, ice_frosted: { ior: 1.31, roughness: 0.45 },
  jelly: { ior: 1.35, attenuation: { color: [0.3, 0.9, 0.3], distance: 0.05 }, transmission: 0.9 }, … };
```
Export writes one material per (surface, optics) pair, merge splits per pair (one more draw call
each, as paint slots do), manifest lists them. `thickness > 0` triggers a **manifold check** (the
spec requires it; `closed.ts` already tests closedness). Values cited per section; ice 1.31 is the
commonly tabulated value (*unverified here*; not in the KHR_materials_ior table).

---

## 1. Scales

| Technique | How | Source |
|---|---|---|
| Normal/height texture | tiling scale pattern; cheapest; what most game creatures ship | ts23d `CREATURE_MATERIALS.dragon_scales` / `reptile_scales` |
| Displacement on sculpt | cellular (Worley) pattern stretched along the body flow → domed shingled scales as geometry | ts23d `recipes/dragon/scales.ts`; Houdini "scales" VOP returns displaced P/N ([Polycount](https://polycount.com/discussion/comment/2651259)) |
| Instanced scale geometry | scatter a scale mesh over the surface, orient by a tangent frame (Houdini *PolyFrame*) | [Polycount](https://polycount.com/discussion/comment/2651248), [80.lv dragon in Houdini](https://80.lv/articles/comprehensive-tutorial-on-modeling-texturing-a-dragon-in-houdini) |
| Rows / phyllotaxis | overlapping rows along a flow (fish, pangolin, pine cone); golden-angle spirals for cones | common practice *(no single source)* |

Overlap order matters: each row tucks under the previous one toward the tail. Instancing via
`EXT_mesh_gpu_instancing` needs identical rigid copies, so it suits armour plates, not scales that
conform to a curved body.

**Proposed (`src/primitives/scales.ts`, M):** a field displacement in body-flow coordinates:
```ts
scaleField(o: { frame: (p: Vec3) => { u: number; v: number; n: Vec3 };   // flow coords (path arclength, around)
  size: number | ((u: number, v: number) => number);  // graded dorsal → ventral
  overlap: number; point: number; dome: number; rows?: 'grid' | 'phyllotaxis'; seed: number }): (p: Vec3) => number;
scatterScales(mesh, o: { scale: Mesh; spacing: number; along: Vec3 | ((p) => Vec3); maxCount: number }): Mesh;  // LOD0 hero plates
```
`scaleField` plugs into `sd.displace`; it must report its Lipschitz factor (see
[10-sculpting](../idea/10-sculpting.md), strokes). LOD: geometry at LOD0, strip-only at LOD2 (the
roadmap's "LOD fallback to normal-mapped pattern"). Generalises what `recipes/dragon/scales.ts`
does by hand.

## 2. Fur
See [hair.md §8](hair.md#8-fur): shells + fins (Lengyel et al. 2001), fur cards for manes/tails,
`KHR_materials_sheen` for short pelts. Proposed `furShells` (M) lives with hair.

## 3. Particles and flipbooks

| Technique | How | Source |
|---|---|---|
| Flipbook (SubUV) | an atlas of N×M frames played on camera-facing quads | standard; Unreal SubUV |
| Frame blending | cross-fade adjacent frames | Unreal built-in |
| Motion-vector blending | a second texture of per-pixel flow warps frame *n* toward *n+1*; a 16-frame sheet can look like 36 frames, at more runtime cost | [realtimevfx 1](https://realtimevfx.com/t/vfx-for-aaa-shooter/536), [2](https://realtimevfx.com/t/motion-vectors-for-animated-textures-how-do-you-generate-them/575?page=2), [SideFX GameDev shader](https://github.com/sideeffects/GameDevelopmentToolset/blob/Development/unity/shaders/ShaderFunctionsExamples.shader) |
| Soft particles | fade alpha by (scene depth − particle depth) to hide intersections | T. Lorach, NVIDIA, "Soft Particles", 2007 ([PDF](https://developer.download.nvidia.com/whitepapers/2007/SDK10/SoftParticles_hi.pdf)) |
| Film | simulated volumes (Houdini Pyro) rendered to images or VDB | — |

Motion vectors only exist inside each frame's silhouette, so blending works where consecutive
silhouettes overlap (forum report). glTF has **no particle system**; engines own spawning.
`KHR_animation_pointer` + `KHR_texture_transform` could step a flipbook's UV offset inside the GLB,
but three.js r186 does not read the pointer extension.

**Proposed (`src/render/flipbook.ts` + `src/core/part.ts`, M):** keep spawning engine-side, ship the
look. (1) Richer `Emitter`: `sizeOverLife`, `colorOverLife` (keys), `alphaOverLife`, `gravity`,
`drag`, `blend: 'alpha' | 'additive'`. (2) `t3d flipbook` renders deterministic frames on the CPU:
ray-march a noise-displaced density SDF (smoke puff, fire tongue, dust burst, magic swirl) with
one light, writes `<asset>_fx_<kind>.png` (e.g. 8×8 frames, 2048²) + an optional motion-vector PNG
from the analytic velocity field (exact, unlike optical flow), and `extras.ts23d.emitter.flipbook =
{ texture, cols, rows, fps }`. Particle textures are **not** on the trim sheet: they belong to the
engine's particle material, so the one-material rule for the asset holds.

## 4. Sponge and porous solids

| Technique | How | Source |
|---|---|---|
| TPMS (gyroid) | `sin x cos y + sin y cos z + sin z cos x = c`, thicken `|g| < t`; not a true SDF, normalise by gradient | [csgrs tpms](https://docs.rs/crate/csgrs/latest/source/src/mesh/tpms.rs), [arXiv 2406.16215](https://arxiv.org/pdf/2406.16215), [triply periodic surfaces](https://samuelpmish.github.io/math/triply_periodic_surfaces) |
| Boolean pores | subtract seeded spheres/ellipsoids (cheese, bread, pumice, foam) | common SDF practice |
| Displaced noise | `max(shape, −(noise − threshold))` for coral/sponge erosion | common SDF practice |
| Textures | porous normal/AO strip only | games at distance |

**Proposed (`src/primitives/sdf-ops.ts` additions, S):**
```ts
sd.gyroid(period: number, thickness: number): Field;           // scaled by period/2π, gradient-normalised bound
sd.pores(o: { bounds; radius: [min, max]; count; rng }): Field; // union of Poisson spheres (grid-hashed lookup)
// sponge = sd.intersect(shape, sd.gyroid(0.012, 0.002)); cheese = sd.subtract(wedge, sd.pores({...}))
```
Pores smaller than 2 cells alias, so LOD gates them: `ctx.pick([pores, biggerPores, none])` with a
porous strip at LOD2. Lipschitz bound of the gyroid is about `√3·2π/period` before scaling; the field
must be scaled so `sdf-grid.ts` block culling stays safe (a test samples it). Interior faces for a
sponge balloon triangle counts; budget it in the recipe.

## 5. Jelly and slime

| Technique | How | Source |
|---|---|---|
| Transmission + volume | clear/tinted body; attenuation colour gives depth-dependent tint (thicker = deeper colour) | KHR_materials_volume spec |
| Translucency | diffuse transmission / SSS for cloudy slime | RC / draft extensions (above) |
| Wobble | soft-body sim in film; in games a vertex shader or a squash/stretch scale animation | common practice *(unverified)* |

**Proposed (S):** `OPTICS.jelly` / `OPTICS.slime` presets (transmission ~0.9, IOR ~1.35, attenuation
colour, roughness 0.05–0.2); a **`pulse` motion** (scale oscillation about a pivot; glTF TRS
supports scale) for squash/stretch: `{ kind: 'pulse', scale: [1.06, 1.06, 0.9], hz }`; drips and
strands from the shared `drip()` helper (§10). Module: core (motion), export (scale channel).

## 6. Liquids

| Topic | Real-time | Film | Source |
|---|---|---|---|
| Open water | sum of sine/Gerstner waves displacing a grid + dynamic normals | FFT ocean spectrum (statistical) | M. Finch, GPU Gems ch. 1 ([NVIDIA](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)); J. Tessendorf, "Simulating Ocean Water", SIGGRAPH 2001 course |
| Containers | liquid = a separate closed mesh slightly inside the glass; meniscus curves up the wall (water on glass) | same + caustics | common practice; capillary length of water ≈ 2.7 mm *(unverified)* |
| Puddles | darken + smooth the ground (wet), a flat transmissive/mirror surface | — | [Lagarde, wet surfaces](https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/) (cited in `nature-ground.ts`) |
| Drips, splashes | sculpted teardrops, crowns; flipbooks for motion | FLIP sims | — |

Statistical FFT water does not interact with objects ([Tessendorf, Interactive Water Surfaces](https://jtessen.people.clemson.edu/reports/papers_files/Interactive_Water_Surfaces.pdf)).
An asset generator ships the **shape at rest**; the engine animates oceans.

**Proposed (M):**
```ts
// src/primitives/liquid.ts
waterSurface(o: { size: [number, number]; waves: { dir: Vec2; amp: number; length: number; steep: number }[];
  cell: number; seed: number }): Mesh;                     // Gerstner sum, deterministic, LOD = cell
liquidIn(container: Field, o: { level: number; meniscus?: number /* m, + up (water), − down (mercury) */;
  inset?: number }): Mesh;                                 // container interior ∩ half-space, rim filleted
puddle(o: { outline: Vec2[] | { radius: number; seed: number }; depth: number }): Mesh;
drip(o: { from: Vec3; length: number; radius: number; bulb: number }): SculptEdit;  // shared with melt/ice/wax
```
`liquidIn` is pure SDF: intersect the container's inner field with `z < level`, and add the meniscus
as a smooth-min fillet of radius `meniscus` against the wall: exactly a `blend`. Water gets
`OPTICS.water` (IOR 1.33). Gate: the liquid's closed mesh must sit within 1 mm of the wall without
crossing it (field test), a new `T3D_LIQUID_LEAK` finding. Optional `KHR_texture_transform` scroll
for rivers later.

## 7. Clouds

| Technique | How | Source |
|---|---|---|
| Ray-marched volumetric skies | noise-shaped density, ray-marched per frame; Horizon's Nubis renders in < 2 ms on PS4 | A. Schneider, N. Vos, "The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn", SIGGRAPH 2015 ([slides](https://www.advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)); [Nubis Cubed 2023](https://advances.realtimerendering.com/s2023/Nubis%20Cubed%20(Advances%202023).pdf) |
| Impostor cards | painted/rendered cloud billboards, alpha blended, far sky | common practice |
| Stylised mesh clouds | metaball/SDF blobs, soft gradient shading, opaque | common in stylised games *(unverified)* |
| Film | VDB density volumes; Disney released a production-complexity cloud dataset under a Creative Commons licence | [fxguide](https://www.fxguide.com/?p=235006), [CGChannel](https://www.cgchannel.com/?p=95173) (licence detail per secondary sources) |

Ray-marched skies are engine systems, not assets. What ts23d can make: hero cloud meshes and
billboard sets.

**Proposed:** (a) `cloud(o: { blobs | seed, size, flatBase: true })` = SDF metaballs with a flat
bottom (clip below `base`), smooth union, gradient vertex colour (white top, blue-grey base),
`ctx.pick` resolution; S. (b) Cloud impostor cards: render the same SDF from 4–8 views into
cutout/BLEND cards via the CPU renderer; M. (c) **OpenVDB export** of any SDF/density field for film
pipelines: OpenVDB's on-disk format is involved (tree of nodes, compression); zero-dependency writing
is **L** and should wait for a user. Cheaper intermediate: NanoVDB or a raw `.vol`/dense grid
*(format suitability unverified)*.

## 8. Ice

| Look | Technique | glTF |
|---|---|---|
| Clear ice | transmission + IOR ≈ 1.31 + slight cyan attenuation | transmission, ior, volume |
| Frosted | rough transmission (roughness 0.3–0.5), or opaque white strip | transmission roughness |
| Internal cracks, bubbles | internal surfaces inside the closed volume (path tracers show them; raster transmission in three.js renders opaque objects behind a transmissive one, so internal transmissive faces may not read *(unverified)*) | geometry |
| Icicles | tapered cones with ring ripples and a drip bulb | geometry |
| Frost rim, snow cap | opaque `ice`/`snow` strips on top faces | trim sheet (ts23d has `ice`, `snow`) |

**Proposed (S–M, primitives + material):** `OPTICS.ice` / `ice_frosted`; `icicle(o: { length,
radius, ripples, seed })` = `drip()` with ring displacement; bubbles = `sd.pores` *subtracted* as
tiny cavities (closed inner shells), cracks = thin `subtract` slabs; LOD2 drops interiors. Crystal
clusters = seeded hexagonal prisms (`prism`) with pointed caps, fanned from a base.

## 9. Mist, fog, smoke wisps

| Technique | How | Source |
|---|---|---|
| Height/exponential fog | engine post/volumetric fog | engine-side |
| Soft cards | large BLEND cards with depth fade (soft particles) | Lorach 2007 |
| Particles | emitter with slow drift, big size, long life | engine |

glTF can carry soft-edged BLEND cards but not depth fade. **Proposed (S):** (1) `mistCards(o: {
area, height, layers, seed })` → BLEND cards (`surface: 'translucent'`, low alpha in a soft cell),
crossed and jittered; (2) `extras.ts23d.fog = { density, height, color }` on the root as an engine
hint (Godot `meta`, three `userData`), documented as a hint; (3) `emitter({ kind: 'mist' })` (new
kind) with the flipbook from §3.

## 10. Melting and state change

| Technique | How | Source |
|---|---|---|
| Film | simulate as a fluid whose viscosity varies with temperature: solids as very high viscosity; melting candles, lava | Carlson, Mucha, Van Horn, Turk, "Melting and Flowing", SCA 2002 ([record](https://scilit.com/publications/75dea8aea33d574ca5c4d9b096728daf); DOI 10.1145/545261.545289) |
| Games | blend shapes (morph targets) between solid and melted, or a vertex-shader sag | common practice *(unverified)* |

**Proposed (M–L, primitives + export):**
```ts
melt(field: Field, o: { amount: number /* 0..1 */; floor: number; sag: number; puddle: number;
  drips?: number; seed: number }): Field;
```
`amount` drives: a downward domain warp growing with height above `floor` (gravity sag), a smooth
union with a puddle disc whose radius grows with `amount`, and `drip()`s at the lowest overhangs
(found by sampling the field's lowest boundary points). Static use: `melt(…, { amount: 0.4 })` at all
LODs. **Animation via morph targets:** mesh once at `amount = 0`, then move every vertex onto the
`amount = k` zero set by a few Newton steps along the gradient (`p -= f(p)·∇f/|∇f|²`): same topology,
valid glTF `targets` for k = 0.25, 0.5, 1. Requires morph-target export (roadmap: later) and a test
that projected vertices land within one cell of the true surface; large melts fold topology and
need a coarser key. Candle wax, ice, chocolate, molten metal share it.

## 11. Lava

| Feature | Technique | Source |
|---|---|---|
| Glow | emissive drives the look, bloom does the rest; flow maps need periodic resets that are visible on emissive | [80.lv: making lava for games](https://80.lv/articles/making-lava-for-games/) |
| Crust plates over cracks | Voronoi plates, seam width = crack, temperature tints the seams | [shader example](https://www.shadcn.io/shaders/magma-shader) (stylised web shader) |
| Colour | blackbody: dull red at the lowest visible glow (~800 K, the Draper point) through orange to yellow as temperature rises *(unverified here)* | physics |
| Forms | pāhoehoe: smooth, ropy folded skin; ʻaʻā: rough rubble of clinker (USGS volcano glossary *(not fetched)*) | geology |

ts23d has a `lava` strip (Voronoi crust plates; glows only through a `glow` rule, per its header)
and per-part glow. Gap: glTF emission is `emissiveTexture × emissiveFactor`; vertex colour cannot
emit, and ts23d writes no emissive texture, so glow is per part, not per crack.

**Proposed (M):** two stages. (1) **Geometry-binned glow, no new texture:** `lavaFlow(o: { path |
area, crust: 0..1, form: 'pahoehoe' | 'aa', seed })` builds crust plates (raised, `cliff`/basalt
strip, rough) and recessed crack floors from a temperature field; crack faces are split into 2–3
parts by temperature bin, each a `glow` rule with blackbody colour and `emissiveStrength` falling
with crust thickness. Works in every engine today. ʻaʻā = scattered clinker rocks (boulders recipe
logic) over a dark core; pāhoehoe = sweeps of ropy folds (`sweep` with a sine section) on the crust.
(2) **Emissive layer on the trim sheet** (an `emissive` texture alongside albedo/normal/ORM, black
except strips that declare it): per-texel glow in cracks of the `lava` strip; one more texture for
assets that use it. Needs an ADR (texture set changes). Animated pulse later via
`KHR_animation_pointer` (not read by three.js r186).

---

## Top recommended build items (both pages)

| # | Item | Module | Effort | Why first |
|---|---|---|---|---|
| 1 | `COLOR_0` alpha end to end (Mesh RGBA + exporter) | core, export | S | unlocks tapered hair tips, fur shell slices, soft mist cards |
| 2 | `hairStrands` (roots, presets, interpolation, clumping, SDF collision) | primitives | M | the source for every hair output |
| 3 | `hairCards` + alpha hair strips (inside→outside order, vertex root→tip) | primitives, material | M | the game-standard hair representation |
| 4 | `surface: 'hair'` (MASK + always-tangent + `KHR_materials_anisotropy`) via ADR superseding 008's cap | core, export | S–M | anisotropic highlights in every reader that supports the ratified extension |
| 5 | Hair QA: scalp coverage, penetration, floating roots, overdraw | qa | M | "a rule without a gate is a suggestion" |
| 6 | `hairShell` LOD2 + stylised highlight bands/grooves (with `roundCone`/`skin()`) | primitives | M | far LOD and the hand-painted look |
| 7 | Optical presets per surface (`optics`: IOR, attenuation, roughness) | core, export | S–M | water 1.33, ice 1.31, jelly, tinted glass; one material per set |
| 8 | `drip()` + `liquidIn` (meniscus as a blend) + `waterSurface` | primitives | M | liquids, icicles, wax, slime share one helper |
| 9 | `sd.gyroid` / `sd.pores` + `scaleField` | primitives | S + M | sponge, cheese, pumice; scales generalised from the dragon |
| 10 | Emitter v2 + CPU flipbook bake (`t3d flipbook`, motion vectors) | core, render, cli | M | particles that look authored, still engine-spawned |
| — | Later: `melt` + morph targets (M–L), lava emissive layer (M + ADR), `furShells` (M), VDB export (L) | | | |

## Sources

- Khronos: [extension registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md) · [KHR_materials_ior](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_ior) · [KHR_materials_volume](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume) · [KHR_materials_dispersion](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_dispersion) · [KHR_materials_diffuse_transmission](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_diffuse_transmission)
- Draft scatter: [Babylon KHR_materials_volume_scatter](https://doc.babylonjs.com/typedoc/classes/_babylonjs_loaders.GLTF2.KHR_materials_volume_scatter) · [luma.gl glTF materials](https://luma.gl/docs/api-reference/gltf/gltf-materials)
- Unity glTFast [features 6.8](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.8/manual/features.html); three.js r186 `GLTFLoader.js` (local)
- Water: M. Finch, "Effective Water Simulation from Physical Models", GPU Gems ch. 1 ([NVIDIA](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)) · J. Tessendorf, "Simulating Ocean Water", SIGGRAPH 2001 course notes · [Tessendorf, Interactive Water Surfaces](https://jtessen.people.clemson.edu/reports/papers_files/Interactive_Water_Surfaces.pdf) · [NVIDIA OceanCS slides](https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/OceanCS_Slides.pdf) · [Lagarde, wet surfaces](https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/)
- Clouds: Schneider & Vos, SIGGRAPH 2015 [slides](https://www.advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf) · [Nubis Cubed 2023](https://advances.realtimerendering.com/s2023/Nubis%20Cubed%20(Advances%202023).pdf) · [Guerrilla: Nubis evolved](https://www.guerrilla-games.com/read/nubis-evolved) · Disney cloud dataset: [fxguide](https://www.fxguide.com/?p=235006), [CGChannel](https://www.cgchannel.com/?p=95173)
- Particles: T. Lorach, "Soft Particles", NVIDIA 2007 [PDF](https://developer.download.nvidia.com/whitepapers/2007/SDK10/SoftParticles_hi.pdf) · realtimevfx [1](https://realtimevfx.com/t/vfx-for-aaa-shooter/536) [2](https://realtimevfx.com/t/motion-vectors-for-animated-textures-how-do-you-generate-them/575?page=2) [TFlow](https://realtimevfx.com/t/tflow-motion-vector-generator/18214) · [SideFX GameDev toolset shader](https://github.com/sideeffects/GameDevelopmentToolset/blob/Development/unity/shaders/ShaderFunctionsExamples.shader)
- Porous: [csgrs TPMS](https://docs.rs/crate/csgrs/latest/source/src/mesh/tpms.rs) · [arXiv 2406.16215](https://arxiv.org/pdf/2406.16215) · [Triply periodic surfaces](https://samuelpmish.github.io/math/triply_periodic_surfaces)
- Scales: Polycount [1](https://polycount.com/discussion/comment/2651259) [2](https://polycount.com/discussion/comment/2651248) · [80.lv dragon in Houdini](https://80.lv/articles/comprehensive-tutorial-on-modeling-texturing-a-dragon-in-houdini)
- Melting: M. Carlson, P. Mucha, R. Van Horn, G. Turk, "Melting and Flowing", SCA 2002 ([record](https://scilit.com/publications/75dea8aea33d574ca5c4d9b096728daf))
- Lava: [80.lv: making lava for games](https://80.lv/articles/making-lava-for-games/) · [magma shader example](https://www.shadcn.io/shaders/magma-shader)
- Fur: see [hair.md](hair.md#sources)
