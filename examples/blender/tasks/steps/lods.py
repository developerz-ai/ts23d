# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `lods`: decimated copies of the finished shell, named lod1 (and lod2). A copy keeps the
# shell's UV layer and material (so every LOD samples the same baked maps), its vertex groups and
# its Armature modifier; after the collapse a bound copy is limited and normalised again.
# Blender's collapse has no seam lock, so a LOD is only as sound as LOD0's UV map is simple
# (few, large islands: retopo 'shell' + the smoothed projection of `uv`); thin parts (membranes,
# ears, horns) collapse last (retopo.thin_weights). Every copy is gated against LOD0, with the
# limits of its level (LIMITS): no more open edges, no shard face, no bounding-box side moved,
# no part of LOD0's surface left uncovered, no new tunnel pinched through a thin sheet, UVs not
# squeezed to nothing — a LOD that trips fails the job naming the measure and the side.

import numpy as np

from tasks.steps import bind, gates
from tasks.steps import state as st
from tasks.steps.retopo import THIN_SHARE, decimate_to

MAX_FACE_SHARE = 0.03
MAX_UV_DEGENERATE = 0.08
# Per level (lod1, lod2), as shares of LOD0's bbox diagonal: how far a bbox side may move, and
# how far from the LOD a point of LOD0 may lie before it counts as lost (at most MAX_LOST of them).
LIMITS = ({"drift": 0.01, "reach": 0.01}, {"drift": 0.02, "reach": 0.015})
MAX_LOST = 0.01


def health(obj):
    """What the LOD gate compares: open edges, largest face share, bounds, tunnels, UV-degenerate share."""
    me = obj.data
    lo, hi, diag = st.bounds(obj)
    co = st.coords(obj)
    index = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", index)
    p = co[index].reshape(-1, 3, 3)
    area = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1) / 2
    out = {
        "boundaryEdges": st.boundary_edges(obj),
        "maxFaceShare": round(float(area.max() / area.sum()), 4),
        "handles": gates.handles(obj),
        "lo": lo,
        "hi": hi,
        "diag": diag,
    }
    if me.uv_layers.active is not None:
        out["uvDegenerate"] = gates.uv_degenerate(me)
    return out


def gate(name, level, lod, base):
    """Raise when a LOD has holes, shards, a different outline, lost parts or a collapsed UV map."""
    limit = LIMITS[min(level, len(LIMITS) - 1)]
    problems = []
    if lod["boundaryEdges"] > base["boundaryEdges"]:
        problems.append(f"{lod['boundaryEdges']} open edges (lod0 has {base['boundaryEdges']})")
    if lod["maxFaceShare"] > MAX_FACE_SHARE:
        problems.append(f"one face is {lod['maxFaceShare']:.1%} of the surface (limit {MAX_FACE_SHARE:.0%})")
    if lod["bboxDrift"] > limit["drift"] * base["diag"]:
        problems.append(
            f"its bounding box moved {lod['bboxDrift']:.4f} m on {lod['bboxSide']} "
            f"(limit {limit['drift'] * base['diag']:.4f} m: an extremity was eaten)"
        )
    if lod["lost"]["share"] > MAX_LOST:
        problems.append(
            f"{lod['lost']['share']:.1%} of lod0's surface is farther than {lod['lost']['tolerance']:.4f} m "
            f"from it, around {lod['lost'].get('where')} {lod['lost'].get('centre')} (limit {MAX_LOST:.0%}: a thin part was eaten)"
        )
    if lod["handles"] > base["handles"]:
        problems.append(f"{lod['handles'] - base['handles']} new tunnel(s) pinched through a thin part")
    if lod.get("uvDegenerate", 0) > max(MAX_UV_DEGENERATE, 2 * base.get("uvDegenerate", 0)):
        problems.append(f"{lod['uvDegenerate']:.1%} of its triangles have no UV area (limit {MAX_UV_DEGENERATE:.0%})")
    if problems:
        raise ValueError(
            f"{name} is broken: {'; '.join(problems)}. fix: ask more triangles for {name}, add a focus "
            "ball on the part named, or raise retopo skin so thin parts are thicker"
        )


REPORTED = ("boundaryEdges", "maxFaceShare", "uvDegenerate", "handles", "bboxDrift", "bboxSide", "lost")


def run(state, step):
    st.triangulate(state.mesh)
    base = health(state.mesh)
    count = st.triangles(state.mesh)
    out = []
    for i, target in enumerate(step["triangles"]):
        name = f"lod{i + 1}"
        if target >= count:
            raise ValueError(f"{name} asks {target} triangles, lod0 has {count}")
        copy = st.duplicate(state.mesh, name)
        decimate_to(copy, target, focus=step.get("focus"), thin=THIN_SHARE * base["diag"])
        st.triangulate(copy)
        if state.armature is not None:
            bind.limit(copy, state.max_influences)
        facts = health(copy)
        moved, side = gates.drift(facts["lo"], facts["hi"], base["lo"], base["hi"])
        facts["bboxDrift"], facts["bboxSide"] = round(moved, 5), side
        facts["lost"] = gates.lost(state.mesh, copy, LIMITS[min(i, len(LIMITS) - 1)]["reach"] * base["diag"])
        gate(name, i, facts, base)
        state.lods.append(copy)
        out.append({k: facts[k] for k in REPORTED if k in facts})
        out[-1]["triangles"] = st.triangles(copy)
    return {"lods": out, "lod0": {k: base[k] for k in REPORTED if k in base}}
