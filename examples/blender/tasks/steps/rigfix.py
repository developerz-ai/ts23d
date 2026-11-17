# SPDX-License-Identifier: GPL-2.0-or-later
# Step ops that adjust a rig the way a rigger does, as recorded steps: `joint` moves a bone's
# head and / or tail before `bind` (in the skeleton the bind will build, or in the source's own
# armature), `weights` edits one bone's vertex group after `bind` inside a mask — assign a value,
# scale, or smooth — then lets the other bones give way so every vertex still sums to 1, limited
# to the bind's influences. `isolate` gives a free chain (a tail hanging against the hocks, an ear
# on the neck) its own weights: bone heat reads nearness, not anatomy, so skin of the body near
# the chain's bones follows them and the chain follows the body's. The chain's skin is found by
# connection: a flood fill from its tip over the vertices within `r` of its bones, stopped at a
# cut plane, so a hock that touches the tail but is not joined to it stays the leg's. Body skin
# the chain's bones had reached is re-weighted from the body round it.
# Coordinates are in the asset frame (metres, Z up, +X front).

import bpy
import numpy as np
from mathutils import kdtree

from tasks.steps import bind
from tasks.steps import state as st
from tasks.steps.deform import mask_weights


def to_gltf_point(p):
    """Asset (x, y, z) = glTF (z, x, y)."""
    return [p[1], p[2], p[0]]


def joint(state, step):
    name, moved = step["bone"], []
    if state.skeleton is not None:
        bone = next((b for b in state.skeleton.get("bones", []) if b["name"] == name), None)
        if bone is None:
            known = [b["name"] for b in state.skeleton.get("bones", [])]
            raise ValueError(f"joint: no bone {name!r} in the skeleton. fix: use one of {known}")
        for end in ("head", "tail"):
            if step.get(end) is not None:
                bone[end] = to_gltf_point(step[end])
                moved.append(end)
    elif state.source_rig is not None:
        arm = state.source_rig
        if name not in arm.data.bones:
            raise ValueError(f"joint: no bone {name!r} in the source rig. fix: use one of {[b.name for b in arm.data.bones]}")
        st.activate(arm)
        bpy.ops.object.mode_set(mode="EDIT")
        inverse = arm.matrix_world.inverted()
        for end in ("head", "tail"):
            if step.get(end) is not None:
                setattr(arm.data.edit_bones[name], end, inverse @ st.from_asset(step[end]))
                moved.append(end)
        bpy.ops.object.mode_set(mode="OBJECT")
    else:
        raise ValueError("joint needs request.skeleton or a rigged source mesh. fix: send the skeleton input")
    return {"bone": name, "moved": moved}


def region(obj, mask):
    """Per-vertex 0..1 weights of a weights mask (asset frame)."""
    if mask["kind"] in ("z", "sphere"):
        return mask_weights(obj, mask)
    co = st.coords(obj)
    if mask["kind"] == "box":
        a = np.array(st.from_asset(mask["min"]), dtype=np.float32)
        b = np.array(st.from_asset(mask["max"]), dtype=np.float32)
        lo, hi = np.minimum(a, b), np.maximum(a, b)
        outside = np.maximum(lo - co, co - hi).max(axis=1)
    else:  # plane: the half-space the normal points away from
        n = np.array(st.from_asset(mask["normal"]), dtype=np.float32)
        outside = (co - np.array(st.from_asset(mask["point"]), dtype=np.float32)) @ (n / np.linalg.norm(n))
    feather = mask.get("feather", 0)
    if feather <= 0:
        return (outside <= 0).astype(np.float32)
    t = np.clip(1 - outside / feather, 0, 1)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def matrix(obj, names):
    """Dense (vertices × bones) weights of the bone groups."""
    column = {obj.vertex_groups[n].index: i for i, n in enumerate(names)}
    w = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group in column:
                w[v.index, column[g.group]] = g.weight
    return w


def relax(obj, values, iterations):
    """Laplacian smoothing of one per-vertex value over the mesh edges."""
    edges = np.empty(len(obj.data.edges) * 2, dtype=np.int32)
    obj.data.edges.foreach_get("vertices", edges)
    a, b = edges.reshape(-1, 2).T
    degree = np.bincount(np.concatenate((a, b)), minlength=len(values)).astype(np.float32)
    for _ in range(iterations):
        total = np.bincount(a, weights=values[b], minlength=len(values)) + np.bincount(b, weights=values[a], minlength=len(values))
        values = np.where(degree > 0, 0.5 * values + 0.5 * total / np.maximum(degree, 1), values).astype(np.float32)
    return values


def weights(state, step):
    obj, arm = state.mesh, state.armature
    if arm is None:
        raise ValueError("weights needs a bind step before it")
    names = [b.name for b in arm.data.bones if b.name in obj.vertex_groups]
    if step["bone"] not in names:
        raise ValueError(f"weights: no bone {step['bone']!r} on the mesh. fix: use one of {names}")
    k = names.index(step["bone"])
    w = matrix(obj, names)
    m = region(obj, step["mask"])
    old = w[:, k].copy()
    if step["kind"] == "assign":
        target = np.full_like(old, min(1.0, step["value"]))
    elif step["kind"] == "scale":
        target = np.clip(old * step["value"], 0, 1)
    else:
        target = relax(obj, old, step["iterations"])
    new = old + m * (target - old)
    changed = np.flatnonzero(np.abs(new - old) > 1e-5)
    if len(changed) == 0:
        raise ValueError(
            f"weights changed nothing: the mask holds {int((m > 0).sum())} vertices. "
            "fix: check the mask against the mesh (asset frame, metres) and the value"
        )
    others = w.sum(axis=1) - old
    scale = np.where(others > 1e-9, (1 - new) / np.maximum(others, 1e-9), 0)
    w *= scale[:, None]
    w[:, k] = np.where(others > 1e-9, new, 1.0)
    groups = [obj.vertex_groups[n] for n in names]
    for i in changed.tolist():
        for j, group in enumerate(groups):
            if w[i, j] > 1e-4:
                group.add([i], float(w[i, j]), "REPLACE")
            else:
                group.remove([i])
    bind.limit(obj, state.max_influences)
    return {
        "bone": step["bone"],
        "kind": step["kind"],
        "masked": int((m > 0).sum()),
        "changed": int(len(changed)),
        "meanBefore": round(float(old[m > 0].mean()), 4),
        "meanAfter": round(float(new[m > 0].mean()), 4),
    }


def flood(obj, allowed, seed):
    """Vertices reached from `seed` over edges whose two ends are both `allowed`."""
    edges = np.empty(len(obj.data.edges) * 2, dtype=np.int32)
    obj.data.edges.foreach_get("vertices", edges)
    a, b = edges.reshape(-1, 2).T
    keep = allowed[a] & allowed[b]
    a, b = a[keep], b[keep]
    reached = np.zeros(len(allowed), dtype=bool)
    reached[seed] = True
    while True:
        grown = reached.copy()
        grown[b[reached[a]]] = True
        grown[a[reached[b]]] = True
        if grown.sum() == reached.sum():
            return reached
        reached = grown


def inpaint(obj, w, holes, domain, iterations=60):
    """Rows of `w` at `holes` relaxed to the mean of their neighbours inside `domain`; the rest fixed."""
    edges = np.empty(len(obj.data.edges) * 2, dtype=np.int32)
    obj.data.edges.foreach_get("vertices", edges)
    a, b = edges.reshape(-1, 2).T
    keep = domain[a] & domain[b] & (holes[a] | holes[b])
    a, b = a[keep], b[keep]
    if len(a) == 0:
        return w
    degree = (np.bincount(a, minlength=len(w)) + np.bincount(b, minlength=len(w))).astype(np.float64)
    for _ in range(iterations):
        total = np.zeros_like(w)
        np.add.at(total, a, w[b])
        np.add.at(total, b, w[a])
        w = np.where((holes & (degree > 0))[:, None], total / np.maximum(degree, 1)[:, None], w)
    return w


def segment_distance(co, head, tail):
    axis = tail - head
    t = np.clip(((co - head) @ axis) / max(float(axis @ axis), 1e-12), 0, 1)
    return np.linalg.norm(co - (head + t[:, None] * axis), axis=1)


def isolate(state, step):
    obj, arm = state.mesh, state.armature
    if arm is None:
        raise ValueError("isolate needs a bind step before it")
    names = [b.name for b in arm.data.bones if b.name in obj.vertex_groups]
    missing = [b for b in step["bones"] if b not in names]
    if missing:
        raise ValueError(f"isolate: no bone(s) {missing} on the mesh. fix: use bones of {names}")
    own = [names.index(b) for b in step["bones"]]
    co = st.coords(obj).astype(np.float64)
    point = np.array(st.from_asset(step["point"]), dtype=np.float64)
    normal = np.array(st.from_asset(step["normal"]), dtype=np.float64)
    depth = (co - point) @ (normal / np.linalg.norm(normal))
    world = arm.matrix_world
    ends = [(np.array(world @ arm.data.bones[b].head_local), np.array(world @ arm.data.bones[b].tail_local)) for b in step["bones"]]
    reach = np.min(np.stack([segment_distance(co, h, t) for h, t in ends]), axis=0)
    beyond = (depth > 0) & (reach <= step["r"])
    if not beyond.any():
        raise ValueError("isolate: no vertex beyond the cut plane within `r` of the bones. fix: `normal` points from the body along the chain; `r` covers the chain's skin")
    tip = np.array(st.from_asset(step["from"]), dtype=np.float64)
    candidates = np.flatnonzero(beyond)
    seed = int(candidates[np.argmin(np.linalg.norm(co[candidates] - tip, axis=1))])
    inside = flood(obj, beyond, seed)
    share = float(inside.mean())
    if share > step["maxShare"]:
        raise ValueError(
            f"isolate: {share:.0%} of the mesh is connected to the chain beyond the cut (limit {step['maxShare']:.0%}): "
            "the chain is fused to the body there. fix: `unweb` it before retopo, narrow `r`, or move the cut further along the chain"
        )
    w = matrix(obj, names).astype(np.float64)
    before = w.copy()
    foreign = np.ones(len(names), dtype=bool)
    foreign[own] = False
    # Inside: other bones fade out over `feather` metres past the cut. Outside: the chain's go.
    fade = np.clip(1 - depth / max(step["feather"], 1e-9), 0, 1)
    w[np.ix_(inside, foreign)] *= fade[inside, None]
    # The body's skin the chain's bones reached (the rump under a tail) takes the weights of the
    # body round it: the chain's are dropped, then filled in from the untouched neighbours.
    held = ~inside & (w[:, ~foreign].sum(axis=1) > 1e-4)
    w[np.ix_(~inside, ~foreign)] = 0
    w = inpaint(obj, w, held, ~inside)
    total = w.sum(axis=1)
    lost_in = np.flatnonzero(inside & (total <= 1e-6))
    if len(lost_in):
        near = np.argmin(np.stack([segment_distance(co[lost_in], h, t) for h, t in ends]), axis=0)
        w[lost_in] = 0
        w[lost_in, np.array(own)[near]] = 1
    lost_out = np.flatnonzero(~inside & (total <= 1e-6))
    if len(lost_out):
        donors = np.flatnonzero(~inside & (total > 1e-6))
        if len(donors) == 0:
            raise ValueError("isolate: the body has no weights outside the chain's bones. fix: list only the chain's bones")
        tree = kdtree.KDTree(len(donors))
        for i in donors.tolist():
            tree.insert(co[i], i)
        tree.balance()
        for i in lost_out.tolist():
            w[i] = w[tree.find(co[i])[1]]
    w /= w.sum(axis=1)[:, None]
    changed = np.flatnonzero(np.abs(w - before).max(axis=1) > 1e-5)
    groups = [obj.vertex_groups[n] for n in names]
    for i in changed.tolist():
        for j, group in enumerate(groups):
            if w[i, j] > 1e-4:
                group.add([i], float(w[i, j]), "REPLACE")
            else:
                group.remove([i])
    bind.limit(obj, state.max_influences)
    return {
        "bones": step["bones"],
        "inside": int(inside.sum()),
        "changed": int(len(changed)),
        "reassigned": [int(len(lost_in)), int(len(lost_out))],
        "foreignBefore": round(float(before[np.ix_(inside, foreign)].sum() / max(int(inside.sum()), 1)), 4),
        "bodyRefilled": int(held.sum()),
    }
