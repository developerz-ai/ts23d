# SPDX-License-Identifier: GPL-2.0-or-later
# Self-test cases for the finishing ops (run by test_steps.py's `selftest`): `script`, `joint`,
# `weights`, `review`, and a source that arrives rigged with two clips carried through `bind`
# from 'source' to every LOD and the exported GLB.

import math
import os

import bpy

from tasks import common
from tasks.steps import bind
from tasks.steps.test_gates import refused
from tasks.steps.test_steps import EXPORT, SKELETON, UV, bake, blob, expect, export_bytes, retopo, run, step_of

BIND = {"op": "bind", "from": "skeleton", "maxInfluences": 4}
TOP = {"kind": "plane", "point": [0.35, 0, 0], "normal": [-1, 0, 0], "feather": 0}  # in front of x = 0.35


def rigged():
    """The blob skinned to the three test bones, with clips 'Idle' (1 s) and 'Walk' (2 s)."""
    common.reset_scene()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=(0, 0, 0.5))
    obj = bpy.context.view_layer.objects.active
    obj.scale = (0.3, 0.8, 0.3)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    arm = bind.build_armature(SKELETON)
    bind.heat(obj, arm)
    arm.animation_data_create()
    for name, frames in (("Idle", 24), ("Walk", 48)):
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        bone = arm.pose.bones["spine"]
        bone.rotation_mode = "XYZ"
        for frame, angle in ((1, 0.0), (1 + frames // 2, 0.5), (1 + frames, 0.0)):
            bone.rotation_euler = (angle, 0, 0)
            bone.keyframe_insert("rotation_euler", frame=frame)
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action)
    return export_bytes(obj, arm, animations=True)


def case_script():
    grow = "import numpy as np\nco = np.array([v.co[:] for v in obj.data.vertices])\nfor v in obj.data.vertices:\n    v.co.z *= 1.1\nprint('grown', len(co))"
    step = {"op": "script", "python": grow, "why": "taller back"}
    r, _ = run([retopo(2000), step, EXPORT], blob("none"))
    s = step_of(r, "script")
    expect(s["moved"] > 0.01 and s["stdout"][0].startswith("grown ") and len(s["sha256"]) == 64, f"a script moves the mesh and is recorded: {s['moved']} m, {s['stdout']}")
    gone = {"op": "script", "python": "bpy.data.objects.remove(obj)", "why": "break it"}
    refused([retopo(2000), gone, EXPORT], blob("none"), "step 1 (script)", "left no mesh", "fix:")
    empty = {"op": "script", "python": "obj.data.clear_geometry()", "why": "break it"}
    refused([retopo(2000), empty, EXPORT], blob("none"), "step 1 (script)", "no faces")
    retopologise = {"op": "script", "python": "m = obj.modifiers.new('d', 'DECIMATE'); m.ratio = 0.5\nbpy.context.view_layer.objects.active = obj\nbpy.ops.object.modifier_apply(modifier='d')", "why": "break the maps"}
    refused([retopo(2000), UV, bake("albedo"), retopologise, EXPORT], blob("texture"), "step 3 (script)", "after the bake")
    # Same loop count, other UVs: the maps would sit on the wrong surface.
    smear = {"op": "script", "python": "for d in obj.data.uv_layers.active.data:\n    d.uv = (0.5, 0.5)", "why": "break the maps"}
    refused([retopo(2000), UV, bake("albedo"), smear, EXPORT], blob("texture"), "step 3 (script)", "the UVs after the bake")
    # Moving vertices after a bake stays allowed.
    nudge = {"op": "script", "python": "for v in obj.data.vertices:\n    v.co.z += 0.001", "why": "lift"}
    r, _ = run([retopo(2000), UV, bake("albedo"), nudge, EXPORT], blob("texture"))
    expect(step_of(r, "script")["moved"] > 0, "a script may still move vertices after the bake")


def case_rigfix():
    joint = {"op": "joint", "bone": "head", "tail": [0.78, 0, 0.6]}
    weights = {"op": "weights", "kind": "assign", "bone": "head", "mask": TOP, "value": 1, "iterations": 2}
    smooth = {**weights, "kind": "smooth", "iterations": 4}
    r, _ = run([retopo(3000), joint, BIND, weights, smooth, EXPORT], blob("none"), SKELETON)
    expect(step_of(r, "joint")["moved"] == ["tail"], "joint moves the head bone's tail before bind")
    w = step_of(r, "weights")
    expect(w["changed"] > 0 and w["meanAfter"] > 0.99 > w["meanBefore"], f"weights assign: mean {w['meanBefore']} → {w['meanAfter']} on {w['masked']} vertices")
    expect(r["steps"][4]["changed"] > 0 and r["bind"]["maxInfluences"] <= 4, "weights smooth changes the border, influences stay limited")
    nowhere = {**weights, "mask": {"kind": "box", "min": [5, 5, 5], "max": [6, 6, 6], "feather": 0}}
    refused([retopo(3000), BIND, nowhere, EXPORT], blob("none"), "step 2 (weights)", "changed nothing", "fix:", skeleton=SKELETON)
    refused([retopo(3000), {**joint, "bone": "tail"}, BIND, EXPORT], blob("none"), "step 1 (joint)", "no bone 'tail'", skeleton=SKELETON)


def case_review():
    poses = [{"bone": "head", "axis": "x", "degrees": 40}, {"bone": "spine", "axis": "z", "degrees": -30}]
    look = {"op": "review", "views": ["clay", "wire", "weights", "poses", "turnaround"], "size": 256, "poses": poses}
    r, work = run([retopo(3000), UV, bake("albedo"), BIND, look, EXPORT], blob("texture"), SKELETON)
    files = {v["view"]: v for v in r["review"]}
    expect(sorted(files) == ["clay", "poses", "turnaround", "weights", "wire"], f"five review sheets: {sorted(files)}")
    expect(all(os.path.getsize(os.path.join(work, v["file"])) > 2000 for v in files.values()), "every sheet is a real PNG")
    expect(files["clay"]["size"][0] > 4 * 128 and len(files["poses"]["tiles"]) == 3, f"clay is four tiles wide, poses = rest + 2: {files['poses']['tiles']}")
    expect(len(files["weights"]["tiles"]) == 3, f"one weight tile per bone: {files['weights']['tiles']}")
    expect(r["glb"]["meshNodes"] == ["lod0"] and math.isfinite(r["seconds"]), "the review left the mesh exportable")


def case_source_rig():
    keep = {"op": "bind", "from": "source", "maxInfluences": 4}
    steps = [retopo(3000), UV, bake("albedo"), keep, {"op": "lods", "triangles": [1000, 300]}, EXPORT]
    r, _ = run(steps, rigged())
    rig = r["source"]["rig"]
    expect(rig["bones"] == 3 and [c["name"] for c in rig["clips"]] == ["Idle", "Walk"], f"the source's rig is kept: {rig}")
    expect(r["bind"]["method"] == "source-transfer" and r["bind"]["weightSum"][0] > 0.99, f"weights come from the source: {r['bind']}")
    clips = {a["name"]: a["seconds"] for a in r["glb"]["animations"]}
    expect(sorted(clips) == ["Idle", "Walk"] and abs(clips["Idle"] - 1) < 0.05 and abs(clips["Walk"] - 2) < 0.05, f"both clips exported with their lengths: {clips}")
    expect(r["glb"]["skins"] >= 1 and sorted(r["glb"]["joints"]) == ["head", "hips", "spine"], f"three LODs on the source skeleton: {r['glb']['joints']}")
    refused([retopo(3000), keep, EXPORT], blob("none"), "step 1 (bind)", "no skinned mesh", "fix:")


CASES = (case_script, case_rigfix, case_review, case_source_rig)
