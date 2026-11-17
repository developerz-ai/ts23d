# SPDX-License-Identifier: GPL-2.0-or-later
# Step ops that move vertices and keep the topology: `smooth` (Laplacian or corrective-smooth
# modifier), `displace` (a Displace modifier along normals with a procedural texture: clouds,
# Voronoi or Musgrave; the seed offsets the texture space) and `inflate` (along normals by a
# distance). `mask` limits displace / inflate to a height band or a ball, in the asset frame.

import bpy
import numpy as np

from tasks.steps import state as st

TEXTURES = {"noise": "CLOUDS", "voronoi": "VORONOI", "musgrave": "MUSGRAVE"}


def mask_weights(obj, mask):
    """Per-vertex 0..1 weights of a mask (1 everywhere when there is none)."""
    co = st.coords(obj)
    if mask is None:
        return np.ones(len(co), dtype=np.float32)
    if mask["kind"] == "z":
        z = co[:, 2]
        outside = np.maximum(mask["min"] - z, z - mask["max"])
    else:
        centre = np.array(st.from_asset(mask["at"]), dtype=np.float32)
        outside = np.linalg.norm(co - centre, axis=1) - mask["r"]
    feather = mask.get("feather", 0)
    if feather <= 0:
        return (outside <= 0).astype(np.float32)
    t = np.clip(1 - outside / feather, 0, 1)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def mask_group(obj, mask):
    """A vertex group holding the mask, or None."""
    if mask is None:
        return None
    group = obj.vertex_groups.new(name="t3d_mask")
    for i, w in enumerate(mask_weights(obj, mask).tolist()):
        if w > 0:
            group.add([i], w, "REPLACE")
    return group


def smooth(state, step):
    obj = state.mesh
    if step["kind"] == "laplacian":
        mod = obj.modifiers.new("t3d_smooth", "LAPLACIANSMOOTH")
        mod.lambda_factor = step["factor"]
        mod.lambda_border = step["factor"]
    else:
        mod = obj.modifiers.new("t3d_smooth", "CORRECTIVE_SMOOTH")
        mod.factor = min(1.0, step["factor"])
        mod.use_only_smooth = True
        mod.smooth_type = "SIMPLE"
    mod.iterations = step["iterations"]
    st.apply_modifier(obj, mod)
    return {}


def displace(state, step):
    obj = state.mesh
    tex = bpy.data.textures.new("t3d_displace", type=TEXTURES[step["kind"]])
    tex.noise_scale = step["scale"]
    seed = step["seed"]
    origin = st.link(bpy.data.objects.new("t3d_displace_origin", None))
    # Irrational steps: every seed moves the texture space somewhere else, the same place each run.
    origin.location = ((seed * 7.548777) % 97.0, (seed * 5.698403) % 89.0, (seed * 3.141593) % 83.0)
    bpy.context.view_layer.update()
    group = mask_group(obj, step.get("mask"))
    mod = obj.modifiers.new("t3d_displace", "DISPLACE")
    mod.texture = tex
    mod.texture_coords = "OBJECT"
    mod.texture_coords_object = origin
    mod.direction = "NORMAL"
    mod.mid_level = 0.5
    mod.strength = step["strength"]
    if group is not None:
        mod.vertex_group = group.name
    st.apply_modifier(obj, mod)
    group = obj.vertex_groups.get("t3d_mask")  # looked up again: applying a modifier moves the data
    if group is not None:
        obj.vertex_groups.remove(group)
    bpy.data.objects.remove(origin, do_unlink=True)
    bpy.data.textures.remove(tex)
    return {}


def inflate(state, step):
    obj = state.mesh
    me = obj.data
    co = st.coords(obj)
    normals = np.empty(len(co) * 3, dtype=np.float32)
    me.vertices.foreach_get("normal", normals)
    weights = mask_weights(obj, step.get("mask"))
    co += normals.reshape(-1, 3) * (step["distance"] * weights)[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    return {"moved": int((weights > 0).sum())}
