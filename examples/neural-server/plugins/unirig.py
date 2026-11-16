"""unirig: `rig` a mesh with VAST-AI/UniRig (skeleton, then skin weights, then merge onto the mesh).

Runs UniRig's documented launch scripts in its own env (it needs bpy, spconv, torch_scatter):
  generate_skeleton.sh --input in.glb --output skel.fbx --seed S
  generate_skin.sh     --input skel.fbx --output skin.fbx
  merge.sh             --source skin.fbx --target in.glb --output rigged.glb
Request: mesh (GLB), seed. maxBones is not a UniRig knob: refused when set (the skeleton size is
the model's choice). Output: the rigged GLB (skins[0]).
Profile: repo = UniRig checkout, python = its env's interpreter.
"""

from __future__ import annotations

from plugins import _proc
from plugins.base import Job, Output, Plugin, PluginError, Result, hf_weights_sha256


class UniRig(Plugin):
    name = "unirig"
    task = "rig"
    licence = 'MIT (model card VAST-AI/UniRig: "license: mit"; code: MIT License, Copyright (c) 2025 VAST-AI-Research and contributors)'
    vram_gb = None  # not measured
    gpu = True  # the model runs on the GPU in its own process

    def available(self) -> str | None:
        return _proc.missing(self, "launch/inference/generate_skeleton.sh")

    def weights_sha256(self) -> str | None:
        return hf_weights_sha256("VAST-AI/UniRig")

    def run(self, job: Job) -> Result:
        if job.request.get("maxBones") is not None:
            raise PluginError("unirig chooses the skeleton size itself: drop maxBones")
        mesh = job.input_file("mesh", suffix=".glb")
        w = job.workdir
        _proc.run(
            self,
            job,
            [
                "bash",
                "launch/inference/generate_skeleton.sh",
                "--input",
                str(mesh),
                "--output",
                str(w / "skeleton.fbx"),
                "--seed",
                str(job.seed),
            ],
        )
        _proc.run(
            self,
            job,
            [
                "bash",
                "launch/inference/generate_skin.sh",
                "--input",
                str(w / "skeleton.fbx"),
                "--output",
                str(w / "skin.fbx"),
            ],
        )
        _proc.run(
            self,
            job,
            [
                "bash",
                "launch/inference/merge.sh",
                "--source",
                str(w / "skin.fbx"),
                "--target",
                str(mesh),
                "--output",
                str(w / "rigged.glb"),
            ],
        )
        return Result([Output("model/gltf-binary", (w / "rigged.glb").read_bytes())])
