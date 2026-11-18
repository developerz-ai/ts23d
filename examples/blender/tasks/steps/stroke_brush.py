# SPDX-License-Identifier: GPL-2.0-or-later
# What each brush of the `stroke` op (stroke.py) asks of the vertices a dab reaches: one function
# per kind of move, in metres in the Blender frame, always from the positions at the stroke's start.

import numpy as np

SMOOTH_PASSES = 4
CREASE_PINCH = 0.5  # of the strength


def unit(v, fallback=None):
    n = float(np.linalg.norm(v))
    if n > 1e-12:
        return v / n
    return np.zeros(3) if fallback is None else fallback


def towards_line(seed, p, normal, tangent, limit):
    """Moves of `p` towards the path at `seed`, in the surface plane, at most `limit` metres."""
    to = seed - p
    if tangent is not None:
        axis = unit(np.cross(tangent, normal))
        if np.any(axis):
            return axis[None] * np.clip(to @ axis, -limit, limit)[:, None]
    flat = to - normal[None] * (to @ normal)[:, None]
    n = np.maximum(np.linalg.norm(flat, axis=1), 1e-12)
    return flat * np.minimum(1.0, limit / n)[:, None]


def stamp_moves(stamp, seed, p, normal, tangent, radius, scale):
    """The stamp's (right, up, normal) vectors under `p`, bilinear, in the frame at `seed`."""
    size = stamp.shape[0]
    up = tangent if tangent is not None else np.array((0.0, 0.0, 1.0))
    up = unit(up - normal * (up @ normal), unit(np.cross(normal, (1.0, 0.0, 0.0))))
    right = unit(np.cross(up, normal))
    width = 2 * radius
    x = np.clip(((p - seed) @ right / width + 0.5) * (size - 1), 0, size - 1)
    y = np.clip(((p - seed) @ up / width + 0.5) * (size - 1), 0, size - 1)
    i, j = np.minimum(x.astype(np.int64), size - 2), np.minimum(y.astype(np.int64), size - 2)
    u, v = (x - i)[:, None], (y - j)[:, None]
    g = (stamp[j, i] * (1 - u) + stamp[j, i + 1] * u) * (1 - v) + (stamp[j + 1, i] * (1 - u) + stamp[j + 1, i + 1] * u) * v
    return (right[None] * g[:, 0:1] + up[None] * g[:, 1:2] + normal[None] * g[:, 2:3]) * scale


def brush_moves(brush, s, ctx):
    """What one dab asks of the vertices it reaches (metres, Blender frame)."""
    p, normal, centre = ctx["p"], ctx["normal"], ctx["centre"]
    limit = abs(s) if s is not None else 0.0
    if brush == "draw":
        return np.broadcast_to(normal * s, p.shape)
    if brush == "inflate":
        return ctx["normals"] * s
    if brush == "clay":
        h = (centre + normal * s - p) @ normal
        return normal[None] * (np.clip(h, 0, s) if s > 0 else np.clip(h, s, 0))[:, None]
    if brush == "flatten":
        return normal[None] * np.clip((centre - p) @ normal, -limit, limit)[:, None]
    if brush == "pinch":
        return towards_line(ctx["seed"], p, normal, ctx["tangent"], limit)
    if brush == "crease":
        return towards_line(ctx["seed"], p, normal, ctx["tangent"], limit * CREASE_PINCH) - normal * s
    if brush == "grab":
        return np.broadcast_to(ctx["delta"], p.shape)
    if brush == "vdm":
        return stamp_moves(ctx["stamp"], ctx["seed"], p, normal, ctx["tangent"], ctx["radius"], ctx["scale"])
    return np.zeros_like(p)  # smooth: coverage only, see smoothed()


def smoothed(surface, cover, limit):
    """Neighbour averaging where `cover` > 0, each move capped at `limit` metres."""
    active = np.flatnonzero(cover > 0)
    flag = np.zeros(len(cover), dtype=bool)
    flag[active] = True
    pick = flag[surface.src]
    owner, other = np.searchsorted(active, surface.src[pick]), surface.dst[pick]
    count = np.maximum(np.bincount(owner, minlength=len(active)), 1)[:, None]
    p = surface.co.copy()
    for _ in range(SMOOTH_PASSES):
        total = np.stack([np.bincount(owner, p[other, k], len(active)) for k in range(3)], axis=1)
        p[active] += (total / count - p[active]) * cover[active][:, None]
    move = p - surface.co
    size = np.maximum(np.linalg.norm(move, axis=1), 1e-12)
    return move * np.minimum(1.0, limit / size)[:, None]
