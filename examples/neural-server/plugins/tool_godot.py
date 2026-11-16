"""`engine-check` through Godot headless (MIT) as a server plug-in: the same two runs and the same check
script as ts23d's godotAdapter (src/neural/godot-adapter.ts; a test there keeps CHECK_GD identical).
`godot --headless --path <proj> --import` runs the editor's scene importer (`-colonly` nodes become
collision shapes), then CHECK_GD loads the scene, counts meshes / skeletons / bones / collision shapes /
bodies, plays every clip half way and writes the report; importer ERROR / WARNING lines are added with
the temp path masked. Profile: `exe` = Godot 4.2+ (default: `godot` on PATH). Outputs: 'own'.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess

from plugins.base import Job, Output, Plugin, PluginError, Result

GODOT_PROJECT = """config_version=5

[application]

config/name="t3d-engine-check"
"""

CHECK_GD = """extends SceneTree

var counts = {"meshes": 0, "skeletons": 0, "bones": 0, "collisionShapes": 0, "bodies": 0}
var players = []

func walk(n):
\tif n is MeshInstance3D: counts.meshes += 1
\tif n is Skeleton3D:
\t\tcounts.skeletons += 1
\t\tcounts.bones += n.get_bone_count()
\tif n is CollisionShape3D: counts.collisionShapes += 1
\tif n is CollisionObject3D: counts.bodies += 1
\tif n is AnimationPlayer: players.append(n)
\tfor c in n.get_children(): walk(c)

func _initialize():
\tvar out = OS.get_cmdline_user_args()[0]
\tvar report = {"engine": "godot", "version": Engine.get_version_info().string, "ok": false}
\tvar scene = load("res://asset.glb")
\tif scene == null:
\t\treport["error"] = "res://asset.glb did not import"
\telse:
\t\tvar root = scene.instantiate()
\t\tget_root().add_child(root)
\t\twalk(root)
\t\tvar clips = []
\t\tfor p in players:
\t\t\tfor name in p.get_animation_list():
\t\t\t\tvar a = p.get_animation(name)
\t\t\t\tp.play(name)
\t\t\t\tp.advance(a.length * 0.5)
\t\t\t\tclips.append({"name": String(name), "length": snappedf(a.length, 0.0001), "tracks": a.get_track_count(), "played": p.is_playing()})
\t\treport.merge(counts)
\t\treport["animations"] = clips
\t\treport["ok"] = counts.meshes > 0
\tvar f = FileAccess.open(out, FileAccess.WRITE)
\tf.store_string(JSON.stringify(report, "  ", true))
\tf.close()
\tquit(0)
"""


def importer_lines(text: str, work: str) -> dict[str, list[str]]:
    lines = [ln.replace(work, "<work>").strip() for ln in text.splitlines()]

    def pick(p: str) -> list[str]:
        return sorted({ln[len(p) :].strip() for ln in lines if ln.startswith(p)})

    return {"importErrors": pick("ERROR:"), "importWarnings": pick("WARNING:")}


class Godot(Plugin):
    name = "godot"
    task = "engine-check"
    licence = "own (Godot Engine is MIT; the report is yours)"
    vram_gb = 0.0

    def _exe(self) -> str | None:
        return str(self.option_path("exe")) if self.option_path("exe") else shutil.which("godot")

    def available(self) -> str | None:
        return (
            None
            if self._exe() and shutil.which(self._exe() or "")
            else "godot not found: run `t3d setup tools` or set `exe`"
        )

    def version(self) -> str:
        r = subprocess.run(
            [self._exe() or "godot", "--headless", "--version"], capture_output=True, text=True, timeout=60, check=False
        )
        m = re.search(r"^(\d+\.\d+(?:\.\d+)?\.[\w.]+)", r.stdout, re.M)
        if not m:
            raise PluginError(f"godot: {self._exe()} printed no version")
        return m.group(1)

    def weights_sha256(self) -> str | None:
        script = hashlib.sha256((GODOT_PROJECT + CHECK_GD).encode()).hexdigest()
        return hashlib.sha256(f"godot {self.version()} {script}".encode()).hexdigest()

    def _godot(self, job: Job, args: list[str]) -> subprocess.CompletedProcess[str]:
        cmd = [self._exe() or "godot", "--headless", "--path", str(job.workdir), *args]
        job.log.append(" ".join(cmd))
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=float(self.options.get("timeout_s", 300)), check=False
        )
        if r.returncode != 0:
            tail = "\n".join((r.stdout + r.stderr).splitlines()[-40:])
            raise PluginError(f"godot exited {r.returncode}:\n{tail}")
        return r

    def run(self, job: Job) -> Result:
        data, _ = job.input("mesh")
        work = job.workdir
        (work / "project.godot").write_text(GODOT_PROJECT)
        (work / "t3d_check.gd").write_text(CHECK_GD)
        (work / "asset.glb").write_bytes(data)
        imported = self._godot(job, ["--import"])
        self._godot(job, ["--script", "res://t3d_check.gd", "--", str(work / "report.json")])
        if not (work / "report.json").is_file():
            raise PluginError("godot wrote no report.json")
        report = json.loads((work / "report.json").read_text())
        report.update(importer_lines(imported.stdout + "\n" + imported.stderr, str(work)))
        text = json.dumps(report, indent=2, sort_keys=True) + "\n"
        return Result([Output("application/json", text.encode())])
