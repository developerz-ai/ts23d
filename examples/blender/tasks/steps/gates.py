# SPDX-License-Identifier: GPL-2.0-or-later
# Measures the step gates share, each a number a report can carry and a message can name:
# `lost` (how much of a reference surface a reduced mesh no longer covers, and where: thin parts
# such as wing membranes, horns, fingers and tail tips are what a remesh or a collapse eats),
# `drift` (which side of the bounding box moved, in the asset frame) and `whole` (the checks every
# step's result must pass: a mesh with faces, finite coordinates, bounds that did not explode),
# `uv_degenerate` (triangles squeezed to nothing in UV) and `handles` (tunnels through the surface:
# a collapse that pinches through a thin sheet adds one).

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

from tasks.steps import state as st

SAMPLES = 40000
# Blender axis → the asset-frame name of its negative and positive side.
SIDES = (("-y (right)", "+y (left)"), ("+x (front)", "-x (back)"), ("-z (bottom)", "+z (top)"))


def to_asset(p):
    return [round(float(-p[1]), 4), round(float(p[0]), 4), round(float(p[2]), 4)]


def tree_of(obj):
    me = obj.data
    me.calc_loop_triangles()
    tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int32)
    me.loop_triangles.foreach_get("vertices", tris)
    return BVHTree.FromPolygons(st.coords(obj).tolist(), tris.reshape(-1, 3).tolist())


def surface_points(obj, count=SAMPLES):
    """`count` points spread over the surface by area, the same ones on every run."""
    me = obj.data
    me.calc_loop_triangles()
    tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int32)
    me.loop_triangles.foreach_get("vertices", tris)
    p = st.coords(obj)[tris].reshape(-1, 3, 3).astype(np.float64)
    area = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1)
    total = np.cumsum(area)
    i = np.arange(count)
    pick = np.minimum(np.searchsorted(total, (i + 0.5) / count * total[-1]), len(area) - 1)
    u, v = (i * 0.7548776662466927) % 1.0, (i * 0.5698402909980532) % 1.0  # R2 sequence
    flip = u + v > 1
    u, v = np.where(flip, 1 - u, u), np.where(flip, 1 - v, v)
    t = p[pick]
    return t[:, 0] + u[:, None] * (t[:, 1] - t[:, 0]) + v[:, None] * (t[:, 2] - t[:, 0])


def lost(reference, reduced, tolerance):
    """Share of `reference`'s surface (a sample) farther than `tolerance` OUTSIDE `reduced`'s
    surface: what lies deep inside it (a generator's internal layers) is not a loss."""
    co = st.coords(reference)
    pick = surface_points(reference)
    tree = tree_of(reduced)
    far = []
    for p in pick.tolist():
        hit = tree.find_nearest(p, tolerance * 8)
        if hit[0] is None:
            far.append(p)
        elif hit[3] > tolerance:
            out = (p[0] - hit[0][0]) * hit[1][0] + (p[1] - hit[0][1]) * hit[1][1] + (p[2] - hit[0][2]) * hit[1][2]
            if out > -0.5 * hit[3]:
                far.append(p)
    facts = {"share": round(len(far) / max(1, len(pick)), 4), "tolerance": round(tolerance, 6)}
    if far:
        pts = np.array(far, dtype=np.float32)
        lo, hi = co.min(axis=0), co.max(axis=0)
        centre = pts.mean(axis=0)
        rel = (centre - (lo + hi) / 2) / np.maximum(hi - lo, 1e-9)
        axis = int(np.argmax(np.abs(rel)))
        facts["where"] = SIDES[axis][1 if rel[axis] > 0 else 0]
        facts["centre"] = to_asset(centre)
    return facts


def drift(lo, hi, base_lo, base_hi):
    """(metres, side name) of the bounding-box side that moved most against the base."""
    worst, name = 0.0, ""
    for i in range(3):
        for k, (a, b) in enumerate(((lo[i], base_lo[i]), (hi[i], base_hi[i]))):
            if abs(a - b) > worst:
                worst, name = abs(a - b), SIDES[i][k]
    return worst, name


def whole(state, before):
    """After any step: there is a mesh, it has faces, it is finite and it did not explode."""
    obj = state.mesh
    if obj is None or obj.type != "MESH" or obj.name not in bpy.data.objects:
        raise ValueError("the step left no working mesh. fix: keep one mesh object and leave it as state.mesh")
    if not obj.data.polygons:
        raise ValueError("the step left a mesh with no faces. fix: check the step's sizes against the mesh's")
    co = st.coords(obj)
    if not np.isfinite(co).all():
        raise ValueError("the step left non-finite vertex positions. fix: lower its strength or distance")
    diag = float(np.linalg.norm(co.max(axis=0) - co.min(axis=0)))
    if before and (diag > 20 * before or diag < before / 20):
        raise ValueError(
            f"the bounding-box diagonal went from {before:.4f} m to {diag:.4f} m in one step. "
            "fix: check the step's units (metres, asset frame)"
        )
    return diag


def uv_degenerate(me):
    """Share of triangles whose UV area per surface area is under 5 % of the median: no texels."""
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    index = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", index)
    p = co.reshape(-1, 3)[index].reshape(-1, 3, 3)
    area = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1) / 2
    uv = np.empty(len(me.loops) * 2, dtype=np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 3, 2)
    e1, e2 = uv[:, 1] - uv[:, 0], uv[:, 2] - uv[:, 0]
    ratio = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) / 2 / np.maximum(area, 1e-12)
    return round(float((ratio < 0.05 * np.median(ratio)).mean()), 4)


def handles(obj):
    """Tunnels through a closed triangle mesh: components − (V − E + F) / 2."""
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    chi = len(bm.verts) - len(bm.edges) + len(bm.faces)
    seen, parts = set(), 0
    for v in bm.verts:
        if v.index in seen:
            continue
        parts += 1
        seen.add(v.index)
        stack = [v]
        while stack:
            for e in stack.pop().link_edges:
                for w in e.verts:
                    if w.index not in seen:
                        seen.add(w.index)
                        stack.append(w)
    bm.free()
    return int(round(parts - chi / 2))
