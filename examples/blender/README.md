# Blender tool tasks (`t3d-blender/1`)

Python scripts that ts23d runs inside Blender for the `cloth`, `rig` (Rigify), `fracture`, `groom`
and `blender` (step program) tool tasks, plus `vdm_extract` for `scripts/vdm-from-blender.ts`. The
library never imports them; it spawns them (`blenderAdapter` in `src/neural/blender-adapter.ts`) or
the reference server loads them (`examples/neural-server/plugins/blender_tasks.py`). Everything runs
with `-b`: modifiers, remesh, bake, bone heat, and brushes too, through the `stroke` op (numpy over
the mesh, because `bpy.ops.sculpt.*` needs a viewport and its result depends on the thread count).
`t3d blender session` keeps one Blender open for chained work.

**These scripts are not in the npm package** (`!examples/blender` in `package.json`). From an
installed ts23d, clone the repository and pass `--scripts <clone>/examples/blender` or set
`T3D_BLENDER_SCRIPTS` (the `t3d blender` commands), or `scriptsDir` (`blenderAdapter()`).

## Licence: GPL

These scripts call Blender's Python API (`bpy`), so they are published under **GPL-2.0-or-later**,
Blender's licence ([blender.org/about/license](https://www.blender.org/about/license/)): every file
carries `SPDX-License-Identifier: GPL-2.0-or-later`. The rest of ts23d stays MIT; nothing under
`src/` imports these files. What Blender makes is yours ("What you create with Blender is your sole
property"), so outputs are recorded with licence `own`.

## Three ways to run

| Way | Command the adapter spawns | Set up |
|---|---|---|
| bpy module (primary) | `python -I ts23d_job.py -- job.json` | `uv venv --python 3.13 && uv pip install bpy==5.2.4` (bpy 5.2 LTS wheels are cp313; 4.5 LTS are cp311) |
| Blender app | `blender -b --factory-startup -noaudio -t 1 --python-exit-code 3 --python ts23d_job.py -- job.json` | Blender 4.5 LTS, 5.2 LTS or 5.3 (`BLENDER_LINES`; the step ops were run on 5.3.0 only) |
| Server plug-in | in-process `import bpy`, or either of the above (`python` / `blender` in the profile) | the server's profile |

`job.json` = `{ contract: 't3d-blender/1', task, request, inputs: { <sha256>: <file> } }`; the
script writes outputs into the job directory and `report.json` last (`{ ok, blender, outputs:
[{ file, mime }], stats }` or `{ ok: false, error, trace }`, then exit 3).

## Deterministic settings

Same inputs + same Blender build + same script bytes = same output bytes (checked: two runs of each
task on bpy 5.2.4 LTS gave identical sha256). The cache key holds Blender's version and the scripts'
sha256, so an upgrade is a cache miss, never a silent change.

| Task | Settings |
|---|---|
| all | factory settings, empty scene, `threads_mode = FIXED`, 1 thread, 24 fps, frames stepped one by one from 1 |
| `cloth` | fixed `frames` / `substeps` (quality), mass 0.3, tension/compression 15, shear 5, bending 0.5, no self-collision, collision distance 4 mm, body thickness 4 mm; pins = vertices with z ≥ `pinAboveZ` |
| `rig` | Rigify human meta-rig scaled to the mesh height, bones snapped by name (`ALIASES` in `tasks/rig.py`: armature bones or ts23d pivot nodes), a straight elbow/knee nudged 3 % so the IK pole exists, automatic weights, DEF- bones exported |
| `fracture` | seeds from `random.Random(seed)` in the padded bounds, cells by bisecting planes (empty cells dropped), Bullet with 10 substeps / 20 iterations when `settleFrames` > 0 |
| `groom` | children from `numpy.random.default_rng(seed)` (PCG64), poly curves (no Catmull-Rom resolution), each node group's `Seed` from the op, k-means locks seeded at index 0 and sorted by root, one depsgraph evaluation |

## `groom`: hair curves → cards

ts23d owns the scalp, hairline, partings and flow: `scalpGuides` (src/kinds/groom-guides.ts) traces
guides with the card style's comb, `applyGroomOps` shapes them, and the job sends the root surface
GLB + `t3d-groom/1` JSON (guides in the ts23d frame, strand ops with a per-guide `mask`, card
width/fold). `tasks/groom.py` grows `children` per guide (roots scattered round the guide root,
snapped to the surface, 2 mm deep; shape = inverse-distance blend of the 3 nearest guides), runs
the strand ops as Blender's bundled hair node groups, pushes strands 1.5 mm clear of the head,
groups the children into `cards` locks and turns each lock's mean strand into a card with Geometry
Nodes (Set Curve Normal *Free* to the lock's width axis → Curve to Mesh, 3-point V profile scaled by
the lock's spread; UV.u across, UV.v root → tip). Output 0: cards GLB (`groom_hair`); output 1:
stats JSON. `groomCards` maps the cards into the `hair_clumps` strand strip and refuses roots off
the scalp, cards inside the head and anything over `maxTriangles`.

The node groups come from `datafiles/assets/nodes/procedural_hair_node_assets.blend`, shipped
with Blender (and the `bpy` wheel) under **CC0-1.0** (`datafiles/assets/LICENSE`): appended at run
time, never copied into this repository.

### Groom op → where it runs

Ops are applied in list order, like sculpt edits; `region` (a named zone or a field) becomes a
per-guide weight, interpolated onto the children like their shape.

| Op (Blender brush) | ts23d (guides, `groom-ops-apply.ts`) | Blender (children, `tasks/groom.py`) |
|---|---|---|
| `comb` (Comb) | segments turned toward the vector by `strength`, lengths kept | inherited from the guides |
| `puff` (Puff) | root segments turned toward the scalp normal, fading to the tip | inherited |
| `cut` (Cut) | resampled to `length`, or cut where it crosses `plane` (root beyond it: guide dropped) | `length` again: *Trim Hair Curves* (Replace Length, Mask = mask) |
| `grow` / `shrink` (Grow/Shrink) | segment lengths × factor | inherited |
| `pinch` (Pinch) | k-means locks, tips pulled to the lock mean (s²) | *Clump Hair Curves*, Shape 0.85, Guide Index = lock leader |
| `clump` | k-means locks, whole length pulled (s^0.7) | *Clump Hair Curves*, Shape 0.3, Guide Index = lock leader |
| `curl` | helix about the strand (radius, turns, seeded phase) on the CPU tier only | *Curl Hair Curves* (Radius, Frequency = turns, Guide Index = lock leader) |
| `frizz` | seeded per-point jitter growing to the tip, CPU tier only | *Frizz Hair Curves* (Distance = amount, Preserve Length) |
| `smooth` (Smooth) | Laplacian, root and tip pinned | inherited |
| `density` (Density) | sets children per guide (`childrenFor`) | that many children |
| `slide` (Slide) | whole guide moved in the root's tangent plane, root re-buried | inherited |
| `add` / `delete` (Add/Delete) | guides born between neighbours / removed by region or fraction | inherited (children follow guides) |

## `blender`: a step program on a mesh

The recipe writes an ordered list of steps in TypeScript (`blenderProgram(steps)` in
`src/neural/blender-steps.ts` checks it, fills every default and returns canonical
`t3d-blender-steps/1` JSON); the request names that JSON, the mesh GLB and, when a step binds, a
`t3d-skeleton/1` JSON (`skeletonJson(armature)`), all by sha256. `tasks/blender.py` runs the steps
and writes `output-0.glb` and `output-1.json` (the `t3d-blender-report/1`).

**Frames.** Step coordinates (`transform`, masks, `focus`, `skinBody`, `metaballs`, `symmetrize`
axes) are in the ts23d asset frame: metres, Z up, +X front, +Y left. The mesh GLB and the skeleton
JSON are in the glTF frame (Y up, +Z front, +X left), the same space turned: asset (x, y, z) = glTF
(z, x, y). Blender reads glTF as (x, −z, y), so asset (x, y, z) is Blender (y, −x, z).

| op | Fields (defaults) | What runs |
|---|---|---|
| `transform` | `matrix` (16, row-major, asset frame) | `mesh.transform` on the mesh and its bake sources |
| `clean` | `weld` (1e-5 m), `minShell` (0.002 of the faces), `fillHoles` (64 edges), `manifold` (true) | bmesh: merge by distance, drop small shells, dissolve degenerate, drop loose, fill holes, consistent normals |
| `symmetrize` | `axis` ('y'), `side` ('+': the half that is kept) | `mesh.symmetrize` |
| `amputate` | `limbs` (each a list of capsules `{ head, tail, r }`, asset frame) | Deletes the faces inside the limbs' capsules and fills the stumps: the far legs of a profile model, before `symmetrize` mirrors the good half over them |
| `unweb` | `limbs` (each a list of capsules `{ head, tail, r }`, asset frame), `gap` (0.02 m) | Cuts geometry bridging two limbs that are separate in the animal (a tail fused to the hocks): a vertex belongs to the limb whose capsule it is nearest to (within 1.5 radii of its axis), faces holding two limbs are deleted, each side capped on its own, the limbs pushed `gap` apart. Before `retopo` (keep its voxel under `gap` / 1.5). Fails if an edge still joins two limbs |
| `repose` | `to` (every bone `{ name, head, tail }`, asset frame), `mirror` ('+' / '-'), `mirrorLimit` (0.05 m) | After `bind` and the bake: poses the armature from the rest it was bound in to `to`, keeps the deformed mesh as the new rest shape and the pose as the armature's rest, same weights. With `mirror`: then replaces the other half by the kept one (weights moved to the twin bones) only if the reposed mesh's mirror image lies within `mirrorLimit` of it over head, neck and spine |
| `voxelRemesh` | `voxel` (m), `adaptivity` (0) | Remesh modifier, VOXEL; refused over 1.5k voxels per side |
| `smooth` | `iterations`, `factor`, `kind` ('laplacian' \| 'corrective') | Laplacian Smooth / Corrective Smooth (only-smooth) modifier |
| `displace` | `strength` (m), `scale` (m), `kind` ('noise' \| 'voronoi' \| 'musgrave'), `seed` (0), `mask?` | Displace modifier along normals, procedural texture, texture space moved by the seed |
| `inflate` | `distance` (m), `mask?` | vertices along their normals |
| `stroke` | `brush`, `path` (points on the surface), `radius` (m, one or per point), `strength` (m; not for `grab`), `spacing` (0.2 × radius), `mask?`, `symmetry?` ('x' \| 'y' \| 'z'), `stamp?` (`vdm`: `{ size, grid }`) | A sculpt brush along a path, see below. Before `uv` only |
| `skinBody` | `bones: [{ head, tail, r0, r1 }]`, `subdiv` (2) | Skin + Subdivision modifiers over an edge skeleton (first step, no input mesh) |
| `metaballs` | `balls: [{ at, r, stiffness (2), negative (false) }]`, `resolution` (m) | metaball union → mesh, threshold 0.6: the surface sits inside `r` (first step, no input mesh) |
| `retopo` | `triangles`, `strategy` ('shell' \| 'decimate'), `reduce` ('decimate' \| 'quadriflow'), `voxel?`, `close?` (voxels; absent: 0, 1, 2, 4 tried), `skin?` (voxels; absent: 0, then 0.75 when thin parts vanish), `smooth` (0), `preserveSymmetry` (false), `focus?` | see below |
| `uv` | `kind` ('smart' \| 'unwrap'), `angle` (1.45 rad), `margin` (0.003), `smooth` (30) | Smart UV Project on a copy smoothed `smooth` times (same topology, UVs copied back); 'unwrap' turns those islands into seams and unwraps with minimum stretch; `average_islands_scale`, `pack_islands` (concave) |
| `bake` | `size` (2048), `maps` (['albedo', 'normal']; also 'ao', 'roughness'), `cage?` (2 % of the bbox diagonal), `maxRay?` (2 × cage), `samples` (1), `aoSamples` (32), `margin` (16 px), `cageFit?` | Cycles selected-to-active, margin ADJACENT_FACES; see below |
| `joint` | `bone`, `head?`, `tail?` (asset frame; before `bind`) | the bone in the skeleton JSON (or the source rig's edit bone) is moved |
| `bind` | `from` ('skeleton' \| 'source'), `maxInfluences` (4), `proxyVoxel?` (1.2 % of the diagonal) | 'skeleton': armature from the skeleton JSON, automatic weights, proxy fallback. 'source': the input GLB's own armature, weights by Data Transfer from its skinned mesh, clips kept. Then limit / clean (< 0.01) / normalise |
| `weights` | `kind` ('assign' \| 'smooth' \| 'scale'), `bone`, `mask`, `value` (1), `iterations` (2) (after `bind`) | one bone's vertex group edited inside the mask; the other bones rescaled so every vertex sums to 1; limited again |
| `isolate` | `bones` (a free chain: the tail past the croup), `from` (its tip), `point` + `normal` (the cut across its root, normal along the chain), `r` (reach round the bones, m), `feather` (0.03 m), `maxShare` (0.25) (after `bind`) | The chain's skin = what connects to the vertex nearest `from`, within `r` of the bones and beyond the cut. There only `bones` keep weight (others fade out over `feather`; a vertex left with none takes its nearest chain bone); on the rest of the mesh `bones` lose theirs and those vertices are refilled from the body round them. Fails when the flood reaches over `maxShare` of the mesh (the chain is fused: `unweb` first) |
| `script` | `python` (source text), `why` (required) | `exec` with `obj`, `source`, `arm`, `bpy`, `bmesh`, `mathutils`, `np`; must leave a mesh in `obj`; report keeps sha256, `why`, stdout tail |
| `review` | `views` (['clay', 'wire']; also 'weights', 'poses', 'turnaround'), `size` (1024), `poses?` ([{ bone, axis, degrees }]) | Workbench sheets `review-<step>-<view>.png`, returned as PNG outputs after the report; changes nothing |
| `lods` | `triangles: [lod1, lod2?]`, `focus?` | Decimate copies that keep UVs, material, weights and the Armature modifier; gated |
| `export` | `albedoSize?`, `normalSize?`, `ormSize?` (downscale) | one GLB: nodes `lod0`, `lod1`, `lod2`, PNG images, a skin when bound, every clip when the rig came with the source, no tangents; read back and refused when a material is not opaque or the base colour is not an RGB PNG |

Masks: `{ kind: 'z', min, max, feather? }` or `{ kind: 'sphere', at, r, feather? }`; `weights` also takes `{ kind: 'box', min, max }` and `{ kind: 'plane', point, normal }` (the half-space behind the plane). Focus:
`{ at, r, weight }` balls that keep about `weight` times the vertex density (1..16).

Order rules (checked in TypeScript, `T3D_RECIPE_INVALID` with the step index): the list ends with
`export`; `skinBody` / `metaballs` only as the first step; `retopo` before `uv`; `uv` before
`bake`; `stroke` before `uv`, `bake`, `bind` and `lods`; after `bind` only `repose`, `uv`, `bake`, `weights`, `isolate`, `script`, `review`, `lods`, `export`; after
`lods` only `review` and `export`; `joint` before `bind`, `weights` and `isolate` after it; a bind from 'source'
rules out `transform`; one each of `retopo`, `uv`, `bake`, `bind`, `lods`. Any subset is a program (no `bind`, no `bake`…).

**Bake sources.** The mesh as it was before the first step that replaces UVs or materials
(`voxelRemesh`, `retopo`, `uv`) is the *colour source*; the mesh just before `retopo` is the
*shape source*. Albedo, roughness and metallic are EMIT bakes of one Principled channel of the
colour source (a DIFFUSE bake of a generator's metallic material is black): from the texture or
node linked to it, else the mesh's colour attribute, else the socket's value, else a default grey
(reported as `albedoFrom`: `texture` / `vertex-colour` / `flat` / `nodes` / `mixed`). Several
materials are handled one by one. Normal (tangent space) and AO come from the shape source with its
own materials. The ORM map packs R = AO, G = roughness, B = metallic (unbaked channels 1, 0.8, 0).
Two 1-sample probe bakes give `hitRate` (texels the source covered / texels the UV islands cover);
a bake that hits nothing, or an all-black albedo, fails the job.

**`bake.cageFit`.** A flat cage lets a ray start past the next surface, so two fingers closer than
the cage bake each other. With `cageFit: true` rays start on a copy of the shell whose vertices sit
min(`cage`, 0.45 × the gap to the next wall outward) off it, the limit spread over two rings of
neighbours; rays then reach the shell itself unless `maxRay` is given. Two tubes 6 mm apart with a
20 mm cage: 10.0 % of the faces took the other tube's colour flat, 0 % fitted (self-test, offsets
2.7..20 mm). Absent means the flat cage, so existing programs and their cache keys do not change.

**`stroke`: brushes without a viewport (`steps/stroke.py`).** Dabs every `spacing` × radius along
`path`. A dab reaches the vertices within `radius` of its nearest vertex **along the mesh's edges**,
falloff u²(3 − 2u), times `mask`; coincident vertices (a glTF splits them along UV seams and hard
edges) count as one point, so a stroke crosses seams without tearing them. Every move is computed
from the positions at the start of the stroke and divided by the stroke's highest coverage, so the
path moves about `strength` however dense the dabs are, the same bytes at any thread count (checked
over all nine brushes at `-t 1` and `-t 4`). On the 906k-triangle wolf source a 25-dab stroke took
1.5 s and a 20-dab crease 1.3 s, 5 of 15.9k touched triangles flipped (inside the limit).

| brush | What it does; `strength` is |
|---|---|
| `draw` | moves along the dab's area normal; metres, negative digs in |
| `inflate` | moves along each vertex's own normal; metres, negative shrinks |
| `clay` | fills up to a plane `strength` above the area, only what is below it |
| `flatten` | moves to the area's plane; the most any vertex moves |
| `pinch` | pulls towards the path, never past it; the most any vertex moves |
| `crease` | cuts in by `strength` and pinches by half of it |
| `smooth` | four passes of neighbour averaging; the most any vertex moves |
| `grab` | moves the region round `path[0]` by `path[1] - path[0]`; no `strength` |
| `vdm` | a vector displacement stamp at each dab (`{ size, grid }`, a `VdmStamp` as plain numbers: right, up, normal per texel); the tallest point of the stamp, metres |

A `stroke` before `retopo` edits the source, so the normal and colour bakes carry it; one after
`retopo` edits the shell and changes the silhouette only. After `uv` it is refused: it would stretch
the islands, and a bake or a bind already made from the old shape would no longer match. Gates: a
path point off the surface (over its radius from the nearest vertex), a radius under the edge length
(under 4 vertices per dab), a stroke that moved nothing, more than max(4, 0.1 %) of the touched
triangles turned over. A mesh with long triangles gets uneven falloff (graph distance follows
edges): `clean`, `voxelRemesh` or `retopo` it first.

**Retopo: never collapse the raw generator surface.** An image-to-3D mesh is noisy fur over
internal layers. Collapsing it directly ('decimate') keeps that junk: on the Pixal3D wolf the UV map
came out as 1.29k islands (still 1.08k with 600 smoothing passes: the islands come from the
topology) and Blender's collapse, which has no seam lock, squeezed 10 % of LOD2's triangles to
zero UV area: shards. The default 'shell' voxel-remeshes first (voxel = 0.6 × sqrt(area /
triangles), clamped to diagonal / 1000 .. / 60, or `voxel`), reduces that closed surface, and
lets the normal bake bring the fur back from the full-resolution source: 226 islands, no open
edge on any LOD. `reduce: 'quadriflow'` runs QuadriFlow on the shell (after the merge it needs),
shrink-wraps the result back onto the shell and falls back to the collapse when it finds no
solution (reported). Shrink-wrap targets the shell, not the raw source: nearest-surface on the raw
source snaps to internal layers.

**The shell is measured, not trusted (`steps/shell.py`).** A Pixal3D mesh is a thin crust: two
walls about 1.5 mm apart (signed volume 0.0016 m³ on a wolf whose body is 0.042 m³) with tunnels
through it. A voxel remesh finer than a tunnel floods the inside and returns confetti: 4.03k closed
specks at a 5.4 mm voxel, one solid at 12 mm. Every later number then lies (0 open edges, a 95 %
bake hit rate) and the job "succeeds". So the plain remesh is tried first and measured; when it is
not one filled surface, the shell is rebuilt by a morphological closing in SDF grids (Geometry
Nodes *Mesh to SDF Grid* → *Grid to Mesh*, Blender ≥ 5.0): dilate by `close` voxels, voxel-fill,
erode by `close − skin` voxels; `close` 0, 1, 2, 4 are tried in order unless the step names one. A
candidate passes when its largest component holds ≥ 90 % of the faces, its volume is ≥ 70 % of a
coarse closed reference (voxel = diagonal / 110, closed by 2), no bbox side moved more than
2 + skin voxels and ≤ 1 % of the source surface (40k area-weighted samples) lies more than
1.5 + skin voxels outside it. An erosion turns a sheet thinner than a voxel into lace (the
dragon's wing membranes: 37 tunnels, 6.2 % of the surface lost); then the closing is redone with
`skin` 0.75, which leaves a zero-thickness sheet 1.5 voxels thick. No radius passing fails the
step with the measures and where the loss is (asset-frame side and centre).

**Thin parts collapse last.** In `retopo` and `lods`, vertices whose opposite wall is nearer than
1.2 % of the bbox diagonal (membranes, ears, horns, fingers, tail tips) get 3 × the vertex
density (the same weighted Decimate `focus` uses), so a collapse does not pinch through a sheet.

**LOD gate.** Each LOD is compared with LOD0 and fails the job naming the measure: more open
edges; a face over 3 % of the surface; a bbox side moved more than 1 % (lod1) / 2 % (lod2) of
LOD0's diagonal, with the side named (`+z (top)`, `-x (back)`…); more than 1 % of LOD0's surface
farther than 1 % / 1.5 % of the diagonal from the LOD, with where; a new tunnel (genus up);
over 8 % UV-degenerate triangles. Measured drift on the four models below: ≤ 0.6 mm at LOD1 and
≤ 1.9 mm at LOD2 on 1.1–1.4 m diagonals (0.13 %), no surface lost, no new tunnel, so the limits
sit ten times above a sound collapse and far under a lost extremity (the dragon's horns are 5 %
of its diagonal). The old single 2 % limit was not the dragon's problem: its LOD2 "moved
0.0276 m" because Decimate was deleting confetti. Not implemented: a per-LOD atlas; a collapse
across a UV seam can still smear a few texels on LOD1/2.

**Other gates.** After every step: a finite mesh with faces whose diagonal did not jump 20 ×
(`transform` excepted). `uv`: at most max(64, triangles / 20) islands and 5 % UV-degenerate
triangles (good shells: 145–523 islands; confetti: 5.3k–8.95k). `bake`: the albedo is baked with
alpha, texels inside the islands that got no colour take the nearest one, their share is reported
(`albedoUnfilled`) and over 2 % fails; a source material with a linked Alpha is mixed with a
transparent shader so rays read the surface beneath. `export`: the written GLB is read back and
refused when a material is not OPAQUE or the base colour is not an RGB PNG; with a source rig, when
a clip is missing or its length changed. `script`: a mesh left in `obj`, faces, weights on every
vertex when bound, topology unchanged after a bake.

**Bind.** Bone heat returns `FINISHED` even when it weights nothing, so the result is measured: over
1 % unweighted vertices sends the bind to a voxel proxy (weights by bone heat on the proxy, Data
Transfer `POLYINTERP_NEAREST` back, two smoothing passes); a few strays copy the nearest weighted
vertex; no weights on the proxy either fails the job. The report says which (`bone-heat` /
`proxy-transfer`). The skin's joints carry the bone names.

**Bone heat reads nearness, not anatomy (`isolate`).** A tail that hangs against the hocks is as
near to the hind-leg bones as to its own, and the rump is near the tail's: on the profile wolf the
tail's 627 vertices came out of bone heat with 11 % of their weight on other bones and 271
vertices of the rump and thighs with weight on the tail's (the tail tip walked with the legs, and
the tail dragged the rump). `isolate` separates them by connection, not distance: a flood fill
from the tail tip over the vertices within `r` of the tail's bones, stopped at the cut plane (so
it needs the `unweb` gap between tail and hocks to have survived `retopo`); the body's vertices
that lose the tail's weight are filled in from their neighbours (60 relaxation passes), not
renormalised onto whichever bone was second.

**A source that arrives rigged (`bind` with `from: 'source'`, `steps/rig_source.py`).** When the
input GLB has a skin (a Meshy humanoid), `load` keeps its armature and actions, drops the bone
shape meshes the importer adds, sets the scene frame rate to the clips' own (read from the file's
samplers; Meshy: 30) and snaps keys onto whole frames, so the export resamples nothing. The bind
transfers the source's weights onto the shell (Data Transfer, nearest face interpolated), limits
and normalises them and parents the shell to the source armature; LODs inherit them; `export`
writes one skin and every clip under its own name. `transform` is refused on such a source (it
would leave the armature behind): scale and turn at import in ts23d.

**The finishing loop.** `review` renders what an artist looks at (Workbench, orthographic, about
2 × `size` px wide, tile names in `report.review[].tiles`): `clay` and `wire` from four sides,
`weights` one tile per bone (blue 0 → red 1, grey none), `poses` (rest + each pose alone),
`turnaround` (base colour, studio light). `t3d blender review <recipe.ts> --out <dir>` (the
module exports `BLENDER_REVIEW = { mesh, steps, skeleton? }`) or `--mesh <glb> --program <json>
[--skeleton <json>]` adds that step before `export`, writes the PNGs, `report.json` and
`review.md`; then the agent edits the recipe: `joint` (a bone end, before `bind`), `weights`
(assign / scale / smooth one bone in a mask, after `bind`), `script` (bpy source with a `why`).
Workbench renders with `-b` given any Vulkan or OpenGL driver; `review` reports which
(`renderer`). Without a GPU, Mesa's lavapipe (Vulkan on the CPU; `apt install mesa-vulkan-drivers`)
is found by Blender unaided; `--software-gpu` or `T3D_BLENDER_SOFTWARE_GPU=1` forces it, which keeps
a review off a GPU another job is using. Checked on 5.3 with the GPU device nodes hidden: with
lavapipe a review renders; with no Vulkan driver at all Blender **crashes** (SIGSEGV) at the first
render, and ts23d's error then names the driver.

**Determinism.** `-t 1` unless `request.params.threads` says otherwise (0 = every core; voxel
remesh bytes change with the thread count). The bake device (OptiX / CUDA / HIP / Metal / oneAPI,
else CPU) is in the report: GPU and CPU bakes differ. The output is a cached input (ADR 014), not
a build step; step seconds make the report differ run to run.

### Smoke: the Pixal3D wolf (2026-11-16, Blender 5.3.0, RTX 3090 OptiX, `-t 1`)

Source 955k triangles, one 2-texture material, 38 MB. Program: `transform` (head to +X, feet on
z = 0, ×1.6), `clean`, `retopo` 30k with focus (head ×3, paws ×2), `uv`, `bake` 2048² albedo +
normal + AO, `bind` to an 8-bone test skeleton, `lods` [10,000, 2.5k], `export` (normal and ORM at
1024²), through `blenderAdapter()`.

| | direct collapse (`strategy: 'decimate'`) | shell (default) |
|---|---|---|
| Wall time | 83 s | 52 s |
| Triangles LOD0 / 1 / 2 | 30k / 10k / 2.55k | 30k / 9.99k / 2.49k |
| UV islands · coverage | 1.29k · 0.57 | 226 · 0.55 |
| Bake hit rate | 0.9999 | 0.9998 |
| Open edges LOD0 / 1 / 2 | not measured | 0 / 0 / 0 |
| UV-degenerate triangles LOD1 / LOD2 | 1.7 % / 10.2 % (measured on the exported LOD0, outside the job) | 0.1 % / 0.3 % |
| Cycles render | LOD1 torn on the forehead, LOD2 shards | three clean wolves |
| Bind | bone heat | bone heat (0.04 % strays filled) |
| GLB | 12.2 MB (ORM at 2048²) | 8.6 MB (ORM at 1024²) |

Shell run by step: clean 11.0 s (207k vertices welded, 17 of 18 shells dropped), retopo 9.1 s
(voxel 9.2 mm → 114k-triangle shell → 30k), uv 8.1 s, bake 13.9 s, bind 0.7 s, lods 0.5 s,
export 0.8 s. The direct-collapse run predates the LOD gate; its 10.2 % is over the gate's 8 %, so
it should now fail at `lods` (not re-run). A third run with an explicit 4 mm `voxelRemesh` before a direct collapse sent the
bind to the proxy (bone heat left every vertex unweighted): the fallback works on real data. Posing
neck and two legs moved 14.5k of 17.7k vertices by up to 0.48 m.

### Four Pixal3D models (2026-11-16, Blender 5.3.0, RTX 3090 OptiX, `-t 1`)

Raw ≈ 0.9 M-triangle GLBs, about 1 unit tall, program `clean → retopo N → uv → bake 2048²
(albedo, normal, AO) → lods → export` through `blenderAdapter()`. Before: only the bear passed
(the wolf "passed" as confetti: 6.77k islands, 30 % UV-degenerate triangles at LOD0, 10.1k open
edges in the exported file). Times were taken while another model job held the GPU and 31 GB of
RAM; the wolf program ran alone in 25 s before the thin-part and tunnel measures were added (not
re-timed alone since).

| | wolf | dragon | ranger (clothed human) | bear |
|---|---|---|---|---|
| Source triangles | 908k | 919k | 920k | 878k |
| Triangles LOD0 / 1 / 2 | 30k / 10k / 6k | 45k / 15k / 8k | 40k / 13k / 7k | 30k / 10k / 6k |
| Voxel | 5.4 mm | 3.9 mm | 4.0 mm | 7.3 mm |
| Shell tries: close, skin → lost share, tunnels | 0 → 97 %, 14 · 1 → 0.02 %, 2 | 0 → 83 %, 56 · 1 → 6.2 %, 37 · 1 + 0.75 → 0 %, 1 | 0 → 43 %, 72 · 1 → 0.24 %, 2 | 0 → 0.01 %, 0 |
| Shell volume / reference (m³) | 0.0418 / 0.0439 | 0.0152 / 0.0135 | 0.0136 / 0.0148 | 0.1398 / 0.1453 |
| UV islands (before the fix) | 166 (6.77k) | 523 (8.95k) | 438 (5.3k) | 145 (138) |
| Bake hit rate · albedo unfilled | 0.997 · 0 | 0.995 · 0 | 0.994 · 0 | 0.998 · 0 |
| Bbox drift LOD1 / LOD2 | 0.35 / 0.60 mm | 0.61 / 0.51 mm | 0.28 / 0.28 mm | 0.59 / 1.87 mm |
| Surface lost · new tunnels, LOD1 / LOD2 | 0 · 0 / 0 · 0 | 0 · 0 / 0 · 0 | 0 · 0 / 0 · 0 | 0 · 0 / 0 · 0 |
| UV-degenerate LOD1 / LOD2 | 0.05 % / 0.07 % | 0.15 % / 0.19 % | 0.31 % / 0.24 % | 0.09 % / 0.08 % |
| Seconds (under load): total · retopo · bake | 84 · 35 · 31 | 138 · 54 · 29 | 89 · 26 · 27 | 83 · 14 · 41 |

Known blemishes: the ranger's wispy generator hair (loose points) is not kept, the head is a
solid cap in the scalp colour; the dragon's LOD1 shows one small tunnel in a wing membrane that
LOD0 already has (genus 1 on all three).

The rigged Meshy ranger (279k triangles, JPEG base colour, 24 joints, clips Idle 4.0 s,
Casual_Walk 4.1667 s, Run_02 0.7 s at 30 fps) with `bind from 'source'`, 30k / 10k / 4k
triangles: 54 s (bake 31 s), plain shell accepted (lost 0.09 %), 502 islands, hit rate 0.998, no
vertex unweighted after the transfer, ≤ 4 influences; the GLB holds one skin (24 joints), the
three clips at 4.0 / 4.1667 / 0.7 s under their names, and three PNG images.

### `t3d blender session`: one open Blender for chained work

`t3d blender review` starts Blender and redoes load, clean, retopo, UV, bake and bind for one look. A
session keeps them done:

```
t3d blender session start --mesh wolf.glb --skeleton skeleton.json --software-gpu
t3d blender session run build.json     # [{ "op": "clean" }, { "op": "retopo", "triangles": 8000 }, …]
t3d blender session run tweak.json     # [{ "op": "weights", … }, { "op": "review", "views": ["weights"] }]
t3d blender session undo               # one batch back; a failed batch goes back by itself
t3d blender session status
t3d blender session finish --out program.json --normal-size 1024
t3d blender session stop
```

Every command takes `--name <n>` (several sessions at once) and `--json`. `start` also takes
`--idle <minutes>` (30), `--undo <n>` (5 batches kept), `--threads <n>` (1), `--blender <exe>`,
`--scripts <dir>`. `run` takes `--timeout <seconds>` (7200).

- **Same behaviour as a program.** A batch is a list of steps, run by the same `OPS`, `gates.whole`
  and report code as `tasks/blender.py`. TypeScript checks kept steps + batch + `export` with
  `checkBlenderSteps` before Blender sees it, so the order rules hold across batches. `export` is
  refused in a batch (`finish` adds it), as are `skinBody` and `metaballs`.
- **The reply** has one facts entry per step, the batch's seconds, the checkpoint's cost, and the
  absolute path of every `review` sheet (`batch-<n>/review-*.png` in the session directory). On
  failure: the step index, the op's message and fix, and the scene already restored.
- **Checkpoints.** Before each batch that changes anything, an uncompressed `.blend` plus a JSON map
  of the State's objects and images. `restore` reopens it and rebuilds the State; baked images are
  packed so their pixels come back. A batch of only `review` steps takes none. Cheap enough to take
  every time, so no op is special-cased (numbers below).
- **`finish`** writes the kept steps + `export` as canonical `t3d-blender-steps/1` JSON (`review`
  steps are left out: they change nothing). **A committed asset always comes from replaying that
  program with `t3d neural run`, never from session state.**
- **Access.** A Unix socket inside a mode-0700 directory (`~/.cache/t3d/blender-sessions/<name>`, on
  disk because checkpoints are large), no TCP; the peer's uid is checked as well.
- **Staying tidy.** After `--idle` minutes without a request Blender exits and deletes its
  checkpoints, so no forgotten session keeps its RAM. A dead process is detected by the next command:
  stale socket and checkpoints removed, `T3D_NEURAL_FAILED` saying why, and `finish` still works
  because the kept steps live in `kept.json`. `stop` ends the process and deletes the directory, its
  review sheets included: copy what you want first.

Measured (2026-11-18, Blender 5.3.0, one thread, bake on the CPU, review on lavapipe, while another
job held the GPU) on the Pixal3D wolf source (906k triangles), program `clean → stroke → retopo
8k → uv → bake 1024² albedo + normal with cageFit → bind → weights`:

| | |
|---|---|
| Full program as one job (relaunch, load, every step, export) | 40.2 s |
| Session start (load) | 6.1 s |
| First batch, `clean` to `bind` | 32.1 s |
| **Next batch, `weights` + a `review` sheet** | **0.44 s**, then 0.15 s |
| Checkpoint | 0.02–0.15 s, 109–116 MB (0.15 s is the first after the bake: packing the maps) |
| A failed batch, restored | 0.10 s |
| `undo` | 0.04 s |
| Process peak memory | 1.7 GB |

The finished program replayed through the normal `blender` task gave the same triangles and the same
facts as the session for every step (`seconds` aside).

### Self-test (manual; the gate never starts Blender)

```
blender -b --factory-startup -noaudio --python-exit-code 3 \
  --python examples/blender/tasks/steps/test_steps.py -- selftest
```

About a minute on generated blobs: refusals, the full program with every map and three LODs, a
vertex-colour source and a source with no colour at all, a subset without `uv` / `bake`, focus
density, the bone-heat failure → proxy path, metaballs → QuadriFlow, `skinBody` → `symmetrize` →
`transform`; then the gates (`test_gates.py`: a leaky crust that the plain remesh turns into 4.64k
specks, a tilted 1 mm fin, a bake that reaches a third of its source, a cut-out source, a
confetti UV map, the LOD gate's messages) and the finishing ops (`test_finish.py`: `script` and
its refusals, `joint`, `weights`, the five `review` sheets, a rigged source with two clips
carried to three LODs), `stroke` and `bake.cageFit` (`test_stroke.py`: nine brushes on a U-shaped
tube whose legs face each other 3 cm apart, the gates, a stroke through a whole program, two tubes
baked with a flat and a fitted cage), and the session (`test_session.py`: batches, a failed batch and
`undo` restoring vertices and baked pixels, the socket, the idle timeout, a replay of the kept
steps). Set `T3D_SELFTEST_ONLY=case_a,case_b` to run a few; `CUDA_VISIBLE_DEVICES=` keeps the bakes
on the CPU.

## Files

- `ts23d_job.py`: dispatcher (reads job.json, runs `tasks/<task>.py`, writes report.json)
- `tasks/common.py`: scene reset, GLB import/export, joins, evaluated copies
- `tasks/cloth.py`, `tasks/rig.py`, `tasks/fracture.py`, `tasks/groom.py`, `tasks/vdm_extract.py`
- `tasks/session.py` + `tasks/session_checkpoint.py`: the long-lived session loop and its checkpoints
- `tasks/blender.py`: runs a step program; `tasks/steps/`: `state` (shared state, frames), `io` (load, export), `clean`, `remesh`, `retopo`, `build`, `deform`, `stroke` + `stroke_brush` (brushes), `shell` (the solid shell), `gates` (shared measures), `uv`, `bake` + `bake_source` + `bake_cage` + `fill`, `bind`, `rig_source` (a rigged source), `rigfix` (`joint`, `weights`), `script`, `review` + `review_sheet`, `lods`, `unweb`, `test_steps` + `test_gates` + `test_finish` + `test_limbs` + `test_stroke` + `test_session` (self-test)
