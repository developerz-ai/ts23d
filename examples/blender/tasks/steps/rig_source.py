# SPDX-License-Identifier: GPL-2.0-or-later
# A source that came rigged (a Meshy humanoid: one skinned mesh, an armature, clips). `keep`
# runs at load: it finds the armature the meshes are skinned to, keeps it and its actions, and
# sets a copy of the skinned mesh aside with its vertex groups. `bind` (step `bind` with from
# 'source') carries that rig onto the shell: the source's weights by Data Transfer (nearest
# face, interpolated), strays filled, limited and normalised, an Armature modifier and the
# armature as parent — so every LOD decimated from the shell deforms on the same skeleton and
# `export` can write the skin and every clip. `clips` lists the actions (name, seconds);
# `clip_fps` reads the rate the file's clips were sampled at, so the scene can match it.

import json
import struct

import bpy

from tasks.steps import bind as binder
from tasks.steps import state as st


def clip_fps(path):
    """The frame rate the GLB's clips were sampled at (keys 1 / fps apart), or None. Set as the
    scene's before the import, every key lands on a whole frame and the export resamples nothing."""
    with open(path, "rb") as f:
        f.read(12)
        size, _kind = struct.unpack("<I4s", f.read(8))
        doc = json.loads(f.read(size).decode("utf-8"))
    rates = {}
    for anim in doc.get("animations", []):
        for sampler in anim.get("samplers", []):
            acc = doc["accessors"][sampler["input"]]
            span = (acc.get("max") or [0])[0] - (acc.get("min") or [0])[0]
            if acc.get("count", 0) > 1 and span > 0:
                fps = (acc["count"] - 1) / span
                if abs(fps - round(fps)) < 0.01 * fps and 1 <= round(fps) <= 240:
                    rates[round(fps)] = rates.get(round(fps), 0) + 1
    return max(rates, key=rates.get) if rates else None


def without_bone_shapes(imported):
    """Drop the helper meshes the glTF importer adds as bone shapes (an 'Icosphere'): not the model."""
    shapes = set()
    for o in imported:
        if o.type == "ARMATURE":
            for bone in o.pose.bones:
                if bone.custom_shape is not None:
                    shapes.add(bone.custom_shape)
                    bone.custom_shape = None
    kept = [o for o in imported if o not in shapes]
    for o in shapes:
        bpy.data.objects.remove(o, do_unlink=True)
    return kept


def armature_of(meshes):
    for o in meshes:
        for m in o.modifiers:
            if m.type == "ARMATURE" and m.object is not None:
                return m.object
    return None


def ancestors(obj):
    names = set()
    while obj is not None:
        names.add(obj.name)
        obj = obj.parent
    return names


def clips():
    fps = bpy.context.scene.render.fps
    return [
        {"name": a.name, "seconds": round((a.frame_range[1] - a.frame_range[0]) / fps, 4)}
        for a in sorted(bpy.data.actions, key=lambda a: a.name)
    ]


def fcurves(action):
    if hasattr(action, "layers"):  # layered actions (Blender >= 4.4)
        return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    return list(action.fcurves)


def snap_keys():
    """Keys a float error off a whole frame go onto it: the exporter cuts a clip at int(last key)."""
    for action in bpy.data.actions:
        for fc in fcurves(action):
            for key in fc.keyframe_points:
                frame = round(key.co.x)
                if 0 < abs(key.co.x - frame) < 1e-3:
                    shift = frame - key.co.x
                    key.co.x, key.handle_left.x, key.handle_right.x = frame, key.handle_left.x + shift, key.handle_right.x + shift
            fc.update()


def keep(state, obj, armature):
    """At load, `obj` being the joined skinned mesh: remember the rig and a weights source."""
    snap_keys()
    state.source_rig = armature
    state.rig_src = st.duplicate(obj, "rig_source")
    for m in list(state.rig_src.modifiers):
        state.rig_src.modifiers.remove(m)
    state.rig_src.parent = None
    bones = {b.name for b in armature.data.bones}
    total, count = binder.weight_sums(state.rig_src, bones)
    return {
        "bones": len(bones),
        "clips": clips(),
        "unweighted": round(float((total <= 0).mean()), 4),
        "maxInfluences": int(count.max()),
    }


def bind(state, step):
    arm, src, obj = state.source_rig, state.rig_src, state.mesh
    if arm is None or src is None:
        raise ValueError(
            "bind from 'source': the input GLB has no skinned mesh. "
            "fix: send a rigged GLB, or bind from 'skeleton' with a skeleton input"
        )
    for m in [m for m in obj.modifiers if m.type == "ARMATURE"]:
        obj.modifiers.remove(m)
    obj.vertex_groups.clear()
    bones = {b.name for b in arm.data.bones}
    for name in sorted(bones & {g.name for g in src.vertex_groups}):
        obj.vertex_groups.new(name=name)
    mod = obj.modifiers.new("t3d_weights", "DATA_TRANSFER")
    mod.object = src
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    st.apply_modifier(obj, mod)
    total, _ = binder.weight_sums(obj, bones)
    facts = {"bones": len(bones), "method": "source-transfer", "transferUnweighted": round(float((total <= 0).mean()), 4)}
    if facts["transferUnweighted"] > 0.05:
        raise ValueError(
            f"bind from 'source': {facts['transferUnweighted']:.1%} of the shell got no weight from the source. "
            "fix: the shell must follow the source (check retopo facts); no transform between load and bind"
        )
    facts["filled"] = binder.fill_strays(obj, bones)
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.matrix_world = world
    skin = obj.modifiers.new("Armature", "ARMATURE")
    skin.object = arm
    binder.limit(obj, step["maxInfluences"])
    total, count = binder.weight_sums(obj, bones)
    facts["maxInfluences"] = int(count.max())
    facts["weightSum"] = [round(float(total.min()), 4), round(float(total.max()), 4)]
    facts["clips"] = [c["name"] for c in clips()]
    state.armature = arm
    state.max_influences = step["maxInfluences"]
    state.report["bind"] = facts
    return facts
