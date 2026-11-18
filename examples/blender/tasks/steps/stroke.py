# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `stroke`: a sculpt brush dragged along a 3D path on an existing mesh, with no viewport
# (Blender's own sculpt operators need one, and their result changes with the thread count). Dabs
# sit every `spacing` × radius along the path. Each dab reaches the vertices within `radius` of its
# seed vertex ALONG THE SURFACE (Dijkstra over mesh edges), so a surface a few millimetres away
# across a gap is never touched. Falloff u²(3 − 2u) of that distance, times `mask`. A dab proposes a
# move for every vertex it reaches; a vertex ends at the falloff-weighted sum, divided by the highest
# coverage of the stroke, so the middle of the path moves about `strength` however dense the dabs
# are. All positions and normals are those at the stroke's start: the result depends on the path
# alone, and the same input gives the same bytes at any thread count. Brushes: draw (along the area
# normal), inflate (along each vertex's normal), clay (up to a plane `strength` above the area),
# flatten (to the area's plane), pinch (towards the path), crease (in, plus a pinch), smooth
# (neighbour averaging), grab (`path[0]` moved by `path[1] - path[0]`), vdm (a stamp at each dab).
# `strength` caps each move in metres. Gated: the path must lie on the surface, the radius must span
# several vertices, something must move, and at most a few triangles may turn over.

import heapq

import numpy as np

from tasks.steps import state as st
from tasks.steps.rigfix import region
from tasks.steps.stroke_brush import brush_moves, smoothed, unit

MIN_REGION = 4  # mean vertices per dab: fewer means the radius is under the mesh's edge length
FLIP_SHARE = 0.001  # of the triangles the stroke touches
FLIP_FLOOR = 4
MOVED = 1e-6  # metres: a vertex that moved less did not move
WELD = 1e-6  # metres: vertices this close are the same point of the surface
ASSET_AXIS = {"x": 0, "y": 1, "z": 2}


class Surface:
    """The mesh at the start of the stroke, with coincident vertices as ONE point: a glTF splits
    vertices along UV seams and hard edges, and a stroke must cross those without tearing them.
    `co`, `normal` and the edges are per point; `points[v]` is the point of vertex `v`."""

    def __init__(self, obj):
        me = obj.data
        self.vertex_co = st.coords(obj).astype(np.float64)
        normals = np.empty(len(self.vertex_co) * 3, dtype=np.float32)
        me.vertices.foreach_get("normal", normals)
        normals = normals.reshape(-1, 3).astype(np.float64)
        key = np.round(self.vertex_co / WELD).astype(np.int64)
        order = np.lexsort((key[:, 2], key[:, 1], key[:, 0]))
        step = np.any(key[order][1:] != key[order][:-1], axis=1)
        groups = np.concatenate(([0], np.cumsum(step)))
        self.points = np.empty(len(order), dtype=np.int64)
        self.points[order] = groups
        count = int(groups[-1]) + 1
        self.first = np.empty(count, dtype=np.int64)
        self.first[self.points[::-1]] = np.arange(len(order))[::-1]  # lowest vertex of each point
        self.co = self.vertex_co[self.first]
        total = np.stack([np.bincount(self.points, normals[:, k], count) for k in range(3)], axis=1)
        self.normal = total / np.maximum(np.linalg.norm(total, axis=1), 1e-12)[:, None]
        ends = np.empty(len(me.edges) * 2, dtype=np.int32)
        me.edges.foreach_get("vertices", ends)
        a, b = self.points[ends[::2]], self.points[ends[1::2]]
        joined = a != b
        a, b = a[joined], b[joined]
        src, dst = np.concatenate((a, b)), np.concatenate((b, a))
        order = np.lexsort((dst, src))
        self.src, self.dst = src[order], dst[order]
        self.offsets = np.zeros(count + 1, dtype=np.int64)
        self.offsets[1:] = np.cumsum(np.bincount(src, minlength=count))
        self.length = np.linalg.norm(self.co[self.src] - self.co[self.dst], axis=1)

    def reach(self, seed, radius):
        """(vertices, distances) within `radius` of `seed` along edges; ties break by index."""
        done, best, heap = {}, {seed: 0.0}, [(0.0, seed)]
        offsets, dst, length = self.offsets, self.dst, self.length
        while heap:
            d, v = heapq.heappop(heap)
            if v in done:
                continue
            done[v] = d
            a, b = int(offsets[v]), int(offsets[v + 1])
            for w, step in zip(dst[a:b].tolist(), length[a:b].tolist()):
                far = d + step
                if far < radius and w not in done and far < best.get(w, radius):
                    best[w] = far
                    heapq.heappush(heap, (far, w))
        return np.fromiter(done, np.int64, len(done)), np.fromiter(done.values(), np.float64, len(done))


def dabs_along(path, radii, spacing):
    """[(point, radius, tangent or None)] every `spacing` × radius along the polyline, ends included."""
    if len(path) == 1:
        return [(path[0], float(radii[0]), None)]
    seg = np.linalg.norm(path[1:] - path[:-1], axis=1)
    at = np.concatenate(([0.0], np.cumsum(seg)))
    total = float(at[-1])
    if total <= 0:
        return [(path[0], float(radii[0]), None)]
    out, s = [], 0.0
    while True:
        i = min(int(np.searchsorted(at, s, side="right")) - 1, len(seg) - 1)
        t = (s - at[i]) / seg[i] if seg[i] > 0 else 0.0
        r = float(radii[i] + (radii[i + 1] - radii[i]) * t)
        out.append((path[i] + (path[i + 1] - path[i]) * t, r, unit(path[i + 1] - path[i])))
        if s >= total:
            return out
        s = min(total, s + max(spacing * r, 1e-6))


def one_pass(surface, step, path, radii, weights, stats):
    """The displacement of one run along `path` (the stroke, or its mirror image)."""
    brush, s = step["brush"], step.get("strength")
    count = len(surface.co)
    reach = float(np.max(radii))
    near = np.flatnonzero(np.all((surface.co >= path.min(axis=0) - reach) & (surface.co <= path.max(axis=0) + reach), axis=1))
    if len(near) == 0:
        raise ValueError("the stroke's path is nowhere near the mesh. fix: give path points on the surface (asset frame, metres)")
    moves, reached, plain = np.zeros((count, 3)), np.zeros(count), np.zeros(count)
    extra = {}
    if brush == "grab":
        extra["delta"] = path[1] - path[0]
        dabs = [(path[0], float(radii[0]), None)]
    else:
        dabs = dabs_along(path, radii, step["spacing"])
    if brush == "vdm":
        size = step["stamp"]["size"]
        stamp = np.array(step["stamp"]["grid"], dtype=np.float64).reshape(size, size, 3)
        peak = float(np.abs(stamp[:, :, 2]).max())
        if peak <= 0:
            raise ValueError("the vdm stamp has no normal displacement. fix: pass a stamp that raises or cuts something")
        # A stamp in (right, up, normal) of footprint widths, scaled so its tallest point is `strength`.
        extra.update(stamp=stamp, scale=s / peak)
    for at, radius, tangent in dabs:
        gap = np.sum((surface.co[near] - at) ** 2, axis=1)
        k = int(np.argmin(gap))
        off = float(np.sqrt(gap[k]))
        stats["off"] = max(stats["off"], off)
        if off > radius:
            raise ValueError(
                f"a stroke dab at {st_asset(at)} is {off:.4f} m from the nearest vertex, over its radius {radius:.4f}. "
                "fix: put the path on the surface (asset frame), or raise radius"
            )
        seed = int(near[k])
        ids, dist = surface.reach(seed, radius)
        stats["dabs"] += 1
        stats["region"] += len(ids)
        u = np.clip(1 - dist / radius, 0, 1)
        falloff = u * u * (3 - 2 * u)
        plain[ids] += falloff
        f = falloff * weights[ids]
        if f.sum() <= 0:
            continue
        p = surface.co[ids]
        w = f[:, None]
        normal = unit((surface.normal[ids] * w).sum(axis=0), unit(surface.normal[seed], np.array((0.0, 0.0, 1.0))))
        ctx = {"p": p, "normal": normal, "normals": surface.normal[ids], "centre": (p * w).sum(axis=0) / f.sum(),
               "seed": surface.co[seed], "tangent": tangent, "radius": radius, **extra}
        moves[ids] += brush_moves(brush, s, ctx) * w
        reached[ids] += f
    top = float(plain.max())
    if top <= 0:
        return moves
    if brush == "smooth":
        return smoothed(surface, reached / top, abs(s))
    return moves / top


def flipped_faces(obj, before, after, moved):
    """(triangles turned over, triangles touched) among those with a moved vertex."""
    me = obj.data
    me.calc_loop_triangles()
    tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int32)
    me.loop_triangles.foreach_get("vertices", tris)
    tris = tris.reshape(-1, 3)
    tris = tris[moved[tris].any(axis=1)]

    def normals(co):
        a = co[tris]
        return np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0])

    was, now = normals(before), normals(after)
    real = np.sum(was * was, axis=1) > 1e-20  # a triangle with no area has no side to turn over
    return int((np.sum(was * now, axis=1)[real] <= 0).sum()), len(tris)


def st_asset(p):
    return [round(float(-p[1]), 4), round(float(p[0]), 4), round(float(p[2]), 4)]


def run(state, step):
    obj = state.mesh
    surface = Surface(obj)
    path_asset = np.array(step["path"], dtype=np.float64)
    radius = step["radius"]
    radii = np.full(len(path_asset), radius, dtype=np.float64) if isinstance(radius, (int, float)) else np.array(radius, dtype=np.float64)
    weights = region(obj, step["mask"]).astype(np.float64)[surface.first] if step.get("mask") else np.ones(len(surface.co))
    passes = [path_asset]
    if step.get("symmetry"):
        mirrored = path_asset.copy()
        mirrored[:, ASSET_AXIS[step["symmetry"]]] *= -1
        passes.append(mirrored)
    stats = {"off": 0.0, "dabs": 0, "region": 0}
    move = np.zeros_like(surface.co)
    for asset in passes:
        path = np.stack((asset[:, 1], -asset[:, 0], asset[:, 2]), axis=1)
        move += one_pass(surface, step, path, radii, weights, stats)
    mean_region = stats["region"] / max(1, stats["dabs"])
    if mean_region < MIN_REGION:
        raise ValueError(
            f"each stroke dab reaches {mean_region:.1f} vertices: the radius is under the mesh's edge length. "
            "fix: raise radius, or voxelRemesh / retopo to a finer mesh first"
        )
    move = move[surface.points]
    size = np.linalg.norm(move, axis=1)
    moved = size > MOVED
    if not moved.any():
        raise ValueError("the stroke moved nothing. fix: check its mask, and that strength is not too small for the mesh")
    after = surface.vertex_co + move
    flipped, touched = flipped_faces(obj, surface.vertex_co, after, moved)
    limit = max(FLIP_FLOOR, int(touched * FLIP_SHARE))
    if flipped > limit:
        raise ValueError(
            f"the stroke turned {flipped} of the {touched} triangles it touched inside out (limit {limit}). "
            "fix: lower strength, raise radius, or voxelRemesh a raw mesh before stroking it"
        )
    obj.data.vertices.foreach_set("co", after.astype(np.float32).ravel())
    obj.data.update()
    return {
        "brush": step["brush"],
        "dabs": stats["dabs"],
        "regionMean": round(mean_region, 1),
        "pathOff": round(stats["off"], 6),
        "moved": int(moved.sum()),
        "maxMove": round(float(size.max()), 6),
        "meanMove": round(float(size[moved].mean()), 6),
        "flipped": flipped,
        "touchedTriangles": touched,
    }
