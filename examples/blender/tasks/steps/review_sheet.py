# SPDX-License-Identifier: GPL-2.0-or-later
# Sheets for the `review` step: read a rendered tile back as pixels, lay tiles out in rows with
# a thin gap, and save the sheet as an 8-bit RGB PNG. Tiles carry no drawn labels: the report
# lists their names in reading order (left to right, top to bottom).

import bpy
import numpy as np

GAP = 4
BACKGROUND = (0.1, 0.1, 0.1, 1.0)


def read(path, tile):
    """A rendered PNG as a (tile, tile, 4) float array, bottom row first (Blender's order)."""
    img = bpy.data.images.load(path)
    try:
        if tuple(img.size) != (tile, tile):
            raise ValueError(f"the review render is {tuple(img.size)}, expected {tile} px square")
        px = np.empty(tile * tile * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        return px.reshape(tile, tile, 4)
    finally:
        bpy.data.images.remove(img)


def write(path, tiles, tile, columns):
    """Lay (pixels, name) tiles out `columns` to a row; returns [width, height] of the PNG."""
    if not tiles:
        raise ValueError("the review view has nothing to show")
    columns = min(columns, len(tiles))
    rows = -(-len(tiles) // columns)
    width = columns * tile + (columns + 1) * GAP
    height = rows * tile + (rows + 1) * GAP
    canvas = np.empty((height, width, 4), dtype=np.float32)
    canvas[:] = BACKGROUND
    for i, (px, _name) in enumerate(tiles):
        row, col = divmod(i, columns)
        x = GAP + col * (tile + GAP)
        y = height - (GAP + row * (tile + GAP)) - tile  # the first row is the top one
        canvas[y : y + tile, x : x + tile] = px
    canvas[:, :, 3] = 1.0
    img = bpy.data.images.new("t3d_review_sheet", width, height, alpha=False)
    try:
        img.pixels.foreach_set(canvas.ravel())
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
    finally:
        bpy.data.images.remove(img)
    return [width, height]
