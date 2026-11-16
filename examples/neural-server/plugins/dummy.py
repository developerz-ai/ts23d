"""Dummy plug-ins (no GPU, no deps): deterministic outputs that pass ts23d's validation, for the
contract test and for trying the wire end to end (`profiles/dummy.toml`).

dummy-mesh   mesh   a tetrahedron GLB scaled by params.size (default 0.5 m), seeded jitter
dummy-image  image  a solid PNG of the requested width x height, colour from the seed
dummy-score  score  JSON {cosine}; score = 5 + (number of images mod 6)
"""

from __future__ import annotations

import json
import random
import struct
import zlib

from plugins.base import Job, Output, Plugin, Result

LICENCE = "CC0-1.0 (dummy outputs, made by this file)"


def tetra_glb(size: float, seed: int) -> bytes:
    rng = random.Random(seed)
    s = size
    pos = [(0.0, 0.0, 0.0), (s, 0.0, 0.0), (0.0, s, 0.0), (0.0, 0.0, s)]
    pos = [tuple(c + rng.uniform(-0.01, 0.01) * s for c in p) for p in pos]
    idx = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
    vbin = b"".join(struct.pack("<3f", *p) for p in pos)
    ibin = struct.pack(f"<{len(idx)}H", *idx)
    ibin += b"\0" * (-len(ibin) % 4)
    lo = [min(p[i] for p in pos) for i in range(3)]
    hi = [max(p[i] for p in pos) for i in range(3)]
    doc = {
        "asset": {"version": "2.0", "generator": "t3d-neural dummy-mesh"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "dummy"}],
        "meshes": [{"name": "dummy", "primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "buffers": [{"byteLength": len(vbin) + len(ibin)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(vbin), "target": 34962},
            {"buffer": 0, "byteOffset": len(vbin), "byteLength": len(idx) * 2, "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 4, "type": "VEC3", "min": lo, "max": hi},
            {"bufferView": 1, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ],
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binc = vbin + ibin
    total = 12 + 8 + len(js) + 8 + len(binc)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(js), b"JSON")
        + js
        + struct.pack("<I4s", len(binc), b"BIN\0")
        + binc
    )


def solid_png(w: int, h: int, rgb: tuple[int, int, int]) -> bytes:
    row = b"\0" + bytes(rgb) * w
    raw = zlib.compress(row * h)

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


class DummyMesh(Plugin):
    name = "dummy-mesh"
    task = "mesh"
    licence = LICENCE
    vram_gb = 0

    def run(self, job: Job) -> Result:
        return Result([Output("model/gltf-binary", tetra_glb(job.param("size", 0.5), job.seed))])


class DummyImage(Plugin):
    name = "dummy-image"
    task = "image"
    licence = LICENCE
    vram_gb = 0

    def run(self, job: Job) -> Result:
        w, h = int(job.request["width"]), int(job.request["height"])
        rng = random.Random(job.seed)
        rgb = (rng.randrange(256), rng.randrange(256), rng.randrange(256))
        return Result([Output("image/png", solid_png(w, h, rgb))])


class DummyScore(Plugin):
    name = "dummy-score"
    task = "score"
    licence = LICENCE
    vram_gb = 0

    def run(self, job: Job) -> Result:
        n = len(job.input_refs("images"))
        body = json.dumps({"images": n, "cosine": 0.5}).encode()
        return Result([Output("application/json", body)], score=float(5 + n % 6))
