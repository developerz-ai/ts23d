# SPDX-License-Identifier: GPL-2.0-or-later
"""Blender tool tasks (cloth, rig, fracture, groom, blender steps) as server plug-ins: the PRIMARY Blender path.

Runs the same task scripts as ts23d's blenderAdapter (examples/blender/tasks/*.py), one of three ways,
first match wins (profile table `[plugins.blender-cloth]` etc.):
  blender = "/path/to/blender"   a Blender app, headless (--factory-startup, -t 1, exit code 3)
  python  = "~/.ts23d/venv-bpy/.venv/bin/python"   an env with `pip install bpy` (pinned LTS + its Python)
  (neither)                      `import bpy` in this server's own env (its Python must match bpy's)
Every way writes job.json beside the inputs and reads report.json, exactly like the TS adapter.
weights_sha256 = sha256(Blender version + the task's script bytes): an upgrade or a script edit is a
new cache key. Outputs: 'own' — "What you create with Blender is your sole property" (blender.org/
about/license); these scripts call bpy, so they are GPL-2.0-or-later like Blender.
Blender is not thread-safe and keeps one scene per process: isolate = true runs each job's load in a
child process the server ends on unload.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

from plugins.base import Job, Output, Plugin, PluginError, Result

BLENDER_DIR = Path(__file__).resolve().parents[2] / "blender"
EXT = {"model/gltf-binary": "glb", "image/png": "png", "application/json": "json"}
LICENCE = 'own (Blender licence: "What you create with Blender is your sole property"; scripts GPL-2.0-or-later)'
VERSION_EXPR = "import bpy; print('Blender', bpy.app.version_string)"


class _BlenderTask(Plugin):
    licence = LICENCE
    isolate = True
    vram_gb = 0.0
    step_files: tuple[str, ...] = ()

    def _route(self) -> tuple[str, Path | None]:
        if self.option_path("blender"):
            return "blender", self.option_path("blender")
        if self.option_path("python"):
            return "python", self.option_path("python")
        return "inline", None

    def available(self) -> str | None:
        route, exe = self._route()
        if route == "inline":
            return (
                None
                if importlib.util.find_spec("bpy")
                else "no bpy here: pip install bpy (matching Python), or set `python`/`blender`"
            )
        if exe is None or not os.access(exe, os.X_OK):
            return f"{route} '{exe}' is not an executable"
        return None

    def _version(self) -> str:
        route, exe = self._route()
        if route == "inline":
            import bpy

            return bpy.app.version_string
        args = (
            [str(exe), "--factory-startup", "-noaudio", "--version"]
            if route == "blender"
            else [str(exe), "-I", "-c", VERSION_EXPR]
        )
        out = subprocess.run(args, capture_output=True, text=True, timeout=120, check=False).stdout
        line = next((ln for ln in out.splitlines() if ln.startswith("Blender ")), "")
        if not line:
            raise PluginError(f"{self.name}: {exe} printed no Blender version")
        return line[len("Blender ") :].strip()

    def _scripts(self) -> list[Path]:
        return [
            BLENDER_DIR / "ts23d_job.py",
            BLENDER_DIR / "tasks" / "common.py",
            BLENDER_DIR / "tasks" / f"{self.task}.py",
            *(BLENDER_DIR / "tasks" / "steps" / f"{name}.py" for name in self.step_files),
        ]

    def weights_sha256(self) -> str | None:
        h = hashlib.sha256(f"blender {self._version()}\n".encode())
        for p in self._scripts():
            h.update(p.read_bytes())
        return h.hexdigest()

    def run(self, job: Job) -> Result:
        work = job.workdir
        files = {}
        for sha, data in job.inputs.items():
            mime = next(
                (
                    r.get("mime", "")
                    for f in ("garment", "body", "mesh", "guides", "program", "skeleton")
                    for r in job.input_refs(f)
                    if r.get("sha256") == sha
                ),
                "",
            )
            name = f"in-{sha[:16]}.{EXT.get(mime, 'bin')}"
            (work / name).write_bytes(data)
            files[sha] = name
        spec = {"contract": "t3d-blender/1", "task": job.task, "request": job.request, "inputs": files}
        (work / "job.json").write_text(json.dumps(spec))
        route, exe = self._route()
        if route == "inline":
            self._inline(job, files)
        else:
            entry = str(BLENDER_DIR / "ts23d_job.py")
            head = (
                [
                    str(exe),
                    "-b",
                    "--factory-startup",
                    "-noaudio",
                    "-t",
                    str(int((job.request.get("params") or {}).get("threads", 1))),
                    "--python-exit-code",
                    "3",
                    "--python",
                    entry,
                ]
                if route == "blender"
                else [str(exe), "-I", entry]
            )
            cmd = [*head, "--", str(work / "job.json")]
            job.log.append(" ".join(cmd))
            r = subprocess.run(
                cmd,
                cwd=work,
                capture_output=True,
                text=True,
                timeout=float(self.options.get("timeout_s", 600)),
                check=False,
            )
            if r.returncode != 0 and not (work / "report.json").exists():
                tail = "\n".join((r.stdout + r.stderr).splitlines()[-40:])
                raise PluginError(f"{self.name}: blender exited {r.returncode}:\n{tail}")
        return self._outputs(work)

    def _inline(self, job: Job, files: dict[str, str]) -> None:
        if str(BLENDER_DIR) not in sys.path:
            sys.path.insert(0, str(BLENDER_DIR))
        common = importlib.import_module("tasks.common")
        task = importlib.import_module(f"tasks.{job.task}")
        common.reset_scene()
        result = task.run(job.request, {sha: str(job.workdir / n) for sha, n in files.items()}, str(job.workdir))
        (job.workdir / "report.json").write_text(json.dumps({"ok": True, **result}))

    def _outputs(self, work: Path) -> Result:
        try:
            report = json.loads((work / "report.json").read_text())
        except (OSError, ValueError) as e:
            raise PluginError(f"{self.name}: no readable report.json ({e})") from e
        if not report.get("ok"):
            raise PluginError(f"{self.name}: {report.get('error', 'report says not ok')}")
        outs = []
        for o in report.get("outputs", []):
            name = str(o.get("file", ""))
            if "/" in name or name.startswith("."):
                raise PluginError(f"{self.name}: report names output '{name}'")
            outs.append(Output(str(o.get("mime", "")), (work / name).read_bytes()))
        return Result(outs)


class BlenderCloth(_BlenderTask):
    name = "blender-cloth"
    task = "cloth"


class BlenderRig(_BlenderTask):
    name = "blender-rig"
    task = "rig"


class BlenderFracture(_BlenderTask):
    name = "blender-fracture"
    task = "fracture"


class BlenderGroom(_BlenderTask):
    """Guide curves on a scalp → child hair curves (bundled CC0 hair node groups) → lock cards."""

    name = "blender-groom"
    task = "groom"


class BlenderSteps(_BlenderTask):
    """An ordered step program (t3d-blender-steps/1) on a mesh → GLB with lod0..2 + a JSON report.

    The bake step uses the GPU when Cycles finds one: run it while no model is resident.
    step_files mirrors BLENDER_STEP_FILES in src/neural/blender-adapter.ts (same order).
    """

    name = "blender-steps"
    task = "blender"
    step_files = (
        "__init__",
        "state",
        "io",
        "clean",
        "remesh",
        "retopo",
        "build",
        "deform",
        "uv",
        "bake",
        "bake_source",
        "bind",
        "lods",
    )
