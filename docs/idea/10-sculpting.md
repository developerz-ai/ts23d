# 10 — Sculpting: what artists do, and what it means for SDF edit lists

**Artists fight topology so they can push clay; ts23d has no topology until it meshes. Most of the sculpting toolbox maps onto the existing `sculpt` edit list as new edit kinds, not as a mesh editor.** This page surveys how sculptors work (Blender, ZBrush, the SpeedSculpt add-on), maps each technique onto `src/primitives/sculpt*.ts` and `sdf*.ts`, and proposes the next DSL steps. Research as of 2026-11; everything under "Proposed" is **planned, not shipped**.

## How sculptors work

| Technique | What it does | Source |
|---|---|---|
| **Voxel remesh** (Blender Remesh, ZBrush DynaMesh) | Rebuild the whole mesh as an even, manifold grid at one resolution. Blender's Remesh modifier has Blocks / Smooth / Sharp / Voxel modes; Voxel "generate[s] a new manifold mesh from the current geometry" via OpenVDB. Used for **base forms**: merge blobs, keep brush strokes even | [Blender: Remesh](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html), [ZBrush base mesh creation](https://help.maxon.net/zbr/en-us/Content/html/features/main-features/base-mesh-creation/base-mesh-creation.html) |
| **Dyntopo** (dynamic topology) | Subdivides/collapses under the brush during a stroke: "most brushes will subdivide the mesh during the stroke". Detail size is Relative (screen pixels), Constant (fraction of a unit), Brush or Manual. Used for **local detail** without densifying everything | [Blender: Dyntopo](https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/tool_settings/dyntopo.html) |
| **Retopology** (ZRemesher, QuadriFlow, by hand) | After the form is final, a clean low-poly cage with controlled edge flow; community order is "DynaMesh first, ZRemesher last" | [ZBrushCentral thread](https://zbrushcentral.com/t/what-is-the-difference-between-dynamesh-and-zremesher-advantages/324598) (practitioner opinion) |
| **Skin / ZSpheres** | A vertex-and-edge skeleton with a radius per vertex becomes a mostly-quad tube surface. Blender: one **root** per connected set; **branch smoothing** relaxes joints "with the side effect of shrinking it". ZSpheres: "Adaptive Skin" around a sphere chain | [Blender: Skin](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/skin.html), [ZBrush ZSpheres](https://help.maxon.net/zbp/en-us/Content/html/4_palettes_tool-3-zsphere-settings.html) |
| **Lattice deform** | A coarse control cage bends everything inside it; non-destructive, keeps UVs, one lattice drives several objects. Theory: free-form deformation with trivariate Bernstein polynomials (Sederberg & Parry, SIGGRAPH 1986) | [Blender: Lattice modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/lattice.html), [Sederberg & Parry 1986](https://history.siggraph.org/?p=116034) |
| **SpeedSculpt** (paid add-on, Pitiwazou) | A workflow wrapper over Blender: build from primitives with auto mirror + parenting, curves, **Draw Skin** (tails, horns), Dyntopo + Remesh, **Geomesh** ("create a final version of your meshes without having to combine them": non-destructive union preview), Booleans, Lattice from a mask, **Quick Pose** (bones for a part), Decimate, masks, cutters. Lathe appears in forum discussion but not on the current product page | [Superhive: SpeedSculpt](https://superhivemarket.com/products/speedsculpt), [Blender Artists thread](https://blenderartists.org/t/speedsculpt-addon/673722) |
| **Primary → secondary → tertiary** | Block the big planes (skull, cheekbones, sockets, jaw), then features and folds, then surface detail (pores, wrinkles). Stylised work exaggerates primaries and keeps planes crisp | [Polycount discussion](https://polycount.com/discussion/comment/2555887), Gnomon "Sculpting the Planes of the Head" (course; description only) |
| **Reference planes** | Front and side orthographic images behind the model; today often AI-generated turnarounds. Sculptors check silhouette against them in ortho views | Common practice; no single authoritative source |

**The pattern:** remesh, Dyntopo and retopology all exist because a triangle mesh stores the form *and* its sampling in the same data. Push a region and it runs out of triangles; merge two blobs and the topology tangles. An SDF edit list stores only the form. Sampling happens once, at the end, at whatever `resolution` the LOD asks for.

## What ts23d already has

| Artist concept | ts23d today | Where |
|---|---|---|
| Ordered clay edits: add, subtract, intersect, paint | `sculpt({ edits })`, Dreams-style smooth-min fold with `blend` radius; colour rides the same weights | `src/primitives/sculpt.ts`, `sculpt-tree.ts` |
| Non-destructive booleans (Geomesh) | Edits never collapse; `op: 'subtract' \| 'intersect'`; **groups** fold their own edits first, so a subtract inside a group trims only that group | `sculpt-edit.ts` (`SculptGroup`) |
| Voxel remesh (base forms) | `sdf()` samples a cubic grid; `resolution` (cell edge, metres) *is* the voxel size and the LOD knob; surface nets (default) or marching cubes; always closed | `sdf.ts`, `sdf-grid.ts`, `surface-nets.ts` |
| Symmetry (mirror X in Blender) | `mirror: 'y'`, per-edit opt-out | `sculpt.ts` |
| Primitive library | sphere, ellipsoid, capsule, roundBox, cone, torus + rotation | `sculpt-edit.ts`, `sdf-ops.ts` (`shapes`, `sd`) |
| Noise displacement (tertiary skin, rock pitting) | `sd.displace(f, valueNoise(rng), amount)`; `sculptField` exposes the field for it | `sdf-ops.ts`, `value-noise.ts` |
| Primary → secondary → tertiary order | The `head` kind writes skull edits primary → secondary, explicitly "the ZBrush order" | `src/kinds/head-face.ts`, `head-extras.ts` |
| Hand-painted cavity + top-light tone | `toned()` samples the field: cavity, warm key, cool bounce, into vertex colour | `src/kinds/head-tone.ts` |
| Smooth normals at low res | Normals from the field gradient, so a coarse LOD2 still shades like the exact surface (vertex-frequency "high→low") | `sdf.ts` |
| Sparse evaluation | Bounding-sphere skips, 8³ block culling by Lipschitz bound | `sculpt-tree.ts`, `sdf-grid.ts` |
| Lathe | Polygon `lathe` for hard surface (not an SDF shape) | `lathe.ts` |
| Lattice | **Name clash:** `lattice` is the truss primitive, not a deformer | `lattice.ts` |

Missing: brush strokes along a path, tapered tubes (draw-skin), revolve as an SDF shape, cage/lattice deformation, bend/twist/taper warps, posing a group about a pivot, adaptive resolution, reference-image overlays.

## Proposed: brushes as SDF edits (planned)

Each brush is a new **edit kind** in the same list, so it composes with groups, mirror, colour and blend for free. Every proposal keeps determinism (pure functions of the edit data) and the zero-dependency rule.

### 1. Strokes: `crease`, `inflate`, `flatten`, `pinch` along a path

```ts
interface SculptStroke {
  readonly brush: 'clay' | 'crease' | 'inflate' | 'flatten' | 'pinch';
  readonly path: readonly Vec3[];          // polyline, metres (a curve stroke)
  readonly radius: number | readonly number[];   // per path point = pressure taper
  readonly strength?: number;              // metres of push at the centre, signed
  readonly falloff?: 'smooth' | 'sharp' | 'linear';
  readonly color?: Vec3;  readonly mirror?: boolean;
}
type SculptEdit = SculptShapeEdit | SculptGroup | SculptStroke;   // sculpt-edit.ts
```

| Brush | Field operation | Lipschitz cost |
|---|---|---|
| `clay` | smooth-union a flattened tapered capsule chain along the path | 1 (exact-ish) |
| `crease` | smooth-subtract a thin tapered capsule chain with a small `blend`: a V-groove (eyelid fold, armour seam, knuckle) | 1 |
| `inflate` | `d − strength · w(p)`, w = falloff of distance to the path | 1 + strength/radius |
| `flatten` | blend `d` toward the distance to the plane fitted through the path, weight w(p) | ≤ 2 |
| `pinch` | domain warp: pull `p` toward the path by `strength · w(p)` before evaluating everything earlier | 1/(1 − max warp gradient) |

The Lipschitz column matters: `sdf-grid.ts` skips whole 8³ blocks using a Lipschitz bound. Inflate and warps stretch distances, so each stroke must raise the bound it hands to `sampleGrid`, or the grid can cull real surface (a hole, not an error). The compiler sums the bounds; a test fails if a stroke's declared bound is exceeded at sample points. Size: **M** (crease/clay/inflate), **M** more for pinch/flatten.

### 2. Draw-skin: `skin()` as a capsule chain with two radii

```ts
interface SkinNode { readonly at: Vec3; readonly r: number }
function skin(o: {
  nodes: readonly SkinNode[]; edges: readonly (readonly [number, number])[];
  blend?: number;            // branch smoothing: smooth-min radius at joints (metres)
  color?: Vec3; op?: 'add' | 'subtract';
}): SculptGroup;             // pure helper: returns edits, no new evaluator
```

Needs one new shape: `roundCone` (a capsule with radius `r1` at `at`, `r2` at `to`; Quílez's exact round-cone distance). `blend` *is* Blender's branch smoothing, without the shrink: smooth-min adds material at joints instead of relaxing it away. Tails, horns, tentacles, roots, limbs. The same node graph becomes the bone list for glTF skins later ([gltf-capabilities](../architecture/gltf-capabilities.md#skins-how-ts23d-will-rig-without-auto-rigging)). Size: **S**.

### 3. Revolve: lathe as an SDF shape

`{ shape: 'revolve', profile: Vec2[], at, rotate? }`: the 2D polygon distance evaluated at `(√(x²+y²), z)`. Vases, helmets, pommels, mushroom caps that must blend into organic edits (the polygon `lathe` cannot smooth-union). Size: **S–M**.

### 4. Cage deform (FFD): `ffd()`

Named `ffd` because `lattice` is taken by the truss.

```ts
interface Ffd {
  readonly box: readonly [Vec3, Vec3];          // the undeformed cage
  readonly divisions: readonly [number, number, number];  // control points per axis, 2..6
  readonly move: ReadonlyArray<{ readonly index: readonly [number, number, number]; readonly by: Vec3 }>;
}
function ffd(mesh: Mesh, cage: Ffd): Mesh;      // passes tier: Bernstein FFD on vertices
```

Apply it **after** meshing, to vertices (Sederberg–Parry forward map), then recompute normals. Works on any mesh (sculpt, loft, lathe, imported), keeps UVs and colours, is exact and cheap. Inverting FFD to warp an SDF query point needs Newton iteration per sample and breaks the Lipschitz cull, so field-space FFD is not proposed. Size: **S–M**. Use: squash a whole bust into a chibi, lean a tower, bulge a barrel.

### 5. Bend, twist, taper on groups

```ts
interface SculptGroup { /* … */ readonly warp?: { twist?: number /* °/m about local Z */;
  bend?: number /* °/m */; taper?: number /* scale/m */; pivot?: Vec3; axis?: Vec3 } }
```

Domain warps on the query point before the group's edits, like Quílez's twist/bend operators; each reports its Lipschitz factor (same rule as strokes). Horns that curl, banners, bent pipes in an organic piece. Size: **S**.

### 6. Quick pose: a group about a pivot

```ts
interface SculptGroup { /* … */ readonly pose?: { readonly pivot: Vec3; readonly rotate: Vec3 } }
```

Rotate a whole group (an arm, the jaw, a tail) about a joint before folding. Sculptors pose to check silhouette; here it also prepares rigging: the posed group *is* the joint. Size: **S**.

### 7. Forms as an LOD and review axis

```ts
interface SculptShapeEdit { /* … */ readonly form?: 'primary' | 'secondary' | 'tertiary' }
sculpt({ edits, resolution, forms: ctx.pick([['primary','secondary','tertiary'], ['primary','secondary'], ['primary']]) })
```

Tertiary forms below the cell size cost triangles and alias anyway; dropping them by LOD makes LOD2 cleaner *and* faster to sample. `t3d review` can render a "primary only" view: a stylised character that reads from that view reads at a distance (a classic sculpting check). Size: **S**.

### 8. Reference overlays: front/side images in the contact sheet

```
t3d shot recipes/goblin_head/goblin_head.ts --ref front=refs/front.png --ref side=refs/side.png
```

The contact sheet is already orthographic with a metre grid (`src/render/sheet.ts`), so an aligned overlay of a front/side turnaround (AI-generated or drawn) is a blend into the matching tile, plus a silhouette IoU number per view. This is the orthographic cousin of the planned `photoMatch` (`src/render/photo-match.ts`, throws `T3D_NOT_IMPLEMENTED`). Images are inputs only; nothing ships them. Size: **M**.

### 9. Adaptive resolution (the Dyntopo analogue)

Uniform grids spend cells on flat cranium as on lips. Options: an octree of cells refined where `|d| < h` and the edit tree is dense, meshed by dual contouring (Ju et al., SIGGRAPH 2002) to keep sharp features; or a per-edit `detail` hint that refines only inside that edit's bounds. Deterministic if refinement order is fixed. Size: **L**; only worth it once a recipe hits `MAX_POINTS` (`sdf-grid.ts`) or the 1 s budget.

## What not to build

| Idea | Why not |
|---|---|
| Interactive mesh brushes on triangle meshes | Stroke-by-stroke mesh mutation is what remesh/Dyntopo exist to patch; it is not text an agent can diff. The edit list is the sculpt |
| Retopology to quads | glTF engines draw triangles; edge flow matters for subdivision and hand-skinning, neither of which ts23d does. Skin weights come from blend weights instead |
| Realistic anatomy as a goal | Stylised readable forms are the fit ([07](07-what-fits.md)); realism goes through `importGlb` / `/neural` |

## Next steps for ts23d (prioritised)

1. **`roundCone` shape + `skin()` helper** (draw-skin). S. Unlocks tails, horns, limbs, roots; feeds the `creature` kind (M4).
2. **`form` tags + `forms` LOD filter** on sculpt edits, and a primary-only review view. S.
3. **Group `pose` and `warp` (twist/bend/taper)** with declared Lipschitz factors. S.
4. **`ffd()` cage deform pass** on any mesh (Bernstein, vertices). S–M.
5. **Strokes: `crease`, `clay`, `inflate`** along a path with a radius taper, Lipschitz-aware culling and a test that catches an under-declared bound. M.
6. **`--ref front=… side=…` overlays + per-view silhouette IoU** in `t3d shot`. M.
7. **`revolve` SDF shape.** S–M.
8. **`pinch` / `flatten` strokes.** M.
9. **Adaptive (octree / dual contouring) meshing**, only when a recipe needs it. L.

## Sources

- Blender Manual 5.2 LTS: [Remesh](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html) · [Dyntopo](https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/tool_settings/dyntopo.html) · [Skin](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/skin.html) · [Lattice](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/lattice.html)
- Maxon ZBrush docs: [Base mesh creation (DynaMesh, ZRemesher, ZSpheres)](https://help.maxon.net/zbr/en-us/Content/html/features/main-features/base-mesh-creation/base-mesh-creation.html)
- SpeedSculpt: [Superhive product page](https://superhivemarket.com/products/speedsculpt), [Blender Artists thread](https://blenderartists.org/t/speedsculpt-addon/673722)
- T. Sederberg, S. Parry, "Free-form deformation of solid geometric models", SIGGRAPH 1986, [archive](https://history.siggraph.org/?p=116034)
- A. Evans, "Learning from failure" (Dreams SDF sculpting), SIGGRAPH 2015, [slides](https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf)
- I. Quílez, distance functions and domain operators, iquilezles.org/articles/distfunctions (page unreachable when checked 2026-11-07; formulas as widely reproduced)
- T. Ju et al., "Dual Contouring of Hermite Data", SIGGRAPH 2002
- Forms order: [Polycount discussion](https://polycount.com/discussion/comment/2555887) (practitioner convention, not a standard)
