# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `repose`: after `bind`, pose the armature from the rest it was bound in (the skeleton
# fitted into the generated mesh: head turned, legs wherever the picture had them) to a target rest
# (`to`: every bone's head and tail in the asset frame; ts23d sends the symmetric, straightened
# skeleton), bake the deformed mesh as the new rest shape, make the pose the armature's rest and
# bind again with the same weights. Runs after the bake (source and shell coincide in the generated
# pose) and before `lods`. Bones turn about their head and stretch along themselves to the
# target's length; children do not inherit that stretch. Reports the largest turn in degrees.
# `mirror` ('+' keeps the animal's left, asset +y): afterwards, when the reposed mesh's mirror
# image lies within `mirrorLimit` metres (95th percentile) of the mesh over the head, neck and
# spine, the kept half replaces the other (cut on y = 0, mirrored, weights moved to the twin
# bones, same UVs); otherwise nothing is mirrored and the residual is reported.

import math

import re

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, kdtree

from tasks.steps import state as st


def depth(bone):
    n = 0
    while bone.parent is not None:
        bone, n = bone.parent, n + 1
    return n


SIDE = re.compile(r"_([lr])(?=_\d+$|$)")
CENTRE = re.compile(r"(^|_)(head|neck_\d+|spine_\d+)$")


def twin(name):
    return SIDE.sub(lambda m: "_r" if m.group(1) == "l" else "_l", name)


def mirror_residual(obj, arm):
    """95th-percentile distance (m) from the mirror image (across asset y = 0, Blender x = 0) of the
    vertices nearest a head, neck or spine bone to the mesh's own vertices."""
    co = st.coords(obj)
    tree = kdtree.KDTree(len(co))
    for i, p in enumerate(co):
        tree.insert(p, i)
    tree.balance()
    centre = np.full(len(co), np.inf)
    other = np.full(len(co), np.inf)
    for b in arm.data.bones:
        a, c = np.array(b.head_local), np.array(b.tail_local)
        u = c - a
        t = np.clip(((co - a) @ u) / float(u @ u), 0.0, 1.0)
        d = np.linalg.norm(co - (a + t[:, None] * u), axis=1)
        if CENTRE.search(b.name):
            centre = np.minimum(centre, d)
        else:
            other = np.minimum(other, d)
    picked = np.flatnonzero(centre <= other)[::7]
    if len(picked) == 0:
        return 0.0
    dist = [tree.find((-co[i][0], co[i][1], co[i][2]))[2] for i in picked.tolist()]
    return float(np.percentile(dist, 95))


def mirror_half(obj, side):
    """Keep the `side` half (asset +y is Blender +x), mirror it over, move weights to twin bones."""
    names = {g.index: g.name for g in obj.vertex_groups}
    index = {n: i for i, n in names.items()}
    swap = {i: index.get(twin(n), i) for i, n in names.items()}
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    keep_positive = side == "+"
    bmesh.ops.bisect_plane(
        bm,
        geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
        plane_co=(0, 0, 0),
        plane_no=(1, 0, 0),
        clear_inner=keep_positive,
        clear_outer=not keep_positive,
    )
    layer = bm.verts.layers.deform.verify()
    before = set(bm.verts)
    bmesh.ops.mirror(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], axis="X", merge_dist=1e-5)
    made = [v for v in bm.verts if v not in before]
    for v in made:
        weights = list(v[layer].items())
        v[layer].clear()
        for g, w in weights:
            v[layer][swap.get(g, g)] = w
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    count = len(bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return count, len(made)


def run(state, step):
    arm, obj = state.armature, state.mesh
    if arm is None:
        raise ValueError("repose needs a bound mesh: put it after bind")
    targets = {b["name"]: (st.from_asset(b["head"]), st.from_asset(b["tail"])) for b in step["to"]}
    missing = sorted(b.name for b in arm.data.bones if b.name not in targets)
    if missing:
        raise ValueError(f"repose has no target for bone(s) {missing}")
    st.activate(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm.data.edit_bones:
        eb.inherit_scale = "NONE"
        eb.use_connect = False
    bpy.ops.object.mode_set(mode="POSE")
    worst, worst_bone = 0.0, ""
    for pb in sorted(arm.pose.bones, key=lambda p: depth(p.bone)):
        head, tail = targets[pb.name]
        rest = pb.bone
        d0 = rest.tail_local - rest.head_local
        d1 = tail - head
        if d1.length < 1e-7:
            raise ValueError(f"repose target of bone {pb.name!r} has no length")
        q = d0.rotation_difference(d1)
        turn = math.degrees(q.angle)
        if turn > worst:
            worst, worst_bone = turn, pb.name
        scale = Matrix.Diagonal((1.0, d1.length / d0.length, 1.0, 1.0))
        pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ rest.matrix_local.to_3x3().to_4x4() @ scale
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    mods = [m for m in obj.modifiers if m.type == "ARMATURE"]
    if len(mods) != 1:
        raise ValueError(f"repose expects one Armature modifier on the shell, found {len(mods)}")
    st.apply_modifier(obj, mods[0])
    st.activate(arm)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    again = obj.modifiers.new("Armature", "ARMATURE")
    again.object = arm
    off = max((arm.data.bones[n].head_local - h).length for n, (h, _) in targets.items())
    if off > 1e-4:
        raise ValueError(f"repose left a bone {off * 1000:.2f} mm from its target")
    obj.data.update()
    facts = {"bones": len(targets), "largestTurn": round(worst, 2), "at": worst_bone, "offTarget": round(off, 7)}
    if step.get("mirror"):
        residual = mirror_residual(obj, arm)
        facts["mirrorResidual"] = round(residual, 5)
        facts["mirrored"] = residual <= step["mirrorLimit"]
        if facts["mirrored"]:
            facts["triangles"], facts["mirroredVertices"] = mirror_half(obj, step["mirror"])
    return facts
