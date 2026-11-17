# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `retopo`: the LOD0 shell at a triangle target; the mesh before it becomes the bake
# source for normals and AO. Strategy 'shell' (default) never collapses the raw surface: a
# generator mesh is noisy fur over internal layers, and Decimate on it tears and leaves a
# thousand UV islands. It builds a solid shell first (shell.py: voxel from the target, 0.6 ×
# sqrt(area / triangles), clamped; a leaky source is closed by `close` voxels, thin sheets kept
# `skin` voxels fatter), optionally smooths, then reduces the clean watertight shell — Decimate
# collapse, or QuadriFlow (shrink-wrapped back onto the shell, with Decimate as the fallback when
# it finds no solution). The fine detail returns through the normal bake. Strategy 'decimate'
# collapses the surface as it is. `focus` spheres keep more triangles where it matters (head,
# paws): a vertex-group-weighted Decimate.

import math

import bpy
import numpy as np

from tasks.steps import state as st
from tasks.steps import gates, shell


def surface_area(obj):
    area = np.empty(len(obj.data.polygons), dtype=np.float32)
    obj.data.polygons.foreach_get("area", area)
    return float(area.sum())


def auto_voxel(obj, target):
    """A voxel a little finer than the target's mean edge, inside what the grid can hold."""
    _, _, diag = st.bounds(obj)
    voxel = 0.6 * math.sqrt(surface_area(obj) / target)
    return min(max(voxel, diag / 1000), diag / 60)


# Decimate reads a vertex group as "how locked": 1 never collapses, and the response is steep.
# Measured on Blender 5.3 (ellipsoid, 20 k → 1.5 k triangles): a group weight g multiplies the
# kept vertex density by about 1 + 750 g (0.001 → ×1.8, 0.002 → ×2.6, 0.004 → ×4.0).
FOCUS_GAIN = 750.0
THIN_KEEP = 3.0  # density multiplier of thin parts
THIN_SHARE = 0.012  # of the bbox diagonal: thinner than this is a thin part


def focus_group(obj, focus, base=None):
    """Vertex group 't3d_focus': each ball asks about `weight` times the vertex density."""
    co = st.coords(obj)
    weights = np.zeros(len(co), dtype=np.float32) if base is None else base
    for f in focus:
        d = np.linalg.norm(co - np.array(st.from_asset(f["at"]), dtype=np.float32), axis=1)
        t = np.clip(1.5 - d / f["r"], 0, 1)  # full inside r, fading out to 1.5 r
        weights = np.maximum(weights, t * t * (3 - 2 * t) * (f["weight"] - 1) / FOCUS_GAIN)
    group = obj.vertex_groups.new(name="t3d_focus")
    for i in np.flatnonzero(weights > 0).tolist():
        group.add([i], float(weights[i]), "REPLACE")


def thin_weights(obj, limit):
    """Per vertex: THIN_KEEP where the surface's other side is nearer than `limit` (a membrane, an
    ear, a horn, a finger): a collapse there pinches through or eats the part, so it comes late."""
    tree = gates.tree_of(obj)
    weights = np.zeros(len(obj.data.vertices), dtype=np.float32)
    for v in obj.data.vertices:
        n = v.normal
        hit = tree.ray_cast(v.co - n * (limit * 1e-3), -n, limit)
        if hit[0] is not None:
            weights[v.index] = (THIN_KEEP - 1) / FOCUS_GAIN
    return weights


def decimate_to(obj, target, symmetry=False, focus=None, thin=0.0):
    """Collapse to at most `target` triangles (repeated: a pass can land a little above). `thin`:
    thickness in metres under which a part keeps THIN_KEEP times the vertex density."""
    for _ in range(3):
        count = st.triangles(obj)
        if count <= target:
            break
        mod = obj.modifiers.new("t3d_decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(1e-6, (target - 0.5) / count)
        mod.use_collapse_triangulate = True
        if symmetry:
            mod.use_symmetry = True
            mod.symmetry_axis = st.AXES["y"][0]
        if focus or thin > 0:
            focus_group(obj, focus or [], thin_weights(obj, thin) if thin > 0 else None)
            mod.vertex_group = "t3d_focus"
            mod.vertex_group_factor = 1.0
            mod.invert_vertex_group = True  # inverted: a higher weight collapses later
        st.apply_modifier(obj, mod)
        group = obj.vertex_groups.get("t3d_focus")
        if group is not None:
            obj.vertex_groups.remove(group)


def quadriflow(state, obj, target, symmetry, weld):
    """QuadriFlow to ~target/2 quads, pulled back onto the surface it started from. False: no solution."""
    shell = st.duplicate(obj, "quadriflow_target")
    with st.edit(obj):  # it calls a fine voxel mesh "not manifold" until near-coincident verts merge
        bpy.ops.mesh.remove_doubles(threshold=weld)
        bpy.ops.mesh.normals_make_consistent(inside=False)
    obj.data.use_mirror_x = symmetry
    st.activate(obj)
    result = bpy.ops.object.quadriflow_remesh(
        mode="FACES",
        target_faces=max(2, target // 2),
        use_mesh_symmetry=symmetry,
        use_preserve_sharp=False,
        use_preserve_boundary=False,
        smooth_normals=False,
        seed=int(state.request.get("seed", 0)),
    )
    solved = "FINISHED" in result and len(obj.data.polygons) > 0
    if solved:
        wrap = obj.modifiers.new("t3d_wrap", "SHRINKWRAP")
        wrap.target = shell
        wrap.wrap_method = "NEAREST_SURFACEPOINT"
        st.apply_modifier(obj, wrap)
        relax = obj.modifiers.new("t3d_relax", "CORRECTIVE_SMOOTH")
        relax.use_only_smooth = True
        relax.iterations = 1
        relax.factor = 0.3
        st.apply_modifier(obj, relax)
    else:  # the operator leaves the mesh as it was: go on from the shell
        obj.data = shell.data.copy()
    bpy.data.objects.remove(shell, do_unlink=True)
    return solved


def run(state, step):
    obj, target = state.mesh, step["triangles"]
    facts = {"from": st.triangles(obj), "strategy": step["strategy"], "reduce": step["reduce"]}
    kept_now = state.keep_colour_source()
    state.shape_src = state.colour_src if kept_now else st.duplicate(obj, "shape_source")
    _, _, diag = st.bounds(obj)
    weld = 3e-4 * diag
    if step["strategy"] == "shell":
        voxel = step.get("voxel") or auto_voxel(obj, target)
        facts["voxel"] = round(voxel, 6)
        facts["shell"] = shell.solid(obj, voxel, step.get("close"), step.get("skin"))
        weld = 0.05 * voxel
        facts["shellTriangles"] = st.triangles(obj)
        if step["smooth"] > 0:
            mod = obj.modifiers.new("t3d_smooth", "CORRECTIVE_SMOOTH")
            mod.use_only_smooth = True
            mod.iterations = step["smooth"]
            mod.factor = 0.5
            st.apply_modifier(obj, mod)
    if step["reduce"] == "quadriflow":
        solved = quadriflow(state, obj, target, step["preserveSymmetry"], weld)
        facts["quadriflow"] = "solved" if solved else "no solution: decimated instead"
        obj.data.materials.clear()
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
    st.triangulate(obj)
    decimate_to(obj, target, step["preserveSymmetry"], step.get("focus"), THIN_SHARE * diag)
    st.triangulate(obj)
    st.smooth_shade(obj)
    after = st.triangles(obj)
    if after > target:
        raise ValueError(f"retopo reached {after} triangles, asked {target}")
    facts["boundaryEdges"] = st.boundary_edges(obj)
    if step.get("focus"):
        co = st.coords(obj)
        inside = np.zeros(len(co), dtype=bool)
        for f in step["focus"]:
            inside |= np.linalg.norm(co - np.array(st.from_asset(f["at"]), dtype=np.float32), axis=1) <= f["r"]
        facts["focusVertexShare"] = round(float(inside.mean()), 4)
    return facts
