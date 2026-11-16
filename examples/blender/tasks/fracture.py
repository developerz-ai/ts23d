# SPDX-License-Identifier: GPL-2.0-or-later
# `fracture`: Voronoi cell fracture (the cell-fracture method: each cell is the mesh cut by the
# bisecting planes to every other seed, caps filled) of a closed mesh into `pieces` named parts
# `piece_000…`, then optionally a rigid-body settle (`settleFrames`) onto a passive ground at
# z = 0. Seeds come from Python's random.Random(seed) inside the mesh bounds, so the same request
# gives the same cells. Bullet runs with fixed substeps and iterations. Outputs: output-0.glb (the
# pieces) and output-1.json (piece names, volumes, centres).

import json
import os
import random

import bmesh
import bpy
from mathutils import Vector

from tasks import common


def seeds(lo, hi, n, rng):
    pad = [(hi[i] - lo[i]) * 0.05 for i in range(3)]
    return [
        Vector([rng.uniform(lo[i] + pad[i], hi[i] - pad[i]) for i in range(3)]) for _ in range(n)
    ]


def cell(source_mesh, points, i):
    """The part of the mesh closer to points[i] than to any other seed; None when empty."""
    bm = bmesh.new()
    bm.from_mesh(source_mesh)
    p = points[i]
    for j, q in enumerate(points):
        if j == i:
            continue
        normal = (q - p).normalized()
        co = (p + q) / 2
        if all((v.co - co).dot(normal) <= 0 for v in bm.verts):
            continue
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=normal, clear_outer=True)
        cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if cut:
            bmesh.ops.holes_fill(bm, edges=cut, sides=0)
        if not bm.verts:
            bm.free()
            return None
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    volume = bm.calc_volume(signed=False)
    if volume <= 1e-9:
        bm.free()
        return None
    mesh = bpy.data.meshes.new(f"cell_{i:03d}")
    bm.to_mesh(mesh)
    bm.free()
    return mesh, volume


def run(request, inputs, work):
    n = int(request.get("pieces", 8))
    settle = int(request.get("settleFrames", 0) or 0)
    if not 2 <= n <= 256:
        raise ValueError(f"pieces {n} is outside 2..256")
    src = common.join(common.import_glb(common.input_file(request, "mesh", inputs)), "source")
    lo, hi = common.bounds(src)
    rng = random.Random(int(request.get("seed", 0)))
    points = seeds(lo, hi, n, rng)
    pieces = []
    for i in range(n):
        made = cell(src.data, points, i)
        if made is None:
            continue
        mesh, volume = made
        name = f"piece_{len(pieces):03d}"
        mesh.name = name
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for slot in src.data.materials:
            mesh.materials.append(slot)
        pieces.append((obj, volume))
    bpy.data.objects.remove(src, do_unlink=True)
    for obj, _ in pieces:
        common.select_only([obj])
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.origin_set(type="ORIGIN_CENTER_OF_VOLUME")
    if settle > 0:
        simulate([o for o, _ in pieces], settle)

    out = os.path.join(work, "output-0.glb")
    common.export_glb(out, [o for o, _ in pieces])
    summary = {
        "pieces": [
            {"name": o.name, "volume": round(v, 7), "centre": [round(x, 4) for x in o.matrix_world.translation]}
            for o, v in pieces
        ],
        "requested": n,
        "settleFrames": settle,
    }
    with open(os.path.join(work, "output-1.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, sort_keys=True)
    return {
        "outputs": [
            {"file": "output-0.glb", "mime": "model/gltf-binary"},
            {"file": "output-1.json", "mime": "application/json"},
        ],
        "stats": {"pieces": len(pieces), "requested": n, "settleFrames": settle},
    }


def simulate(objects, frames):
    """Rigid-body settle on a ground plane; bakes each object's final transform into it."""
    scene = bpy.context.scene
    bpy.ops.rigidbody.world_add()
    world = scene.rigidbody_world
    world.substeps_per_frame = 10
    world.solver_iterations = 20
    world.point_cache.frame_start = 1
    world.point_cache.frame_end = frames
    scene.frame_end = frames
    bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, 0))
    ground = bpy.context.view_layer.objects.active
    common.select_only([ground])
    bpy.ops.rigidbody.object_add(type="PASSIVE")
    for o in objects:
        common.select_only([o])
        bpy.context.view_layer.objects.active = o
        bpy.ops.rigidbody.object_add(type="ACTIVE")
        o.rigid_body.collision_shape = "CONVEX_HULL"
        o.rigid_body.mass = 1.0
    for f in range(1, frames + 1):
        scene.frame_set(f)
    for o in objects:
        common.select_only([o])
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.visual_transform_apply()
        bpy.ops.rigidbody.object_remove()
    bpy.data.objects.remove(ground, do_unlink=True)
