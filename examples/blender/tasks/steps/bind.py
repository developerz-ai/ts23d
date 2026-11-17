# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `bind`: build an armature from the request's `t3d-skeleton/1` JSON (glTF frame, bones
# parents-first) and skin the shell to it with automatic (bone heat) weights. Bone heat gives up
# on meshes that are not one clean volume and leaves every group empty: when more than 1 % of
# the vertices end up with no weight, a voxel-remeshed proxy of the shell is weighted instead and
# its weights are transferred back (Data Transfer, nearest face interpolated) and smoothed. A few stray
# vertices copy the nearest weighted one. Then: at most `maxInfluences` per vertex, weights under
# 0.01 dropped, normalised. The exported skin's joints carry the bone names. With `from`
# 'source' the input GLB's own rig is carried instead (rig_source.py).

import bpy
import numpy as np
from mathutils import kdtree

from tasks.steps import state as st
from tasks.steps.remesh import voxel_shell

PROXY_AFTER = 0.01  # fraction of unweighted vertices that sends the bind to the proxy


def build_armature(skeleton):
    if skeleton.get("contract") != "t3d-skeleton/1" or skeleton.get("frame") != "gltf":
        raise ValueError("request.skeleton is not t3d-skeleton/1 in the glTF frame")
    bones = skeleton.get("bones") or []
    if not bones:
        raise ValueError("request.skeleton has no bones")
    arm = bpy.data.armatures.new("rig")
    obj = st.link(bpy.data.objects.new("rig", arm))
    st.activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for b in bones:
        bone = arm.edit_bones.new(b["name"])
        bone.head = st.from_gltf(b["head"])
        bone.tail = st.from_gltf(b["tail"])
        bone.roll = 0.0
        if b.get("parent") is not None:
            if b["parent"] not in made:
                raise ValueError(f"bone {b['name']!r} comes before its parent {b['parent']!r}")
            bone.parent = made[b["parent"]]
            bone.use_connect = False
        if bone.name != b["name"]:
            raise ValueError(f"bone name {b['name']!r} is taken or too long for Blender")
        made[b["name"]] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def weight_sums(obj, bones):
    """Per-vertex (sum of bone weights, number of bone influences)."""
    ids = {g.index for g in obj.vertex_groups if g.name in bones}
    total = np.zeros(len(obj.data.vertices), dtype=np.float32)
    count = np.zeros(len(obj.data.vertices), dtype=np.int32)
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group in ids and g.weight > 0:
                total[v.index] += g.weight
                count[v.index] += 1
    return total, count


def heat(obj, armature):
    """Automatic weights; returns the fraction of vertices left without any."""
    st.activate(armature, obj)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    total, _ = weight_sums(obj, {b.name for b in armature.data.bones})
    return float((total <= 0).mean())


def via_proxy(state, obj, armature, voxel):
    """Weight a watertight proxy of the shell, then carry the weights over."""
    proxy = st.duplicate(obj, "bind_proxy")
    for m in list(proxy.modifiers):
        proxy.modifiers.remove(m)
    proxy.parent = None
    proxy.vertex_groups.clear()
    voxel_shell(proxy, voxel)
    missed = heat(proxy, armature)
    if missed >= 1.0:
        raise ValueError(
            "bone heat found no weights on the shell or on its voxel proxy: "
            "fit the skeleton inside the mesh (bones outside the volume cannot be weighted)"
        )
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    for bone in armature.data.bones:
        obj.vertex_groups.new(name=bone.name)
    mod = obj.modifiers.new("t3d_weights", "DATA_TRANSFER")
    mod.object = proxy
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    st.apply_modifier(obj, mod)
    bpy.data.objects.remove(proxy, do_unlink=True)
    st.activate(obj)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")  # vertex_group_smooth polls for it (works with -b)
    bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=2)
    bpy.ops.object.mode_set(mode="OBJECT")
    return missed


def fill_strays(obj, bones):
    """Vertices with no weight copy the nearest weighted vertex. Returns how many."""
    total, _ = weight_sums(obj, bones)
    stray = np.flatnonzero(total <= 0)
    if len(stray) == 0:
        return 0
    if len(stray) == len(total):
        raise ValueError("bind left every vertex without a weight")
    verts = obj.data.vertices
    tree = kdtree.KDTree(len(total) - len(stray))
    for i in np.flatnonzero(total > 0).tolist():
        tree.insert(verts[i].co, i)
    tree.balance()
    for i in stray.tolist():
        _, near, _ = tree.find(verts[i].co)
        for g in verts[near].groups:
            obj.vertex_groups[g.group].add([i], g.weight, "REPLACE")
    return int(len(stray))


def limit(obj, influences):
    """At most `influences` per vertex, tiny weights dropped, sums back to 1."""
    st.activate(obj)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=influences)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01, keep_single=True)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)


def run(state, step):
    if step["from"] == "source":
        from tasks.steps import rig_source

        return rig_source.bind(state, step)
    if state.skeleton is None:
        raise ValueError("bind needs request.skeleton (t3d-skeleton/1 JSON)")
    obj = state.mesh
    armature = build_armature(state.skeleton)
    bones = {b.name for b in armature.data.bones}
    facts = {"bones": len(bones), "method": "bone-heat"}
    missed = heat(obj, armature)
    facts["heatUnweighted"] = round(missed, 4)
    if missed > PROXY_AFTER:
        _, _, diag = st.bounds(obj)
        voxel = step.get("proxyVoxel") or 0.012 * diag
        facts["method"] = "proxy-transfer"
        facts["proxyVoxel"] = round(voxel, 6)
        facts["proxyUnweighted"] = round(via_proxy(state, obj, armature, voxel), 4)
    facts["filled"] = fill_strays(obj, bones)
    limit(obj, step["maxInfluences"])
    total, count = weight_sums(obj, bones)
    facts["maxInfluences"] = int(count.max())
    facts["weightSum"] = [round(float(total.min()), 4), round(float(total.max()), 4)]
    used = {obj.vertex_groups[g.group].name for v in obj.data.vertices for g in v.groups if g.weight > 0}
    facts["unusedBones"] = sorted(bones - used)
    if not any(m.type == "ARMATURE" for m in obj.modifiers):
        raise ValueError("bind left the shell without an Armature modifier")
    state.armature = armature
    state.max_influences = step["maxInfluences"]
    state.report["bind"] = facts
    return facts
