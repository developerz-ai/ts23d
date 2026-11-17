# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `unweb`: cut geometry that bridges two limbs which are separate in the animal (a hanging
# tail fused to the hocks, two legs grown together). Runs after `transform`, on the source, before
# retopo and after `clean` (the cut needs welded vertices). Each limb arrives as capsules in the asset frame (the free part of a leg, the tail).
# A vertex belongs to the limb whose capsule it is nearest to in units of that capsule's radius,
# if it lies within REACH radii of its axis; every other vertex is trunk and is never touched. A
# face that holds vertices of two limbs is a web face: it is deleted, each limb's side of the cut
# is capped on its own (never across), and vertices of one limb closer than `gap` to another are
# pushed apart until `gap` lies between them (so a voxel shell of `gap` / 1.5 or finer cannot
# fuse them again). Limb ↔ trunk skin (an elbow web onto the chest) is not handled here.
# Gate: no edge may join two limbs afterwards, else the step fails naming the pair.
# Step op `amputate`: delete the faces whose vertices all belong to the given limbs and close the
# stumps (the far legs of a profile model, which may sit on the mirror plane, before `symmetrize`).

import bmesh
import numpy as np
from mathutils import Vector, kdtree

from tasks.steps import state as st


REACH = 1.5  # a limb owns the vertices within this many capsule radii of its axis


def segment_distance(co, a, b):
    """Distance from every row of `co` to segment a → b."""
    u = b - a
    l2 = float(u @ u)
    t = np.clip(((co - a) @ u) / l2, 0.0, 1.0) if l2 > 0 else np.zeros(len(co))
    return np.linalg.norm(co - (a + t[:, None] * u), axis=1)


def label(co, limbs):
    """Per vertex: the limb it belongs to, or -1 (trunk)."""
    best = np.full(len(co), np.inf, dtype=np.float32)
    lab = np.full(len(co), -1, dtype=np.int32)
    for k, capsules in enumerate(limbs):
        for c in capsules:
            a = np.array(st.from_asset(c["head"]), dtype=np.float64)
            b = np.array(st.from_asset(c["tail"]), dtype=np.float64)
            d = segment_distance(co, a, b) / c["r"]
            near = (d < best) & (d <= REACH)
            best[near] = d[near]
            lab[near] = k
    return lab


def cap(bm, edges, layer):
    """Close each limb's side of the cut: per boundary loop, one fan over that limb's run."""
    made = 0
    seen = set()
    for start in edges:
        if start in seen:
            continue
        loop, stack = [], [start]
        while stack:
            e = stack.pop()
            if e in seen:
                continue
            seen.add(e)
            loop.append(e)
            for v in e.verts:
                stack.extend(x for x in v.link_edges if x.is_boundary and x not in seen)
        for limb in {v[layer] for e in loop for v in e.verts} - {-1}:
            run_edges = [e for e in loop if all(v[layer] == limb for v in e.verts)]
            verts = {v for e in run_edges for v in e.verts}
            if len(verts) < 3:
                continue
            hub = bm.verts.new(sum((v.co for v in verts), Vector()) / len(verts))
            hub[layer] = limb
            for e in run_edges:
                try:
                    bm.faces.new((e.verts[0], e.verts[1], hub))
                    made += 1
                except ValueError:
                    pass
    return made


def run(state, step):
    gap = step["gap"]
    me = state.mesh.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    lab0 = label(co.reshape(-1, 3), step["limbs"])
    bm = bmesh.new()
    bm.from_mesh(me)
    # The limb rides on each vertex (a layer survives deletes; element indices do not).
    layer = bm.verts.layers.int.new("t3d_limb")
    for v in bm.verts:
        v[layer] = int(lab0[v.index])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    name = lambda ls: " + ".join(str(i) for i in sorted(ls))
    pairs = {}
    web = []
    for f in bm.faces:
        ls = {v[layer] for v in f.verts} - {-1}
        if len(ls) > 1:
            web.append(f)
            pairs[name(ls)] = pairs.get(name(ls), 0) + 1
    counts = np.bincount(lab0[lab0 >= 0], minlength=len(step["limbs"])).tolist()
    facts = {"gap": round(gap, 6), "limbVertices": counts, "webFaces": len(web), "pairs": pairs}
    if not web:
        bm.free()
        return facts
    seam = {v for f in web for v in f.verts}
    bmesh.ops.delete(bm, geom=web, context="FACES")
    seam = {v for v in seam if v.is_valid}
    loose = [v for v in seam if not v.link_faces]
    seam -= set(loose)
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    edges = [e for e in bm.edges if e.is_boundary and all(v in seam for v in e.verts)]
    facts["capFaces"] = cap(bm, edges, layer)
    # Push each limb away from the others where it is within `gap` of their surface.
    moved = 0
    limbs = sorted({v[layer] for v in bm.verts} - {-1})
    by_limb = {k: [v for v in bm.verts if v[layer] == k] for k in limbs}
    for k in limbs:
        others = [v for j in limbs if j != k for v in by_limb[j]]
        if not others:
            continue
        tree = kdtree.KDTree(len(others))
        for i, v in enumerate(others):
            tree.insert(v.co, i)
        tree.balance()
        shifts = []
        for v in by_limb[k]:
            near, _, d = tree.find(v.co)
            if d >= gap:
                continue
            away = v.co - near
            if away.length < 1e-9:
                away = -v.normal if v.normal.length > 0 else Vector((0, 0, 1))
            shifts.append((v, away.normalized() * ((gap - d) * 0.5)))
        for v, s in shifts:
            v.co += s
        moved += len(shifts)
    facts["moved"] = moved
    bridged = {}
    for e in bm.edges:
        a, b = (v[layer] for v in e.verts)
        if a != b and a >= 0 and b >= 0:
            bridged[name((a, b))] = bridged.get(name((a, b)), 0) + 1
    if bridged:
        bm.free()
        raise ValueError(f"unweb left limbs joined: {bridged} (edges per limb pair); widen `gap`")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.layers.int.remove(layer)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return facts


def amputate(state, step):
    me = state.mesh.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    lab = label(co.reshape(-1, 3), step["limbs"])
    bm = bmesh.new()
    bm.from_mesh(me)
    gone = [f for f in bm.faces if all(lab[v.index] >= 0 for v in f.verts)]
    facts = {"faces": len(gone), "limbVertices": np.bincount(lab[lab >= 0], minlength=len(step["limbs"])).tolist()}
    if gone:
        bmesh.ops.delete(bm, geom=gone, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        filled = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
        bmesh.ops.triangulate(bm, faces=[f for f in filled["faces"] if len(f.verts) > 3])
        facts["capFaces"] = len(filled["faces"])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if not bm.faces:
            bm.free()
            raise ValueError("amputate left no faces: the limbs cover the whole mesh")
        bm.to_mesh(me)
        me.update()
    bm.free()
    return facts
