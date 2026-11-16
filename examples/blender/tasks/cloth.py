# SPDX-License-Identifier: GPL-2.0-or-later
# `cloth`: drape a garment GLB on a body GLB with Blender's cloth solver. The body is a collision
# object; garment vertices at or above `pinAboveZ` are pinned (shoulders, a pole). Deterministic:
# fixed frames and substeps, no self-collision, one thread, the cache baked frame by frame. The
# draped garment (simulation applied at the last frame) is exported as output-0.glb.

import os

import bpy

from tasks import common


def run(request, inputs, work):
    frames = int(request.get("frames", 48))
    substeps = int(request.get("substeps", 8))
    if not 1 <= frames <= 1000:
        raise ValueError(f"frames {frames} is outside 1..1000")
    garment = common.join(common.import_glb(common.input_file(request, "garment", inputs)), "garment")
    body = common.join(common.import_glb(common.input_file(request, "body", inputs)), "body")

    body.modifiers.new("collision", "COLLISION")
    body.collision.thickness_outer = 0.004
    body.collision.cloth_friction = 5.0

    pinned = 0
    pin_z = request.get("pinAboveZ")
    if pin_z is not None:
        group = garment.vertex_groups.new(name="pin")
        mw = garment.matrix_world
        ids = [v.index for v in garment.data.vertices if (mw @ v.co).z >= float(pin_z)]
        group.add(ids, 1.0, "REPLACE")
        pinned = len(ids)

    cloth = garment.modifiers.new("cloth", "CLOTH")
    s = cloth.settings
    s.quality = substeps
    s.mass = 0.3
    s.tension_stiffness = 15.0
    s.compression_stiffness = 15.0
    s.shear_stiffness = 5.0
    s.bending_stiffness = 0.5
    if pinned:
        s.vertex_group_mass = "pin"
    c = cloth.collision_settings
    c.use_collision = True
    c.distance_min = 0.004
    c.use_self_collision = False
    cache = cloth.point_cache
    cache.frame_start = 1
    cache.frame_end = frames

    scene = bpy.context.scene
    scene.frame_end = frames
    rest_lo, rest_hi = common.bounds(garment)
    for f in range(1, frames + 1):
        scene.frame_set(f)
    draped = common.evaluated_copy(garment, "garment_draped")
    lo, hi = common.bounds(draped)

    out = os.path.join(work, "output-0.glb")
    common.export_glb(out, [draped])
    return {
        "outputs": [{"file": "output-0.glb", "mime": "model/gltf-binary"}],
        "stats": {
            "vertices": len(draped.data.vertices),
            "pinned": pinned,
            "frames": frames,
            "substeps": substeps,
            "restMinZ": round(rest_lo[2], 4),
            "drapedMinZ": round(lo[2], 4),
            "drapedMaxZ": round(hi[2], 4),
            "restMaxZ": round(rest_hi[2], 4),
        },
    }
