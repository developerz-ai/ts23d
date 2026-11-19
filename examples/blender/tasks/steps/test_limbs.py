# SPDX-License-Identifier: GPL-2.0-or-later
# Self-test cases for the limb ops (run by test_steps.py's `selftest`): `unweb` on two posts fused
# by a remesh, `amputate` on one end of the blob, `repose` turning the blob's head bone (with and
# without the gated mirror), `isolate` with `contact` on a chain fused to the body along its
# length, and their refusals.

import math
import os

import bpy
import numpy as np

from tasks import common
from tasks.steps.test_finish import BIND
from tasks.steps.rigfix import CONTACT_JUMP
from tasks.steps.test_steps import CLEAN, EXPORT, SKELETON, blob, expect, export_bytes, retopo, run, step_of


def posts():
    """Two upright posts (r = 5 cm, 0.6 m, 9 cm apart) fused into one surface by a voxel remesh."""
    common.reset_scene()
    made = []
    for x in (-0.045, 0.045):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.05, depth=0.6, location=(x, 0, 0.3))
        made.append(bpy.context.view_layer.objects.active)
    common.select_only(made)
    bpy.context.view_layer.objects.active = made[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    mod = obj.modifiers.new("fuse", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = 0.008
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return export_bytes(obj)


def refused(steps, mesh, *needles, skeleton=None):
    try:
        run(steps, mesh, skeleton)
    except Exception as e:  # the job wraps the op's error with its step
        text = str(e)
        expect(all(n in text for n in needles), f"refused with {needles}: {text[:120]}")
        return
    raise AssertionError(f"not refused: {needles}")


def case_unweb():
    # Asset +y is Blender +x: the posts stand at asset y = ±0.045.
    limbs = [[{"head": [0, y, 0.02], "tail": [0, y, 0.58], "r": 0.05}] for y in (0.045, -0.045)]
    r, _ = run([CLEAN, {"op": "unweb", "limbs": limbs, "gap": 0.02}, EXPORT], posts())
    u = step_of(r, "unweb")
    expect(u["webFaces"] > 0 and list(u["pairs"]) == ["0 + 1"], f"faces joining the two posts are found: {u['pairs']}")
    expect(u["capFaces"] > 0 and u["moved"] > 0, f"each side is capped and pushed apart: {u['capFaces']} caps, {u['moved']} moved")
    far = [[{"head": [5, y, 0], "tail": [5, y, 1], "r": 0.05}] for y in (0.045, -0.045)]
    r, _ = run([CLEAN, {"op": "unweb", "limbs": far, "gap": 0.02}, EXPORT], posts())
    expect(step_of(r, "unweb")["webFaces"] == 0, "limbs that claim nothing cut nothing")


def case_amputate():
    whole, _ = run([EXPORT], blob("none"))
    # The blob's front end (asset +x): everything within 0.3 m of a point on its nose.
    limb = [[{"head": [0.7, 0, 0.5], "tail": [0.8, 0, 0.5], "r": 0.2}]]
    r, _ = run([CLEAN, {"op": "amputate", "limbs": limb}, EXPORT], blob("none"))
    a = step_of(r, "amputate")
    expect(a["faces"] > 0 and a["capFaces"] > 0, f"the end is cut off and the stump closed: {a}")
    expect(r["bbox"]["max"][2] < whole["bbox"]["max"][2] - 0.1, f"the blob is shorter in front: {r['bbox']['max']}")
    refused([{"op": "amputate", "limbs": [[{"head": [0, 0, 0.5], "tail": [0, 0, 0.5], "r": 5}]]}, EXPORT], blob("none"), "step 0 (amputate)", "no faces")


def case_contact():
    # One fused post is the body, the other a chain hanging against it (asset y = ∓0.045; the
    # skeleton is in the glTF frame: asset (x, y, z) = glTF (y, z, x)).
    skeleton = {
        "contract": "t3d-skeleton/1",
        "frame": "gltf",
        "bones": [
            {"name": "body", "parent": None, "head": [0.045, 0.6, 0], "tail": [0.045, 0, 0]},
            {"name": "tail_0", "parent": "body", "head": [-0.045, 0.6, 0], "tail": [-0.045, 0.3, 0]},
            {"name": "tail_1", "parent": "tail_0", "head": [-0.045, 0.3, 0], "tail": [-0.045, 0, 0]},
        ],
    }
    chain = {"op": "isolate", "bones": ["tail_0", "tail_1"], "from": [0, -0.045, 0], "point": [0, -0.045, 0.55], "normal": [0, 0, -1], "r": 0.06, "feather": 0.03, "maxShare": 0.9}
    r, work = run([CLEAN, BIND, chain, EXPORT], posts(), skeleton)
    expect("contact" not in step_of(r, "isolate"), "without `contact` the chain's weights stop at a hard edge, as before")
    hard = chain_jumps(work, ["tail_0", "tail_1"])
    expect(hard[1] > 0, f"unblended, chain skin meets body skin across a hard edge: {hard}")
    r, work = run([CLEAN, BIND, {**chain, "contact": 0.03}, EXPORT], posts(), skeleton)
    c = step_of(r, "isolate")["contact"]
    expect(c["edges"] > 0 and c["vertices"] > c["edges"], f"edges joining chain skin to body skin are found and a band round them blended: {c}")
    expect(r["glb"]["skins"] == 1, "the skin is kept")
    # The exported skin, not the step's report: the blend must actually soften the jump (D350).
    soft = chain_jumps(work, ["tail_0", "tail_1"])
    expect(soft[1] < hard[1] / 2 and soft[0] < hard[0], f"contact softens the chain-weight jump on the exported mesh: largest, edges over {CONTACT_JUMP}: {hard} → {soft}")


def chain_jumps(work, bones):
    """(largest jump, edges jumping over CONTACT_JUMP) of the chain's weight share across the
    edges of the exported mesh (output-0.glb in `work`)."""
    common.reset_scene()
    objs = [o for o in common.meshes(common.import_glb(os.path.join(work, "output-0.glb"))) if set(bones) <= {g.name for g in o.vertex_groups}]
    expect(len(objs) == 1, f"one mesh skinned to {bones} exported: {[o.name for o in objs]}")
    obj = objs[0]
    index = {g.index: g.name for g in obj.vertex_groups}
    share = np.zeros(len(obj.data.vertices))
    for v in obj.data.vertices:
        total = sum(g.weight for g in v.groups)
        chain = sum(g.weight for g in v.groups if index[g.group] in bones)
        share[v.index] = chain / total if total > 0 else 0
    edges = np.empty(len(obj.data.edges) * 2, dtype=np.int32)
    obj.data.edges.foreach_get("vertices", edges)
    a, b = edges.reshape(-1, 2).T
    jump = np.abs(share[a] - share[b])
    return round(float(jump.max()), 4), int((jump > CONTACT_JUMP).sum())


def target(yaw):
    """SKELETON in the asset frame, the head bone yawed `yaw` degrees to the animal's left."""
    a = math.radians(yaw)
    return [
        {"name": "hips", "head": [-0.7, 0, 0.5], "tail": [-0.2, 0, 0.5]},
        {"name": "spine", "head": [-0.2, 0, 0.5], "tail": [0.3, 0, 0.5]},
        {"name": "head", "head": [0.3, 0, 0.5], "tail": [0.3 + 0.45 * math.cos(a), 0.45 * math.sin(a), 0.5]},
    ]


def case_repose():
    steps = [retopo(3000, "decimate"), BIND, {"op": "repose", "to": target(20)}, EXPORT]
    r, _ = run(steps, blob("none"), SKELETON)
    p = step_of(r, "repose")
    expect(abs(p["largestTurn"] - 20) < 0.5 and p["at"] == "head", f"the head bone turns 20°: {p}")
    expect(p["offTarget"] < 1e-4 and r["glb"]["skins"] >= 1, f"the rest is the target and the skin is kept: {p['offTarget']}")
    mirrored = [retopo(3000, "decimate"), BIND, {"op": "repose", "to": target(0), "mirror": "+", "mirrorLimit": 0.05}, EXPORT]
    r, _ = run(mirrored, blob("none"), SKELETON)
    p = step_of(r, "repose")
    expect(p["mirrored"] and p["mirrorResidual"] < 0.05, f"a symmetric body is mirrored: residual {p['mirrorResidual']}")
    leaning = [retopo(3000, "decimate"), BIND, {"op": "repose", "to": target(25), "mirror": "+", "mirrorLimit": 0.02}, EXPORT]
    r, _ = run(leaning, blob("none"), SKELETON)
    p = step_of(r, "repose")
    expect(not p["mirrored"] and p["mirrorResidual"] > 0.02, f"a head off the plane is NOT mirrored: residual {p['mirrorResidual']}")
    refused([retopo(3000, "decimate"), {"op": "repose", "to": target(0)}, EXPORT], blob("none"), "step 1 (repose)", "bind")
    refused([retopo(3000, "decimate"), BIND, {"op": "repose", "to": target(0)[:2]}, EXPORT], blob("none"), "step 2 (repose)", "no target", skeleton=SKELETON)


CASES = (case_unweb, case_amputate, case_contact, case_repose)
