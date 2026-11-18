# SPDX-License-Identifier: GPL-2.0-or-later
# Self-test cases for `stroke` and `bake.cageFit` (run by test_steps.py's `selftest`). The stroke
# mesh is a quad tube bent into a U, its legs facing each other 3 cm apart: a brush on one leg must
# leave the other alone. The cage case bakes two touching-close tubes of different colours.

import bpy
import numpy as np

from tasks import common
from tasks.steps import state as st
from tasks.steps import stroke
from tasks.steps.test_steps import (
    EXPORT,
    UV,
    bake,
    expect,
    export_bytes,
    retopo,
    run,
    step_of,
)

A, GAP = 0.05, 0.03  # tube radius, gap between the legs
C = A + GAP / 2  # leg axis, off x = 0
AROUND, ALONG = 192, 260
Z = (0.1, 0.6)  # the stroke's span up the inner face of the leg at -x (Blender frame)
# The inner face of that leg is Blender (-GAP / 2, 0, z), that is asset (0, -GAP / 2, z).
PATH = [[0.0, -GAP / 2, z] for z in np.linspace(Z[0], Z[1], 8).tolist()]
STROKE = {"op": "stroke", "brush": "draw", "path": PATH, "radius": 0.06, "strength": 0.008, "spacing": 0.2}


def bent_tube():
    """The U: returns a mesh object (no transform), ~50 k vertices, 2.0 mm between rings."""
    length = 0.7
    arc = np.pi * C
    s = np.linspace(0, 2 * length + arc, ALONG)
    centre, tangent = np.zeros((ALONG, 3)), np.zeros((ALONG, 3))
    up = s <= length
    down = s >= length + arc
    bend = ~(up | down)
    centre[up] = np.stack((-C * np.ones(up.sum()), np.zeros(up.sum()), s[up]), axis=1)
    tangent[up] = (0, 0, 1)
    t = (s[bend] - length) / C
    centre[bend] = np.stack((-C * np.cos(t), np.zeros(len(t)), length + C * np.sin(t)), axis=1)
    tangent[bend] = np.stack((np.sin(t), np.zeros(len(t)), np.cos(t)), axis=1)
    centre[down] = np.stack((C * np.ones(down.sum()), np.zeros(down.sum()), length - (s[down] - length - arc)), axis=1)
    tangent[down] = (0, 0, -1)
    side = np.array((0.0, 1.0, 0.0))
    normal = np.cross(side, tangent)
    theta = np.linspace(0, 2 * np.pi, AROUND, endpoint=False)
    ring = np.cos(theta)[None, :, None] * normal[:, None, :] + np.sin(theta)[None, :, None] * side[None, None, :]
    verts = (centre[:, None, :] + A * ring).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(ALONG - 1), np.arange(AROUND), indexing="ij")
    k = (j + 1) % AROUND
    quads = np.stack((i * AROUND + j, (i + 1) * AROUND + j, (i + 1) * AROUND + k, i * AROUND + k), axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new("tube")
    me.from_pydata(verts.tolist(), [], quads.tolist())
    me.update()
    return st.link(bpy.data.objects.new("tube", me))


def held(obj):
    state = st.State({}, {}, "")
    state.mesh = obj
    return state


def stroke_step(extra):
    step = {**STROKE, **extra}
    return {k: v for k, v in step.items() if v is not None}


def brush(extra):
    """A fresh tube stroked once; returns (facts, before, after)."""
    common.reset_scene()
    obj = bent_tube()
    before = st.coords(obj).astype(np.float64)
    facts = stroke.run(held(obj), stroke_step(extra))
    return facts, before, st.coords(obj).astype(np.float64)


def refuses(extra, *words):
    common.reset_scene()
    try:
        stroke.run(held(bent_tube()), stroke_step(extra))
    except ValueError as e:
        for w in words:
            expect(w in str(e), f"refused with {w!r}: {str(e)[:80]}")
    else:
        raise AssertionError(f"a stroke that should fail passed: {extra}")


def case_stroke_refusals():
    refuses({"path": [[5.0, 5.0, 5.0]]}, "nowhere near", "fix:")
    ring = 50 / (ALONG - 1) * (2 * 0.7 + np.pi * C)  # a vertex of the inner face: ring 50, first of its ring
    refuses({"path": [[0.0, -GAP / 2, ring]], "radius": 0.001}, "edge length", "fix:")
    refuses({"mask": {"kind": "z", "min": 50, "max": 60, "feather": 0}}, "moved nothing", "fix:")
    fold = [[0.0, -GAP / 2, 0.3], [0.0, -GAP / 2, 0.4]]  # 10 cm along the wall with a 3 cm reach
    refuses({"brush": "grab", "path": fold, "radius": 0.03, "strength": None}, "inside out", "fix:")


def case_stroke_leak():
    facts, before, after = brush({})
    move = np.linalg.norm(after - before, axis=1)
    other = before[:, 0] > 0.0
    expect(int((move[other] > 1e-7).sum()) == 0, f"nothing moved on the facing leg ({facts['moved']} moved on this one)")
    expect(facts["flipped"] == 0, "no triangle turned over")
    mid = (np.abs(before[:, 0] + GAP / 2) < 2e-3) & (np.abs(before[:, 1]) < 2e-3) & (before[:, 2] > Z[0] + 0.1) & (before[:, 2] < Z[1] - 0.1)
    achieved = float(move[mid].mean())
    expect(0.006 < achieved < 0.0095, f"8 mm asked, {achieved * 1000:.2f} mm reached along the path")
    # Euclidean reach would take the facing wall, 3 cm away: the same radius must not.
    expect(float(before[move > 1e-7][:, 0].max()) < 0.0, "the moved set stays on its own leg")


def case_stroke_brushes():
    stamp = np.zeros((9, 9, 3))
    stamp[2:7, 2:7, 2] = 0.1
    cases = (
        ("inflate", {}), ("clay", {}), ("flatten", {"strength": 0.004}), ("crease", {"strength": 0.004}),
        ("pinch", {"strength": 0.004}), ("smooth", {"strength": 0.004}),
        ("grab", {"path": [PATH[3], [PATH[3][0], PATH[3][1] + 0.012, PATH[3][2]]], "strength": None}),
        ("vdm", {"path": [PATH[3]], "stamp": {"size": 9, "grid": stamp.ravel().tolist()}, "strength": 0.01}),
    )
    for name, extra in cases:
        f, before, after = brush({"brush": name, **extra})
        other = np.linalg.norm(after - before, axis=1)[before[:, 0] > 0.0]
        smooth_flat = name in ("flatten", "smooth")  # a smooth round tube barely changes under these
        expect((f["moved"] > 0 or smooth_flat) and f["flipped"] == 0 and float(other.max()) < 1e-7, f"{name}: {f['moved']} moved, max {f['maxMove'] * 1000:.2f} mm, {f['flipped']} flipped")


def case_stroke_rules():
    box = {"kind": "box", "min": [-1, -1, 0.3], "max": [1, 1, 2], "feather": 0}  # keeps z ≥ 0.3
    f, before, after = brush({"mask": box})
    move = np.linalg.norm(after - before, axis=1)
    expect(float(move[before[:, 2] < 0.3].max()) == 0.0 and f["moved"] > 0, "0 masked vertices moved")
    f, before, after = brush({"symmetry": "y"})
    move = np.linalg.norm(after - before, axis=1)
    expect(float(move[before[:, 0] > 0].max()) > 0.006, "symmetry strokes the mirrored leg too")
    a = brush({})[2]
    expect(np.array_equal(a, brush({})[2]), "same stroke, same positions")
    varied = brush({"radius": np.linspace(0.03, 0.08, len(PATH)).tolist()})[0]
    expect(varied["moved"] > 0, f"a radius per point works ({varied['moved']} moved)")


def case_stroke_program():
    common.reset_scene()
    glb = export_bytes(bent_tube())
    r, _ = run([STROKE, retopo(20000, "decimate"), {**STROKE, "radius": 0.12, "strength": 0.002}, EXPORT], glb)
    moved = [s for s in r["steps"] if s["op"] == "stroke"]
    expect(len(moved) == 2 and moved[0]["moved"] > 1000, f"strokes on the source and on the shell: {[m['moved'] for m in moved]}")
    expect(r["lods"][0] <= 20000, "the stroked source retopologises")


def two_tubes():
    """Tubes along Blender Y, 6 mm apart: the -x one red, the +x one blue (vertex colours)."""
    gap, parts = 0.006, []
    for sign, colour in ((-1, (1.0, 0.0, 0.0, 1.0)), (1, (0.0, 0.0, 1.0, 1.0))):
        bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=A, depth=0.6, location=(sign * (A + gap / 2), 0, 0.5), rotation=(np.pi / 2, 0, 0))
        obj = bpy.context.view_layer.objects.active
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.subdivide(number_cuts=3)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.shade_smooth()  # one surface in the GLB: no vertex split along the quads
        layer = obj.data.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        layer.data.foreach_set("color", np.tile(colour, len(obj.data.vertices)).astype(np.float32))
        parts.append(obj)
    common.select_only(parts)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    return export_bytes(bpy.context.view_layer.objects.active)


def wrong_texels():
    """Share of the shell's faces whose baked colour belongs to the other tube."""
    obj = bpy.data.objects["lod0"]
    img = bpy.data.images["t3d_albedo"]
    size = img.size[0]
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(size, size, 4)
    me = obj.data
    uv = np.empty(len(me.loops) * 2, dtype=np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    wrong = total = 0
    for poly in me.polygons:
        at = uv[list(poly.loop_indices)].mean(axis=0)
        x, y = np.minimum((at * size).astype(int), size - 1)
        r, _, b, _ = px[y, x]
        wrong += bool((poly.center.x < 0) != (r > b))
        total += 1
    return wrong / total


def case_cage_fit():
    glb = two_tubes()
    flat = {**bake("albedo"), "size": 512, "cage": 0.02}
    r, _ = run([UV, flat, EXPORT], glb)
    before = wrong_texels()
    expect(before > 0.01 and "cageFit" not in step_of(r, "bake"), f"a flat 20 mm cage bakes the neighbour: {before:.1%} wrong")
    r, _ = run([UV, {**flat, "cageFit": True}, EXPORT], glb)
    after = wrong_texels()
    fit = step_of(r, "bake")["cageFit"]
    expect(after < 0.002 and after < before, f"the fitted cage does not: {after:.2%} wrong, offsets {fit['min']}..{fit['max']} m")
    expect(fit["limited"] > 0 and fit["max"] <= 0.02 and "t3d_bake_cage" not in bpy.data.objects, f"the cage was limited ({fit['limited']:.0%}) and removed")


CASES = (case_stroke_refusals, case_stroke_leak, case_stroke_brushes, case_stroke_rules, case_stroke_program, case_cage_fit)
