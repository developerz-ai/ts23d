# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `script`: an agent's own bpy code on the working mesh, as a recorded step. The source
# text runs with `obj` (the working mesh), `source` (the bake source, or None), `arm` (the
# armature, or None), `bpy`, `bmesh`, `mathutils` and `np` in scope, and must leave one mesh
# object in `obj` (assign it to swap the mesh). The text is part of the program JSON, so of the
# cache key; the report keeps its sha256, its `why` and the tail of what it printed. Not a
# sandbox (a recipe is code): no network, no files outside the job directory, by convention.
# Gated after the run: a live mesh with faces, weights intact when bound, the UV'd topology
# unchanged once maps are baked.

import contextlib
import hashlib
import io

import bmesh
import bpy
import mathutils
import numpy as np

from tasks.steps import bind
from tasks.steps import state as st

TAIL_LINES = 20


def alive(obj):
    try:
        return isinstance(obj, bpy.types.Object) and obj.type == "MESH" and obj.name in bpy.data.objects
    except ReferenceError:
        return False


def layout(obj):
    """What a bake is attached to: each loop's vertex, each face's loops, each loop's UV."""
    me = obj.data
    vertex = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", vertex)
    start = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_start", start)
    total = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_total", total)
    uv = np.zeros(len(me.loops) * 2, dtype=np.float32)
    if me.uv_layers.active is not None:
        me.uv_layers.active.data.foreach_get("uv", uv)
    return vertex, start, total, uv


def same_layout(a, b):
    return (
        all(x.shape == y.shape for x, y in zip(a, b))
        and all(np.array_equal(x, y) for x, y in zip(a[:3], b[:3]))
        and bool(np.allclose(a[3], b[3], atol=1e-6))
    )


def run(state, step):
    before = state.mesh
    loops, verts = len(before.data.loops), st.coords(before).copy()
    baked = layout(before) if state.images else None
    scope = {
        "bpy": bpy,
        "bmesh": bmesh,
        "mathutils": mathutils,
        "np": np,
        "obj": before,
        "source": state.shape_src or state.colour_src,
        "arm": state.armature,
    }
    out = io.StringIO()
    code = compile(step["python"], "<blender script step>", "exec")
    with contextlib.redirect_stdout(out):
        exec(code, scope)  # noqa: S102 - the recipe's own code, by design
    obj = scope.get("obj")
    if not alive(obj):
        raise ValueError(
            "the script left no mesh in `obj` (deleted, or not a mesh object). "
            "fix: keep the working mesh, or assign the replacement to `obj`"
        )
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    if not obj.data.polygons:
        raise ValueError("the script left a mesh with no faces. fix: check what it deletes")
    if state.images and (len(obj.data.loops) != loops or not same_layout(baked, layout(obj))):
        raise ValueError(
            "the script changed the topology or the UVs after the bake: the maps no longer fit. "
            "fix: move the script before uv, or only move vertices"
        )
    state.mesh = obj
    facts = {
        "why": step["why"],
        "sha256": hashlib.sha256(step["python"].encode("utf-8")).hexdigest(),
        "stdout": out.getvalue().splitlines()[-TAIL_LINES:],
        "vertices": [len(verts), len(obj.data.vertices)],
    }
    after = st.coords(obj)
    if len(after) == len(verts):
        facts["moved"] = round(float(np.linalg.norm(after - verts, axis=1).max()), 6)
    if state.armature is not None:
        bones = {b.name for b in state.armature.data.bones}
        total, _ = bind.weight_sums(obj, bones)
        if (total <= 0).any():
            raise ValueError(
                f"the script left {int((total <= 0).sum())} vertices without a bone weight. "
                "fix: keep the vertex groups (new vertices need weights), or run it before bind"
            )
        bind.limit(obj, state.max_influences)
    return facts
