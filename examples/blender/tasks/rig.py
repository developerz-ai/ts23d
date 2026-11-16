# SPDX-License-Identifier: GPL-2.0-or-later
# `rig` with template 'human': Rigify. Adds the Rigify human meta-rig, fits it to the GLB — each
# meta-rig bone snapped to the input joint of the same role (by name, see ALIASES): a skin's
# armature bones, or the named pivot nodes of an unskinned ts23d GLB (head = the node, tail = its
# first child) — the rest scaled to the mesh's height — generates the full rig (IK/FK limbs, face controls), skins
# the mesh to its deform bones with automatic weights, and exports the skinned GLB (DEF- bones
# only) as output-0.glb plus output-1.json listing deform bones and control counts.
# Deterministic: no randomness; one thread; bone order is Rigify's.

import json
import os

import addon_utils
import bpy
from mathutils import Vector

from tasks import common

# Meta-rig bone → names an input armature may use for the same bone (lower case, any of).
ALIASES = {
    "spine": ["spine", "hips", "pelvis", "root_spine"],
    "spine.001": ["spine.001", "spine1", "abdomen", "belly"],
    "spine.002": ["spine.002", "spine2", "chest_lower"],
    "spine.003": ["spine.003", "spine3", "chest"],
    "spine.004": ["spine.004", "neck"],
    "spine.006": ["spine.006", "head"],
    "upper_arm.L": ["upper_arm.l", "upperarm.l", "upper_arm_l", "arm.l", "upper_arm_left"],
    "forearm.L": ["forearm.l", "lowerarm.l", "forearm_l", "forearm_left"],
    "hand.L": ["hand.l", "hand_l", "hand_left"],
    "thigh.L": ["thigh.l", "upperleg.l", "thigh_l", "thigh_left"],
    "shin.L": ["shin.l", "lowerleg.l", "calf.l", "shin_l", "shin_left"],
    "foot.L": ["foot.l", "foot_l", "foot_left"],
}


def mirrored(aliases):
    out = dict(aliases)
    for bone, names in aliases.items():
        if bone.endswith(".L"):
            out[bone[:-2] + ".R"] = [
                n.replace(".l", ".r").replace("_l", "_r").replace("_left", "_right") for n in names
            ]
    return out


def run(request, inputs, work):
    template = request.get("template", "human")
    if template != "human":
        raise ValueError(f"rig template {template!r} is not supported (only 'human')")
    addon_utils.enable("rigify", default_set=True)
    objects = common.import_glb(common.input_file(request, "mesh", inputs))
    joints = joints_of(objects)
    body = common.join(objects, "body")
    lo, hi = common.bounds(body)
    height = hi[2] - lo[2]

    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.armature_human_metarig_add()
    meta = bpy.context.view_layer.objects.active
    meta_h = max(b.head_local.z for b in meta.data.bones) or 1.0
    scale = height / meta_h
    meta.scale = (scale, scale, scale)
    meta.location = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    snapped = snap_to(meta, joints)
    bpy.ops.object.mode_set(mode="OBJECT")
    common.select_only([meta])
    bpy.context.view_layer.objects.active = meta
    bpy.ops.pose.rigify_generate()
    rig = bpy.context.view_layer.objects.active
    rig.name = "rig"

    for o in [o for o in objects if o.name in bpy.data.objects and o.type in {"ARMATURE", "EMPTY"}]:
        bpy.data.objects.remove(o, do_unlink=True)
    common.select_only([body, rig])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bpy.data.objects.remove(meta, do_unlink=True)

    deform = [b.name for b in rig.data.bones if b.use_deform]
    controls = [b.name for b in rig.data.bones if not b.use_deform and not b.name.startswith(("MCH-", "ORG-"))]
    face = [n for n in controls if any(k in n for k in ("lip", "brow", "lid", "jaw", "nose", "cheek", "ear", "tongue", "teeth"))]
    out_glb = os.path.join(work, "output-0.glb")
    common.export_glb(out_glb, [rig, body], skins=True)
    summary = {
        "template": template,
        "deformBones": deform,
        "controls": len(controls),
        "faceControls": len(face),
        "snapped": snapped,
        "height": round(height, 4),
    }
    with open(os.path.join(work, "output-1.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, sort_keys=True)
    return {
        "outputs": [
            {"file": "output-0.glb", "mime": "model/gltf-binary"},
            {"file": "output-1.json", "mime": "application/json"},
        ],
        "stats": {"deformBones": len(deform), "controls": len(controls), "faceControls": len(face), "snapped": len(snapped)},
    }


def joints_of(objects):
    """Lower-case joint name → (head, tail) in world space, from armatures or named empties."""
    out = {}
    for o in objects:
        if o.type == "ARMATURE":
            mw = o.matrix_world
            for b in o.data.bones:
                out[b.name.lower()] = (mw @ b.head_local, mw @ b.tail_local)
    for o in objects:
        if o.type == "EMPTY" and o.name.lower() not in out:
            head = o.matrix_world.translation.copy()
            kids = sorted((c for c in o.children if c.type == "EMPTY"), key=lambda c: c.name)
            tail = kids[0].matrix_world.translation.copy() if kids else head + Vector((0, 0, 0.05))
            if (tail - head).length > 1e-4:
                out[o.name.lower()] = (head, tail)
    return out


def snap_to(meta, joints):
    """Move meta-rig bones onto the input joints that share a role; returns the names moved."""
    targets = {}
    for bone, names in mirrored(ALIASES).items():
        hit = next((joints[n] for n in names if n in joints), None)
        if hit:
            targets[bone] = hit
    common.select_only([meta])
    bpy.context.view_layer.objects.active = meta
    bpy.ops.object.mode_set(mode="EDIT")
    edit = meta.data.edit_bones
    for bone in sorted(targets):
        if bone in edit:
            head, tail = targets[bone]
            edit[bone].head = head
            edit[bone].tail = tail
    bend_straight_limbs(edit)
    return sorted(b for b in targets if b in edit)


# (upper, lower, direction): Rigify needs a bend to find the IK pole; elbows bend back (-X), knees
# forward (+X), ts23d's +X front.
LIMBS = [("upper_arm", "forearm", -1.0), ("thigh", "shin", 1.0)]


def bend_straight_limbs(edit):
    """Nudge a dead-straight elbow or knee by 3 % of the limb so the IK pole is defined."""
    for side in ("L", "R"):
        for upper, lower, sign in LIMBS:
            a, b = edit.get(f"{upper}.{side}"), edit.get(f"{lower}.{side}")
            if a is None or b is None:
                continue
            u, w = a.tail - a.head, b.tail - b.head
            if u.length < 1e-6 or w.length < 1e-6 or u.angle(w) > 0.035:
                continue
            nudge = Vector((sign * 0.03 * (u.length + w.length), 0, 0))
            a.tail = a.tail + nudge
            b.head = a.tail
