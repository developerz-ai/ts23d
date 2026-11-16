# SPDX-License-Identifier: GPL-2.0-or-later
# `vdm_extract` (scripts/vdm-from-blender.ts): read a Blender asset library (.blend), find every
# vector-displacement brush (`use_color_as_displacement` with an image texture), and write each
# map as a 16-bit RGB PNG — tangent-space vectors remapped to 0.5 + v / (2 · amp), rows top to
# bottom, R = right, G = up, B = normal — plus vdm.json naming each brush with its asset
# metadata (licence, author, copyright, description) and `amp`. The PNG encoder is pure Python
# (zlib) so no colour management touches the data. Brushes are sorted by name.

import json
import os
import re
import struct
import zlib

import bpy

from tasks import common


def png16(path, width, height, rows):
    """rows: top-to-bottom lists of 0..65535 RGB triples flattened."""
    raw = b"".join(b"\x00" + struct.pack(f">{len(r)}H", *r) for r in rows)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 16, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "brush"


def run(request, inputs, work):
    library = common.input_file(request, "library", inputs)
    with bpy.data.libraries.load(library, assets_only=True) as (src, dst):
        dst.brushes = list(src.brushes)
    found = []
    outputs = []
    used = set()
    for brush in sorted((b for b in dst.brushes if b is not None), key=lambda b: b.name):
        tex = brush.texture
        if not getattr(brush, "use_color_as_displacement", False) or tex is None or tex.type != "IMAGE":
            continue
        img = tex.image
        if img is None or img.size[0] < 3 or img.size[1] < 3:
            continue
        w, h = img.size
        px = list(img.pixels)
        ch = img.channels
        vec = [px[i * ch : i * ch + 3] for i in range(w * h)]
        amp = max(max(abs(c) for c in v) for v in vec) or 1.0
        rows = []
        for y in range(h - 1, -1, -1):
            row = []
            for x in range(w):
                for c in vec[y * w + x]:
                    row.append(max(0, min(65535, round((0.5 + c / (2 * amp)) * 65535))))
            rows.append(row)
        name = slug(brush.name)
        while name in used:
            name += "_"
        used.add(name)
        file = f"{name}.png"
        png16(os.path.join(work, file), w, h, rows)
        meta = brush.asset_data
        found.append(
            {
                "brush": brush.name,
                "png": file,
                "amp": amp,
                "size": [w, h],
                "license": (meta.license if meta else "").strip(),
                "author": (meta.author if meta else "").strip(),
                "copyright": (meta.copyright if meta else "").strip(),
                "description": (meta.description if meta else "").strip(),
            }
        )
        outputs.append({"file": file, "mime": "image/png"})
    with open(os.path.join(work, "vdm.json"), "w", encoding="utf-8") as f:
        json.dump({"library": os.path.basename(library), "brushes": found}, f, indent=2, sort_keys=True)
    outputs.append({"file": "vdm.json", "mime": "application/json"})
    return {"outputs": outputs, "stats": {"brushes": len(found)}}
