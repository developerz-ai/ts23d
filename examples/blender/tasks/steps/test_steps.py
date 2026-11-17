# SPDX-License-Identifier: GPL-2.0-or-later
# Self-test of the `blender` task's step ops on generated blobs (no input files, ~1 minute):
#   blender -b --factory-startup -noaudio --python examples/blender/tasks/steps/test_steps.py -- selftest
# Not part of `bun run verify` (the gate never starts Blender). Each case writes a source GLB,
# a program with every field filled in (as ts23d's blenderProgram does) and runs tasks/blender.py
# the way the dispatcher does; a failed expectation raises and the process exits non-zero.

import hashlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))

import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

from tasks import blender, common  # noqa: E402

CLEAN = {"op": "clean", "weld": 1e-5, "minShell": 0.002, "fillHoles": 64, "manifold": True}
UV = {"op": "uv", "kind": "smart", "angle": 1.45, "margin": 0.003, "smooth": 30}
EXPORT = {"op": "export"}
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
# glTF frame: the blob lies along +Z (its front), 1.6 m long, centre 0.5 m up.
SKELETON = {
    "contract": "t3d-skeleton/1",
    "frame": "gltf",
    "bones": [
        {"name": "hips", "parent": None, "head": [0, 0.5, -0.7], "tail": [0, 0.5, -0.2]},
        {"name": "spine", "parent": "hips", "head": [0, 0.5, -0.2], "tail": [0, 0.5, 0.3]},
        {"name": "head", "parent": "spine", "head": [0, 0.5, 0.3], "tail": [0, 0.5, 0.75]},
    ],
}


def retopo(n, strategy="shell", reduce="decimate", **more):
    step = {"op": "retopo", "strategy": strategy, "reduce": reduce, "triangles": n, "smooth": 0}
    return {**step, "preserveSymmetry": False, **more}


def bake(*maps):
    return {"op": "bake", "size": 256, "maps": list(maps), "samples": 1, "aoSamples": 8, "margin": 4}


def blob(look, doubled=False):
    """A 20 480-triangle ellipsoid along Blender −Y (glTF +Z), 0.5 m up; returns its GLB bytes."""
    common.reset_scene()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1, location=(0, 0, 0.5))
    obj = bpy.context.view_layer.objects.active
    obj.scale = (0.3, 0.8, 0.3)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if doubled:  # a shell around the shell: its vertices cannot see a bone, bone heat gives up on them
        bpy.ops.object.duplicate()
        outer = bpy.context.view_layer.objects.active
        outer.data.transform(Matrix.Translation((0, 0, 0.5)) @ Matrix.Scale(1.15, 4) @ Matrix.Translation((0, 0, -0.5)))
        common.select_only([o for o in bpy.data.objects if o.type == "MESH"])
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
    if look == "cutout":  # outer shell black and fully transparent, inner body white
        cut_out(obj)
    if look == "texture":
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.uv.smart_project()
        bpy.ops.object.mode_set(mode="OBJECT")
        img = bpy.data.images.new("src", 64, 64)
        img.generated_type = "COLOR_GRID"
        img.pack()
        mat = bpy.data.materials.new("src")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = img
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = 1.0  # a DIFFUSE bake of this is black
        obj.data.materials.append(mat)
    elif look == "vertex-colour":
        layer = obj.data.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        for d in layer.data:
            d.color = (0.8, 0.3, 0.1, 1.0)
    return export_bytes(obj)


def export_bytes(obj, *more, animations=False):
    path = os.path.join(tempfile.mkdtemp(prefix="t3d-selftest-"), "src.glb")
    common.export_glb(path, [obj, *more], animations=animations, skins=animations)
    with open(path, "rb") as f:
        return f.read()


def cut_out(obj):
    """Material 0 (the inner body) white; material 1 on the outer shell black with alpha 0."""
    img = bpy.data.images.new("cut", 8, 8, alpha=True)
    img.pixels.foreach_set([0.0] * (8 * 8 * 4))
    img.pack()
    for name, colour in (("inner", (0.9, 0.9, 0.9, 1)), ("outer", (0, 0, 0, 1))):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = colour
        if name == "outer":
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.blend_method = "BLEND"
        obj.data.materials.append(mat)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project()
    bpy.ops.object.mode_set(mode="OBJECT")
    half = len(obj.data.polygons) // 2
    for p in obj.data.polygons:
        p.material_index = 1 if p.index >= half else 0


def run(steps, mesh=None, skeleton=None, cap=100_000):
    """Run a program like ts23d_job.py does; returns (report, work dir)."""
    work = tempfile.mkdtemp(prefix="t3d-selftest-")
    request, inputs = {"seed": 7, "maxTriangles": cap}, {}

    def send(field, data, ext):
        sha = hashlib.sha256(data).hexdigest()
        inputs[sha] = os.path.join(work, f"in-{sha[:16]}.{ext}")
        with open(inputs[sha], "wb") as f:
            f.write(data)
        request[field] = {"sha256": sha, "mime": "x"}

    send("program", json.dumps({"contract": "t3d-blender-steps/1", "frame": "asset", "steps": steps}).encode(), "json")
    if mesh is not None:
        send("mesh", mesh, "glb")
    if skeleton is not None:
        send("skeleton", json.dumps(skeleton).encode(), "json")
    common.reset_scene()
    blender.run(request, inputs, work)
    with open(os.path.join(work, "output-1.json"), encoding="utf-8") as f:
        return json.load(f), work


def expect(ok, what):
    if not ok:
        raise AssertionError(what)
    print("  ok:", what)


def step_of(report, op):
    return next(s for s in report["steps"] if s["op"] == op)


def case_full():
    bind = {"op": "bind", "from": "skeleton", "maxInfluences": 4}
    lods = {"op": "lods", "triangles": [1500, 400]}
    steps = [CLEAN, retopo(4000), UV, bake("albedo", "normal", "ao", "roughness"), bind, lods, EXPORT]
    r, _ = run(steps, blob("texture"), SKELETON)
    b = step_of(r, "bake")
    expect(r["lods"][0] <= 4000 and r["lods"][1] <= 1500 and r["lods"][2] <= 400, f"three LODs {r['lods']}")
    expect(b["hitRate"] > 0.98, f"bake hit rate {b['hitRate']}")
    expect(b["albedoFrom"] == "texture" and b["albedoMean"] > 0.1, f"albedo from the texture, not black ({b['albedoMean']})")
    expect(r["glb"]["meshNodes"] == ["lod0", "lod1", "lod2"], "nodes lod0, lod1, lod2")
    expect(len(r["glb"]["images"]) == 3 and all(i["mime"] == "image/png" for i in r["glb"]["images"]), "3 PNG images")
    want = ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture"]
    expect(r["glb"]["materials"][0]["textures"] == want, f"one material with {want}")
    expect(sorted(r["glb"]["joints"]) == ["head", "hips", "spine"], f"joints are the bones {r['glb']['joints']}")
    expect(r["bind"]["method"] == "bone-heat" and r["bind"]["maxInfluences"] <= 4, "bone heat, <= 4 influences")


def case_looks():
    for look, origin in (("vertex-colour", "vertex-colour"), ("none", "flat")):
        r, _ = run([retopo(2000), UV, bake("albedo"), EXPORT], blob(look))
        b = step_of(r, "bake")
        expect(b["albedoFrom"] == origin and b["albedoMean"] > 0.1, f"source look {look!r} bakes from {origin}: {b['albedoFrom']}, mean {b['albedoMean']}, cover {b['uvCoverage']}")
    r, _ = run([retopo(2000, "decimate"), EXPORT], blob("texture"))
    expect(len(r["glb"]["images"]) == 1, "a subset without uv/bake keeps the source's own texture")


def case_focus():
    # The ball holds the front fifth of the blob: a uniform collapse would leave it ~20 % of the vertices.
    focus = [{"at": [0.6, 0, 0.5], "r": 0.25, "weight": 3}]
    r, _ = run([retopo(1500, focus=focus), EXPORT], blob("none"))
    share = step_of(r, "retopo")["focusVertexShare"]
    expect(0.3 < share < 0.6, f"focus weight 3 keeps about 3x the density in its ball ({share} of the vertices)")
    expect(step_of(r, "retopo")["boundaryEdges"] == 0, "the shell is closed")


def case_proxy():
    r, _ = run([retopo(6000, "decimate"), {"op": "bind", "from": "skeleton", "maxInfluences": 4}, EXPORT], blob("none", doubled=True), SKELETON)
    expect(r["bind"]["method"] == "proxy-transfer", f"bone heat failed ({r['bind']['heatUnweighted']}), proxy used")
    expect(r["bind"]["weightSum"][0] > 0.99, "every vertex weighted after the transfer")


def case_build():
    balls = [{"at": [0, 0, 0.5], "r": 0.5, "stiffness": 2, "negative": False},
             {"at": [0.5, 0, 0.6], "r": 0.4, "stiffness": 2, "negative": False}]
    mask = {"kind": "z", "min": 0.5, "max": 2, "feather": 0.1}
    steps = [
        {"op": "metaballs", "balls": balls, "resolution": 0.03},
        {"op": "voxelRemesh", "voxel": 0.02, "adaptivity": 0},
        {"op": "displace", "strength": 0.03, "scale": 0.1, "kind": "musgrave", "seed": 3, "mask": mask},
        {"op": "smooth", "iterations": 2, "factor": 0.5, "kind": "corrective"},
        {"op": "smooth", "iterations": 1, "factor": 0.5, "kind": "laplacian"},
        {"op": "inflate", "distance": 0.005},
        retopo(3000, "decimate", "quadriflow"),
        {"op": "uv", "kind": "unwrap", "angle": 1.2, "margin": 0.003, "smooth": 10},
        bake("normal"),
        EXPORT,
    ]
    r, _ = run(steps)
    expect(0 < r["lods"][0] <= 3000, f"metaballs → quadriflow shell {r['lods'][0]}")
    b = step_of(r, "bake")
    expect(b["hitRate"] > 0.9, f"normal bake from the displaced source, hit rate {b['hitRate']} cover {b['uvCoverage']}")
    bones = [{"head": [0, 0.1, 0.5], "tail": [0.5, 0.1, 0.5], "r0": 0.2, "r1": 0.15},
             {"head": [0.5, 0.1, 0.5], "tail": [0.8, 0.1, 0.8], "r0": 0.15, "r1": 0.1}]
    turn = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    steps = [
        {"op": "skinBody", "bones": bones, "subdiv": 2},
        {"op": "symmetrize", "axis": "y", "side": "+"},
        {"op": "transform", "matrix": turn},
        EXPORT,
    ]
    r, _ = run(steps)
    lo, hi = r["bbox"]["min"], r["bbox"]["max"]
    # Asset +X (front) turned to asset +Y (left) = glTF +X: the body now runs along glTF X.
    expect(hi[0] - lo[0] > hi[2] - lo[2], f"skinBody, symmetrize, transform: bbox {lo} .. {hi}")


def case_refusals():
    for steps, mesh, word in (
        ([CLEAN], blob("none"), "export"),
        ([CLEAN, EXPORT], None, "skinBody or metaballs"),
        ([{"op": "bind", "from": "skeleton", "maxInfluences": 4}, EXPORT], blob("none"), "request.skeleton"),
        ([{"op": "voxelRemesh", "voxel": 1e-5, "adaptivity": 0}, EXPORT], blob("none"), "voxels per side"),
    ):
        try:
            run(steps, mesh)
        except Exception as e:  # the message must name the problem
            expect(word in str(e), f"refused: {str(e)[:90]}")
        else:
            raise AssertionError(f"a program that should fail ({word}) passed")


if __name__ == "__main__":
    if sys.argv[-1] != "selftest":
        raise SystemExit("usage: blender -b --factory-startup --python test_steps.py -- selftest")
    from tasks.steps import test_finish, test_gates, test_limbs

    cases = (case_refusals, case_full, case_looks, case_focus, case_proxy, case_build, *test_gates.CASES, *test_finish.CASES, *test_limbs.CASES)
    for case in cases:
        print(case.__name__)
        case()
    print("SELFTEST OK", bpy.app.version_string)
