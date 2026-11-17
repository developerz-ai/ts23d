# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `uv`: one fresh UV layer for the shell. 'smart' is Smart UV Project; 'unwrap' turns its
# islands into seams (sharp-angle seams mean nothing on a smooth organic) and unwraps them with
# minimum stretch. Both project a SMOOTHED copy of the shell (`smooth` iterations, same
# topology) and copy the UVs back: on a noisy surface (fur, scales) the raw normals shatter the
# map into thousands of specks, which wastes the texture and tears every decimated LOD. Islands
# are then evened in texel density and packed concave. The mesh as it was (old UVs and materials)
# is kept as the colour source when nothing kept one before. Gated: island count against the
# triangle count, and the share of triangles with no UV area.

import bpy
import numpy as np

from tasks.steps import gates
from tasks.steps import state as st

# A map past these is confetti: every LOD collapse tears it (measured: 138..535 islands on good
# 30..45 k shells, 5,298..8,950 on shattered ones).
MIN_ISLANDS = 64
TRIANGLES_PER_ISLAND = 20
MAX_UV_DEGENERATE = 0.05


def run(state, step):
    obj = state.mesh
    state.keep_colour_source()
    me = obj.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="UVMap")
    me.materials.clear()
    proxy = st.duplicate(obj, "uv_proxy")
    for m in list(proxy.modifiers):
        proxy.modifiers.remove(m)
    if step["smooth"] > 0:
        mod = proxy.modifiers.new("t3d_uv_smooth", "SMOOTH")
        mod.factor = 0.5
        mod.iterations = step["smooth"]
        st.apply_modifier(proxy, mod)
    with st.edit(proxy):
        bpy.ops.uv.smart_project(angle_limit=step["angle"], island_margin=step["margin"])
        if step["kind"] == "unwrap":
            bpy.ops.mesh.mark_seam(clear=True)
            bpy.ops.uv.seams_from_islands()
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.unwrap(method="MINIMUM_STRETCH", margin=step["margin"])
    if len(proxy.data.loops) != len(me.loops):
        raise ValueError("the smoothed copy lost the shell's topology")
    uvs = np.empty(len(me.loops) * 2, dtype=np.float32)
    proxy.data.uv_layers.active.data.foreach_get("uv", uvs)
    me.uv_layers.active.data.foreach_set("uv", uvs)
    bpy.data.objects.remove(proxy, do_unlink=True)
    with st.edit(obj):  # texel density and packing follow the real surface, not the smoothed one
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(margin=step["margin"], margin_method="FRACTION", shape_method="CONCAVE")
    facts = {"kind": step["kind"], "islands": islands(me)}
    tris = st.triangles(obj)
    limit = max(MIN_ISLANDS, tris // TRIANGLES_PER_ISLAND)
    if facts["islands"] > limit:
        raise ValueError(
            f"the UV map has {facts['islands']} islands on {tris} triangles (limit {limit}): the surface is "
            "shattered or too noisy to unwrap. fix: retopo with strategy 'shell' before uv, raise uv smooth, "
            "or raise uv angle"
        )
    if all(len(p.vertices) == 3 for p in me.polygons):
        facts["uvDegenerate"] = gates.uv_degenerate(me)
        if facts["uvDegenerate"] > MAX_UV_DEGENERATE:
            raise ValueError(
                f"{facts['uvDegenerate']:.1%} of the triangles have no UV area (limit {MAX_UV_DEGENERATE:.0%}): "
                "they would sample one texel. fix: clean / retopo first (specks and slivers project to nothing)"
            )
    return facts


def islands(me):
    """UV islands: connected faces that share a UV at each shared vertex (union-find)."""
    parent = list(range(len(me.polygons)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    seen = {}
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            key = (me.loops[li].vertex_index, round(uv[li].uv[0], 5), round(uv[li].uv[1], 5))
            other = seen.setdefault(key, poly.index)
            a, b = find(other), find(poly.index)
            if a != b:
                parent[a] = b
    return len({find(i) for i in range(len(parent))})
