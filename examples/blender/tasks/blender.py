# SPDX-License-Identifier: GPL-2.0-or-later
# `blender`: run an ordered step program (t3d-blender-steps/1 JSON, written by ts23d's
# `blenderProgram`) on the request's mesh GLB — or on nothing, when the program starts with a
# build op — and write output-0.glb (nodes lod0..2, baked PNG maps, a skin when bound) and
# output-1.json, the t3d-blender-report/1: per step { op, seconds, triangles, facts }, the bake
# hit rate and device, the bind method, LOD triangles, bbox, what the GLB holds — then one PNG per
# view of every `review` step (report.review names them). After each step the result is gated
# (steps/gates.py `whole`), on top of the step's own gates.
# Ops live in tasks/steps/; fields arrive with their defaults filled in by ts23d, so a missing
# field here is an error, never a second default. Threads: request.params.threads (1; 0 = all).

import json
import os
import time

import bpy

from tasks import common
from tasks.steps import BUILD, OPS, gates, io
from tasks.steps import state as st


def read_json(request, field, inputs):
    with open(common.input_file(request, field, inputs), encoding="utf-8") as f:
        return json.load(f)


def open_state(request, inputs, work, builds):
    """Scene threads, the State, the source mesh and the skeleton: what every program starts from."""
    threads = int((request.get("params") or {}).get("threads", 1))
    scene = bpy.context.scene
    scene.render.threads_mode = "AUTO" if threads == 0 else "FIXED"
    if threads > 0:
        scene.render.threads = threads
    state = st.State(request, inputs, work)
    state.report["blender"] = bpy.app.version_string
    state.report["threads"] = threads
    if request.get("mesh") is not None:
        if builds:
            raise ValueError("the program starts with a build op but request.mesh was sent: drop one")
        state.report["source"] = io.load(state)
    elif not builds:
        raise ValueError("no request.mesh: the program must start with skinBody or metaballs")
    if request.get("skeleton") is not None:
        state.skeleton = read_json(request, "skeleton", inputs)
    return state


def run_step(state, i, step, diag):
    """One step, gated and reported; returns the bbox diagonal the next step is held to."""
    op = step.get("op")
    if op not in OPS:
        raise ValueError(f"step {i}: unknown op {op!r}; known: {sorted(OPS)}")
    t0 = time.time()
    try:
        facts = OPS[op](state, step)
        # every step's result is a whole mesh; a transform may rescale it, the others may not
        diag = gates.whole(state, None if op == "transform" else diag)
    except KeyError as e:
        raise ValueError(f"step {i} ({op}): missing field {e}") from e
    except Exception as e:
        raise RuntimeError(f"step {i} ({op}): {e}") from e
    state.report["steps"].append(
        {"op": op, "seconds": round(time.time() - t0, 2), "triangles": st.triangles(state.mesh), **facts}
    )
    return diag


def run(request, inputs, work):
    program = read_json(request, "program", inputs)
    if program.get("contract") != "t3d-blender-steps/1" or program.get("frame") != "asset":
        raise ValueError(f"program contract {program.get('contract')!r} is not t3d-blender-steps/1 (asset frame)")
    steps = program.get("steps") or []
    if not steps or steps[-1].get("op") != "export":
        raise ValueError("the program does not end with an export step")
    state = open_state(request, inputs, work, steps[0].get("op") in BUILD)

    started = time.time()
    diag = None
    for i, step in enumerate(steps):
        diag = run_step(state, i, step, diag)
    state.report["seconds"] = round(time.time() - started, 2)
    cap = request.get("maxTriangles")
    if isinstance(cap, (int, float)) and state.report["lods"][0] > cap:
        raise ValueError(f"lod0 has {state.report['lods'][0]} triangles, over maxTriangles {cap}: add or lower retopo")
    with open(os.path.join(work, "output-1.json"), "w", encoding="utf-8") as f:
        json.dump(state.report, f, indent=2, sort_keys=True)
    return {
        "outputs": [
            {"file": "output-0.glb", "mime": "model/gltf-binary"},
            {"file": "output-1.json", "mime": "application/json"},
            *({"file": r["file"], "mime": "image/png"} for r in state.report.get("review", [])),
        ],
        "stats": {"lods": state.report["lods"], "seconds": state.report["seconds"]},
    }
