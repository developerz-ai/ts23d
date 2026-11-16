"""Shared by the TRELLIS.2-backbone plug-ins (pixal3d, trellis2): repo import, the gated-dependency
swaps, and the o-voxel GLB export sized for a ts23d recipe cache (8 MB per recipe, ADR 014).

Gated swaps (both pipelines ask for repos the default HF token is refused):
  facebook/dinov3-vitl16-pretrain-lvd1689m -> camenduru/dinov3-vitl16-pretrain-lvd1689m (same weights)
  briaai/RMBG-2.0 (CC BY-NC 4.0)           -> ZhengPeng7/BiRefNet (MIT, same BiRefNet class)
Set REMBG_MODEL=briaai/RMBG-2.0 after accepting its licence to keep the original.
"""

from __future__ import annotations

import importlib.util
import io
import os
import sys
from pathlib import Path
from typing import Any

from plugins.base import Job, PluginError, hf_weights_sha256

SWAP = {
    "facebook/dinov3-vitl16-pretrain-lvd1689m": "camenduru/dinov3-vitl16-pretrain-lvd1689m",
    "briaai/RMBG-2.0": os.environ.get("REMBG_MODEL", "ZhengPeng7/BiRefNet"),
}

# Default output size for a recipe cache: ~50 k triangles + one 1024² PNG stays well under 8 MB.
DEFAULT_TRIANGLES = 50_000
DEFAULT_TEXTURE = 1024


def missing(repo: Path | None, marker: str) -> str | None:
    """Why this TRELLIS-family plug-in cannot run here, or None."""
    if repo is None or not (repo / marker).exists():
        return f"repo not found ({repo}/{marker}); set `repo` in the profile"
    for mod in ("torch", "o_voxel", "cumesh", "flex_gemm", "nvdiffrast"):
        if importlib.util.find_spec(mod) is None:
            return f"python module '{mod}' is missing: run inside the model venv (README 'GPU setup')"
    return None


def on_path(repo: Path) -> None:
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))


def swap_init(cls: Any) -> None:
    """Route a from_pretrained-style __init__(model_name) past the gated repos (idempotent)."""
    if getattr(cls, "_t3d_swapped", False):
        return
    orig = cls.__init__

    def init(self: Any, model_name: str = "ZhengPeng7/BiRefNet", *a: Any, **k: Any) -> None:
        orig(self, SWAP.get(model_name, model_name), *a, **k)

    cls.__init__ = init
    cls._t3d_swapped = True


def weights(*repos: str) -> str | None:
    """One sha over every repo's snapshot hash; None if any is not downloaded."""
    import hashlib

    parts = [hf_weights_sha256(r) for r in repos]
    if any(p is None for p in parts):
        return None
    return hashlib.sha256("\n".join(f"{r}={p}" for r, p in zip(repos, parts)).encode()).hexdigest()


def target_triangles(job: Job) -> int:
    cap = job.request.get("maxTriangles")
    want = job.param("triangles", DEFAULT_TRIANGLES)
    return int(min(want, cap * 0.95)) if isinstance(cap, (int, float)) else want


def glb_bytes(job: Job, mesh: Any, layout: Any, rotate: Any = None, **grid: Any) -> bytes:
    """o-voxel mesh -> remeshed, decimated, UV-unwrapped, PNG-textured GLB bytes, under the cap."""
    import o_voxel

    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices,
        faces=mesh.faces,
        attr_volume=mesh.attrs,
        coords=mesh.coords,
        attr_layout=layout,
        aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=target_triangles(job),
        texture_size=job.param("texture_size", DEFAULT_TEXTURE),
        remesh=True,
        remesh_band=1,
        remesh_project=0,
        **grid,
    )
    if rotate is not None:
        glb.apply_transform(rotate)
    faces = len(glb.faces)
    cap = job.request.get("maxTriangles")
    if isinstance(cap, (int, float)) and faces > cap:
        raise PluginError(f"decimation left {faces} triangles, cap {cap}: lower params.triangles")
    buf = io.BytesIO()
    glb.export(buf, file_type="glb")  # PNG textures (no EXT_texture_webp): ts23d decodes PNG only
    job.log.append(f"{faces} triangles, {buf.tell()} bytes")
    return buf.getvalue()


def image_input(job: Job) -> Any:
    from PIL import Image

    data, _ = job.input("image")
    try:
        return Image.open(io.BytesIO(data))
    except Exception as e:
        raise PluginError(f"request.image does not decode as an image: {e}") from e
