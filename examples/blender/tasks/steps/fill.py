# SPDX-License-Identifier: GPL-2.0-or-later
# The solid coat of a baked albedo: a texel inside a UV island that the bake left without colour
# (alpha 0: the ray missed the source, or went through a transparent part and met nothing) takes
# the mean of its coloured neighbours, pass after pass, so the game mesh never shows a hole or a
# black speck. `solid_coat` works in place on the (h, w, 4) float image, sets alpha to 1 everywhere
# and returns the share of island texels that had no colour before the fill.

import numpy as np

PASSES = 64
SHIFTS = ((0, 1), (0, -1), (1, 0), (-1, 0))


def solid_coat(rgba, inside):
    """Fill colourless texels from their neighbours; returns the unfilled share inside `inside`."""
    have = rgba[:, :, 3] > 0.5
    missing = inside & ~have
    share = float(missing.sum()) / float(max(1, inside.sum()))
    rgb = rgba[:, :, :3]
    rgb[~have] = 0.0
    for _ in range(PASSES):
        if have.all():
            break
        total = np.zeros_like(rgb)
        count = np.zeros(have.shape, dtype=np.float32)
        for dy, dx in SHIFTS:
            total += np.roll(rgb * have[:, :, None], (dy, dx), axis=(0, 1))
            count += np.roll(have, (dy, dx), axis=(0, 1))
        grow = ~have & (count > 0)
        rgb[grow] = total[grow] / count[grow][:, None]
        have = have | grow
    rgba[:, :, 3] = 1.0
    return round(share, 4)
