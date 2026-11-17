# SPDX-License-Identifier: GPL-2.0-or-later
# The step ops of the `blender` task (t3d-blender-steps/1): op name → function(state, step) that
# changes the State and returns facts for the report. One module per op family.

from tasks.steps import bake, bind, build, clean, deform, io, lods, remesh, repose, retopo, review, rigfix, script, unweb, uv

OPS = {
    "transform": clean.transform,
    "clean": clean.clean,
    "symmetrize": clean.symmetrize,
    "amputate": unweb.amputate,
    "unweb": unweb.run,
    "voxelRemesh": remesh.voxel_remesh,
    "smooth": deform.smooth,
    "displace": deform.displace,
    "inflate": deform.inflate,
    "skinBody": build.skin_body,
    "metaballs": build.metaballs,
    "retopo": retopo.run,
    "uv": uv.run,
    "bake": bake.run,
    "joint": rigfix.joint,
    "bind": bind.run,
    "repose": repose.run,
    "weights": rigfix.weights,
    "isolate": rigfix.isolate,
    "script": script.run,
    "review": review.run,
    "lods": lods.run,
    "export": io.run,
}
# Ops that make the mesh: only these may run before there is one.
BUILD = {"skinBody", "metaballs"}
