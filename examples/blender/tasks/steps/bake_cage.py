# SPDX-License-Identifier: GPL-2.0-or-later
# The fitted bake cage (`bake.cageFit`). A flat cage lets rays start beyond the next surface: two
# fingers closer than the cage distance bake each other. Here the cage is a copy of the shell with
# each vertex pushed out along its normal by min(cage, 0.45 × the gap to the next wall outward), so
# a ray starts on its own side of the middle of the gap. The limit spreads over two rings of
# neighbours: a face between a limited vertex and a free one would otherwise slant across the gap.
# No minimum: however narrow the gap, the cage stays inside it. Same topology as the shell (Cycles
# needs that).

import numpy as np

from tasks.steps import gates
from tasks.steps import state as st

GAP_SHARE = 0.45
SPREAD = 2  # rings of neighbours that take a vertex's limit


def fit(low, cage):
    """A new object: the shell's cage. Returns (object, facts for the report)."""
    tree = gates.tree_of(low)
    co = st.coords(low).astype(np.float64)
    normals = np.empty(len(co) * 3, dtype=np.float32)
    low.data.vertices.foreach_get("normal", normals)
    normals = normals.reshape(-1, 3).astype(np.float64)
    _, _, diag = st.bounds(low)
    start = max(diag * 1e-6, 1e-7)
    reach = cage / GAP_SHARE
    offset = np.full(len(co), cage, dtype=np.float64)
    for i, (p, n) in enumerate(zip((co + normals * start).tolist(), normals.tolist())):
        hit = tree.ray_cast(p, n, reach)
        if hit[0] is not None:
            offset[i] = min(cage, GAP_SHARE * (hit[3] + start))
    ends = np.empty(len(low.data.edges) * 2, dtype=np.int32)
    low.data.edges.foreach_get("vertices", ends)
    a, b = ends[::2], ends[1::2]
    for _ in range(SPREAD):
        np.minimum.at(offset, a, offset[b].copy())
        np.minimum.at(offset, b, offset[a].copy())
    obj = st.duplicate(low, "t3d_bake_cage")
    obj.modifiers.clear()
    moved = (co + normals * offset[:, None]).astype(np.float32)
    obj.data.vertices.foreach_set("co", moved.ravel())
    obj.data.update()
    limited = offset < cage
    return obj, {
        "min": round(float(offset.min()), 6),
        "max": round(float(offset.max()), 6),
        "limited": round(float(limited.mean()), 4),
    }
