"""The plug-in interface of the reference t3d-neural/1 server: one model = one `Plugin` subclass.

A plug-in file is any `plugins/<name>.py` not starting with `_` (helpers) and not `base.py`. The
registry (registry.py) imports every such file and registers each `Plugin` subclass *defined in it*
whose `name` is set, so adding a model is dropping a file in: no list to edit. Importing a plug-in
file must be cheap and must not need a GPU: import torch / diffusers / the model repo inside
`load()` or `run()`, never at module level.

Contract (what the server reads):
  name           model id on the wire (`GET /v1/models` id, `POST /v1/jobs` model)
  task           one of TASKS
  licence        the licence of the model's *outputs*: SPDX id first (the ts23d repo's publish gate
                 reads the leading id), then the model card's words verbatim, e.g.
                 'MIT (model card: "license: mit")'
  vram_gb        peak VRAM of one job, measured, or None
  weights_sha256()  sha256 naming the exact weights (enters every job key), or None
  available()    None when it can run here, else the reason (missing repo, weights, binary)
  load()/unload() make it resident / free it; the server keeps one plug-in resident at a time
  ram_gb         system RAM the loaded model holds (CPU-offloaded weights count), or None
  gpu            True: takes the machine-wide lease (one model process per machine) and waits for
                 vram_gb + 1 GB VRAM and ram_gb + 4 GB RAM free before load (gpu.py)
  isolate        True: load/run in a child process ended on unload (isolated.py): the only sure way
                 to hand a big PyTorch model's VRAM back. Set it for GPU models.
  run(job)       -> Result(outputs=[Output(mime, data)], score=None)

`__init__(options)` gets the plug-in's table from the profile (`[plugins.<name>]`), so paths and
knobs live in profiles, not code. Raise PluginError (or anything) from run(): the job fails with
the message, the server logs the traceback.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar

CONTRACT = "t3d-neural/1"
TASKS = (
    "image",
    "mesh",
    "texture",
    "rig",
    "motion",
    "hair",
    "score",
    "cloth",
    "fracture",
    "engine-check",
    "ktx2",
    "meshopt",
    "groom",
    "blender",
)
# Mirrors NEURAL_MIMES in src/core/neural-task.ts: anything else is refused before it leaves.
MIMES: dict[str, tuple[str, ...]] = {
    "image": ("image/png",),
    "mesh": ("model/gltf-binary",),
    "texture": ("image/png",),
    "rig": ("model/gltf-binary", "application/json"),
    "motion": ("model/gltf-binary", "application/json"),
    "hair": ("model/gltf-binary", "application/json"),
    "score": ("application/json", "image/png"),
    "cloth": ("model/gltf-binary",),
    "fracture": ("model/gltf-binary", "application/json"),
    "engine-check": ("application/json",),
    "ktx2": ("image/ktx2",),
    "meshopt": ("model/gltf-binary",),
    "groom": ("model/gltf-binary", "application/json"),
    "blender": ("model/gltf-binary", "application/json", "image/png"),
}
# Request fields that name input files (inputsOf in src/neural/adapter.ts), in that order.
INPUT_FIELDS = ("image", "video", "mesh", "garment", "body", "skeleton", "control", "images", "guides", "program")


class PluginError(Exception):
    """A job a plug-in refuses or cannot finish; the message becomes the job's `error`."""


@dataclass(frozen=True)
class Output:
    mime: str
    data: bytes


@dataclass(frozen=True)
class Result:
    outputs: list[Output]
    score: float | None = None


@dataclass
class Job:
    """One accepted job: the request as sent, input bytes by sha256, a private scratch dir."""

    id: str
    task: str
    model: str
    request: dict[str, Any]
    inputs: dict[str, bytes]
    workdir: Path
    log: list[str] = field(default_factory=list)

    def input_refs(self, name: str) -> list[dict[str, str]]:
        """The `{sha256, mime}` refs in request field `name` (one or a list)."""
        v = self.request.get(name)
        if isinstance(v, dict):
            return [v]
        return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []

    def input(self, name: str, index: int = 0) -> tuple[bytes, str]:
        """Bytes and mime of input `name[index]`; PluginError when the request has none."""
        refs = self.input_refs(name)
        if index >= len(refs):
            raise PluginError(f"{self.model} needs request.{name}[{index}] (an input file)")
        ref = refs[index]
        return self.inputs[ref["sha256"]], str(ref.get("mime", ""))

    def input_file(self, name: str, index: int = 0, suffix: str = "") -> Path:
        """Input `name[index]` written into the job's workdir, for models that read paths."""
        data, _ = self.input(name, index)
        p = self.workdir / f"{name}-{index}{suffix}"
        p.write_bytes(data)
        return p

    def param(self, key: str, default: Any) -> Any:
        """`request.params[key]` coerced to the default's type."""
        v = (self.request.get("params") or {}).get(key, default)
        if isinstance(default, bool):
            return bool(v)
        if isinstance(default, (int, float)) and not isinstance(v, bool):
            return type(default)(v)
        return v

    @property
    def seed(self) -> int:
        return int(self.request.get("seed", 0))


class Plugin:
    name: ClassVar[str] = ""
    task: ClassVar[str] = ""
    licence: ClassVar[str] = ""
    vram_gb: ClassVar[float | None] = None
    isolate: ClassVar[bool] = False
    gpu: ClassVar[bool] = False
    ram_gb: ClassVar[float | None] = None

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        self.options: dict[str, Any] = dict(options or {})
        self.resident = False

    def option_path(self, key: str, default: str | None = None) -> Path | None:
        v = self.options.get(key, default)
        return Path(os.path.expanduser(str(v))) if v else None

    def weights_sha256(self) -> str | None:
        return None

    def available(self) -> str | None:
        return None

    def load(self) -> None:
        self.resident = True

    def unload(self) -> None:
        self.resident = False

    def run(self, job: Job) -> Result:
        raise PluginError(f"{self.name} does not implement run()")


def free_cuda() -> None:
    """Return cached CUDA memory after unload (no-op without torch)."""
    import gc

    gc.collect()
    try:
        import torch
    except ImportError:
        return
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def hf_snapshot(repo_id: str) -> Path | None:
    """The cached snapshot dir of a Hugging Face repo (refs/main), or None when not downloaded."""
    home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    hub = Path(os.environ.get("HF_HUB_CACHE", home / "hub"))
    root = hub / f"models--{repo_id.replace('/', '--')}"
    ref = root / "refs" / "main"
    if not ref.is_file():
        return None
    snap = root / "snapshots" / ref.read_text().strip()
    return snap if snap.is_dir() else None


def hf_weights_sha256(repo_id: str) -> str | None:
    """sha256 over the snapshot's (path, blob id) list. LFS blobs are named by their sha256, so this
    names the exact weights without reading gigabytes; None when the repo is not downloaded."""
    snap = hf_snapshot(repo_id)
    if snap is None:
        return None
    h = hashlib.sha256(f"{repo_id}\n".encode())
    for p in sorted(snap.rglob("*")):
        if p.is_file():
            blob = os.path.basename(os.path.realpath(p))
            h.update(f"{p.relative_to(snap).as_posix()}\t{blob}\n".encode())
    return h.hexdigest()


def png_bytes(image: Any, size: tuple[int, int] | None = None) -> bytes:
    """A PIL image as 8-bit RGB(A) PNG bytes, resized to exactly `size` (w, h) when given."""
    import io

    if size is not None and image.size != size:
        image = image.resize(size)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.mode else "RGB")
    buf = io.BytesIO()
    image.save(buf, "PNG")
    return buf.getvalue()
