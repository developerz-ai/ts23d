# SPDX-License-Identifier: GPL-2.0-or-later
# Step ops that build a body with no input mesh (the Blender-only path), always the first step:
# `skinBody` (a Skin modifier over bone segments with a radius at each end, subdivided) and
# `metaballs` (a metaball union polygonised at a resolution). Points are in the asset frame.

import bpy

from tasks.steps import state as st


def finish(state, obj):
    obj.name = obj.data.name = "lod0"
    state.mesh = obj
    st.smooth_shade(obj)
    if not obj.data.polygons:
        raise ValueError("the build op made no faces")
    return {}


def skin_body(state, step):
    index, verts, radii, edges = {}, [], [], []

    def vertex(p, r):
        key = tuple(round(x, 6) for x in p)
        if key not in index:
            index[key] = len(verts)
            verts.append(tuple(st.from_asset(p)))
            radii.append(r)
        radii[index[key]] = max(radii[index[key]], r)
        return index[key]

    for b in step["bones"]:
        a, c = vertex(b["head"], b["r0"]), vertex(b["tail"], b["r1"])
        if a == c:
            raise ValueError(f"skinBody bone at {b['head']} has no length")
        edges.append((a, c))
    me = bpy.data.meshes.new("lod0")
    me.from_pydata(verts, edges, [])
    obj = st.link(bpy.data.objects.new("lod0", me))
    skin = obj.modifiers.new("t3d_skin", "SKIN")
    for v, r in zip(me.skin_vertices[0].data, radii):
        v.radius = (r, r)
        v.use_root = False
    me.skin_vertices[0].data[0].use_root = True
    st.apply_modifier(obj, skin)
    if step["subdiv"] > 0:
        sub = obj.modifiers.new("t3d_subdiv", "SUBSURF")
        sub.levels = step["subdiv"]
        st.apply_modifier(obj, sub)
    return {**finish(state, obj), "joints": len(verts)}


def metaballs(state, step):
    mb = bpy.data.metaballs.new("t3d_meta")
    mb.resolution = step["resolution"]
    mb.render_resolution = step["resolution"]
    mb.threshold = 0.6
    for b in step["balls"]:
        e = mb.elements.new()
        e.co = st.from_asset(b["at"])
        e.radius = b["r"]
        e.stiffness = b["stiffness"]
        e.use_negative = b["negative"]
    holder = st.link(bpy.data.objects.new("t3d_meta", mb))
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(holder.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(holder, do_unlink=True)
    bpy.data.metaballs.remove(mb)
    obj = st.link(bpy.data.objects.new("lod0", me))
    return {**finish(state, obj), "balls": len(step["balls"])}
