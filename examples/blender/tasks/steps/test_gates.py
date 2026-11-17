# SPDX-License-Identifier: GPL-2.0-or-later
# Self-test cases for the step gates (run by test_steps.py's `selftest`): a leaky crust that a
# plain voxel remesh turns into confetti, a fin thinner than a voxel, a bake that reaches half
# its source, a cut-out source, a confetti UV map, and the LOD gate's messages.

import bmesh
import bpy

from tasks import common
from tasks.steps import lods
from tasks.steps.test_steps import CLEAN, EXPORT, UV, bake, blob, expect, export_bytes, retopo, run, step_of


def crust():
    """An ellipsoid crust (two walls 2 mm apart) with a tunnel through it at one tip."""
    common.reset_scene()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=(0, 0, 0.5))
    obj = bpy.context.view_layer.objects.active
    obj.scale = (0.3, 0.8, 0.3)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tip = min(bm.verts, key=lambda v: v.co.y)
    ring = [v for v in bm.verts if (v.co - tip.co).length < 0.02]
    bmesh.ops.delete(bm, geom=ring, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    mod = obj.modifiers.new("crust", "SOLIDIFY")
    mod.thickness = 0.002
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return export_bytes(obj)


def finned():
    """The blob with a 1 mm fin on its back: thinner than any voxel the target asks."""
    common.reset_scene()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=(0, 0, 0.5))
    body = bpy.context.view_layer.objects.active
    body.scale = (0.3, 0.8, 0.3)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.95))
    fin = bpy.context.view_layer.objects.active
    fin.scale = (0.001, 0.6, 0.5)
    fin.rotation_euler = (0.2, 0.0, 0.3)  # off the voxel grid: an aligned sheet erodes cleanly by luck
    common.select_only([body, fin])
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return export_bytes(body)


def confetti():
    """400 loose icosahedra: every one its own UV islands."""
    common.reset_scene()
    bm = bmesh.new()
    for i in range(400):
        made = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.01)
        bmesh.ops.translate(bm, verts=made["verts"], vec=((i % 20) * 0.05, (i // 20) * 0.05, 0))
    me = bpy.data.meshes.new("confetti")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("confetti", me)
    bpy.context.scene.collection.objects.link(obj)
    return export_bytes(obj)


def refused(steps, mesh, *words, skeleton=None):
    try:
        run(steps, mesh, skeleton)
    except Exception as e:  # the message names the step, the measure and a fix
        expect(all(w in str(e) for w in words), f"refused: {str(e)[:150]}")
    else:
        raise AssertionError(f"a program that should fail ({words}) passed")


def case_shell():
    r, _ = run([retopo(4000, voxel=0.008), EXPORT], crust())
    s = step_of(r, "retopo")["shell"]
    expect(s["close"] >= 1 and s["tried"][0][0] == 0, f"a leaky crust needs a closing: tried {s['tried']}")
    expect(s["volume"] > 0.7 * s["volumeRef"] and s["largestShare"] > 0.9, f"the shell is filled: {s['volume']} of {s['volumeRef']} m³")
    refused([retopo(4000, voxel=0.008, close=0), EXPORT], crust(), "step 0 (retopo)", "not one filled", "fix:")
    r, _ = run([retopo(6000, close=1), EXPORT], finned())
    s = step_of(r, "retopo")["shell"]
    expect(s["skin"] == 0.75 and s["handles"] <= 16, f"a fin thinner than a voxel survives a closing by a skin: tried {s['tried']}")
    refused([retopo(6000, close=1, skin=0), EXPORT], finned(), "source surface lost", "+z (top)", "fix:")


def case_bake_gates():
    far = {"op": "inflate", "distance": 0.4, "mask": {"kind": "z", "min": 0.5, "max": 9, "feather": 0}}
    refused([retopo(2000), far, UV, bake("albedo"), EXPORT], blob("texture"), "step 3 (bake)", "got no colour", "fix:")
    r, _ = run([retopo(3000), UV, {**bake("albedo"), "maxRay": 0.4}, EXPORT], blob("cutout", doubled=True))
    b = step_of(r, "bake")
    expect(b["albedoMean"] > 0.6, f"rays pass a cut-out shell to the surface beneath (mean {b['albedoMean']})")
    expect(r["glb"]["images"][0]["channels"] == 3, "the albedo PNG is RGB")
    refused([UV, EXPORT], confetti(), "step 0 (uv)", "islands", "fix:")


def case_lod_messages():
    base = {"boundaryEdges": 0, "maxFaceShare": 0.001, "handles": 0, "diag": 1.0, "uvDegenerate": 0.0}
    good = {**base, "bboxDrift": 0.001, "bboxSide": "+z (top)", "lost": {"share": 0.0, "tolerance": 0.01}}
    lods.gate("lod1", 0, good, base)
    expect(True, "a sound LOD passes the gate")
    for change, word in (
        ({"bboxDrift": 0.03, "bboxSide": "-x (back)"}, "moved 0.0300 m on -x (back)"),
        ({"lost": {"share": 0.04, "tolerance": 0.01, "where": "+z (top)", "centre": [0, 0, 1]}}, "around +z (top)"),
        ({"handles": 2}, "2 new tunnel(s)"),
        ({"uvDegenerate": 0.3}, "no UV area"),
        ({"boundaryEdges": 12}, "12 open edges"),
    ):
        try:
            lods.gate("lod2", 1, {**good, **change}, base)
        except ValueError as e:
            expect(word in str(e) and "fix:" in str(e), f"lod gate names it: {word}")
        else:
            raise AssertionError(f"the LOD gate let through {change}")


CASES = (case_lod_messages, case_shell, case_bake_gates)
