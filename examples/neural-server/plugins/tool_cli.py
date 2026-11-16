"""CLI tool tasks as server plug-ins: `meshopt` through gltfpack (meshoptimizer, MIT) and `ktx2` through
basisu (Basis Universal, Apache-2.0). Same flags as ts23d's gltfpackAdapter / basisuAdapter
(src/neural/tool-adapters.ts), so a job gives the same bytes either way. Profile: `exe` = the binary
(default: on PATH; `t3d setup tools` puts them in ~/.ts23d/tools/bin). weights_sha256 names the tool
and its version: an encoder upgrade is a new cache key. Outputs are the user's ('own').
"""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess

from plugins.base import Job, Output, Plugin, PluginError, Result


class _FileTool(Plugin):
    tool = ""
    version_args: tuple[str, ...] = ()
    version_re = re.compile("")
    in_ext = ""
    out_ext = ""
    mime = ""
    vram_gb = 0.0

    def _exe(self) -> str | None:
        return str(self.option_path("exe")) if self.option_path("exe") else shutil.which(self.tool)

    def available(self) -> str | None:
        return (
            None
            if self._exe() and shutil.which(self._exe() or "")
            else f"{self.tool} not found: run `t3d setup tools` or set `exe`"
        )

    def version(self) -> str:
        r = subprocess.run(
            [self._exe() or self.tool, *self.version_args], capture_output=True, text=True, timeout=60, check=False
        )
        m = self.version_re.search(r.stdout + r.stderr)
        if not m:
            raise PluginError(f"{self.name}: {self._exe()} printed no version")
        return m.group(1)

    def weights_sha256(self) -> str | None:
        return hashlib.sha256(f"{self.tool} {self.version()}".encode()).hexdigest()

    def args(self, request: dict, i: str, o: str) -> list[str]:
        raise PluginError(f"{self.name} does not map requests")

    def run(self, job: Job) -> Result:
        field = "image" if self.task == "ktx2" else "mesh"
        data, _ = job.input(field)
        (job.workdir / f"in.{self.in_ext}").write_bytes(data)
        cmd = [self._exe() or self.tool, *self.args(job.request, f"in.{self.in_ext}", f"out.{self.out_ext}")]
        job.log.append(" ".join(cmd))
        r = subprocess.run(
            cmd,
            cwd=job.workdir,
            capture_output=True,
            text=True,
            timeout=float(self.options.get("timeout_s", 300)),
            check=False,
        )
        if r.returncode != 0:
            tail = "\n".join((r.stdout + r.stderr).splitlines()[-40:])
            raise PluginError(f"{self.name}: exited {r.returncode}:\n{tail}")
        out = job.workdir / f"out.{self.out_ext}"
        if not out.is_file():
            raise PluginError(f"{self.name}: wrote no out.{self.out_ext}")
        return Result([Output(self.mime, out.read_bytes())])


class Gltfpack(_FileTool):
    name = "gltfpack"
    task = "meshopt"
    licence = "own (gltfpack / meshoptimizer is MIT; outputs are yours)"
    tool = "gltfpack"
    version_args = ("-v",)
    version_re = re.compile(r"gltfpack (\d+\.\d+(?:\.\d+)?)")
    in_ext = out_ext = "glb"
    mime = "model/gltf-binary"

    def args(self, request: dict, i: str, o: str) -> list[str]:
        ratio = float(request.get("simplify", 1))
        if not 0 < ratio <= 1:
            raise PluginError(f"meshopt simplify {ratio} is outside (0, 1]")
        # Keep named pivots, materials, extras and constant clips; keep baked keys (no resampling).
        flags = ["-i", i, "-o", o, "-kn", "-km", "-ke", "-ac", "-af", "0"]
        flags += ["-c"] if request.get("compress") is True else ["-noq"]
        return flags + (["-si", str(ratio)] if ratio < 1 else [])


class Basisu(_FileTool):
    name = "basisu"
    task = "ktx2"
    licence = "own (Basis Universal is Apache-2.0; outputs are yours)"
    tool = "basisu"
    version_args = ("-version",)
    version_re = re.compile(r"Basis Universal[^\n]*?v(\d+\.\d+(?:\.\d+)?)")
    in_ext = "png"
    out_ext = "ktx2"
    mime = "image/ktx2"

    def args(self, request: dict, i: str, o: str) -> list[str]:
        mode = request.get("mode")
        if mode not in ("uastc", "etc1s"):
            raise PluginError(f"ktx2 mode {mode!r} is unknown (uastc | etc1s)")
        flags = ["-ktx2", "-uastc" if mode == "uastc" else "-etc1s"]
        flags += [] if request.get("mipmaps") is False else ["-mipmap"]
        flags += ["-linear" if request.get("srgb") is False else "-srgb"]
        return flags + ["-file", i, "-output_file", o]
