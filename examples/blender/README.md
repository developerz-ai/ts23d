# Blender tool tasks (`t3d-blender/1`)

Python scripts that ts23d runs inside Blender for the `cloth`, `rig` (Rigify), `fracture` and `groom`
tool tasks, plus `vdm_extract` for `scripts/vdm-from-blender.ts`. The library never imports them; it
spawns them (`blenderAdapter` in `src/neural/blender-adapter.ts`) or the reference server loads
them (`examples/neural-server/plugins/blender_tasks.py`). Not sculpt brushes: headless brush
strokes need a viewport; ts23d's SDF strokes and VDM stamps are its brushes.

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
| Blender app | `blender -b --factory-startup -noaudio -t 1 --python-exit-code 3 --python ts23d_job.py -- job.json` | Blender 4.5 or 5.2 LTS |
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

## Files

- `ts23d_job.py`: dispatcher (reads job.json, runs `tasks/<task>.py`, writes report.json)
- `tasks/common.py`: scene reset, GLB import/export, joins, evaluated copies
- `tasks/cloth.py`, `tasks/rig.py`, `tasks/fracture.py`, `tasks/groom.py`, `tasks/vdm_extract.py`
