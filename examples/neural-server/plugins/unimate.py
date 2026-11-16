"""unimate: `motion` from text for a rigged asset with UniMate (Friedrich-M/UniMate, SIGGRAPH Asia 2026).

The released checkpoints are CC BY-NC 4.0: outputs may not be used commercially, and the ts23d
repository's publish gate refuses to commit them (ADR 015). Your own builds are not gated.

UniMate is conditioned on a prepared asset (joint labels + facing pair, made by its
`rig_preprocess` tool, which asks an LLM and stops for review), so the request's `skeleton` input
is a JSON naming that asset, not raw bones:
    {"unimate": "mixamo"}                       a dataset skeleton (`<dataset>:<type>`, `mixamo`)
    {"unimate": "assets/examples/eagle"}        an asset dir inside the UniMate repo
Runs, in UniMate's env:
    python -m unimate.inference.sample --exp_dir <exp_dir> --asset <ref> --prompt <prompt> \
        --seed S --num_repetitions 1 --output_dir <job>/samples
    bash scripts/run_animate_motion.sh <job>/samples <job>/animated
Output: the asset's mesh animated by the motion (GLB). Clips are a fixed 60 frames: the request
must ask seconds x fps = 60 (e.g. 2 s at 30 fps). Prompts read best as "An object <does one thing>."
Profile: repo, python, exp_dir (relative to repo; default outputs/unimate_uniml3d_f60_v3).
"""

from __future__ import annotations

import json

from plugins import _proc
from plugins.base import Job, Output, Plugin, PluginError, Result

FRAMES = 60


class UniMate(Plugin):
    name = "unimate"
    task = "motion"
    licence = 'CC-BY-NC-4.0 (model card Linzhan/UniMate: "license: cc-by-nc-4.0"; README: "The released checkpoints are under CC BY-NC 4.0"; code: MIT)'
    vram_gb = None  # not measured
    gpu = True  # the model runs on the GPU in its own process

    def available(self) -> str | None:
        return _proc.missing(self, "unimate/inference/sample.py")

    def run(self, job: Job) -> Result:
        frames = round(float(job.request["seconds"]) * float(job.request["fps"]))
        if frames != FRAMES:
            raise PluginError(f"unimate makes {FRAMES}-frame clips; the request asks {frames} (seconds x fps)")
        try:
            ref = json.loads(job.input("skeleton")[0])["unimate"]
        except (ValueError, KeyError, TypeError) as e:
            raise PluginError('skeleton must be JSON {"unimate": "<dataset ref or asset dir>"}') from e
        samples, animated = job.workdir / "samples", job.workdir / "animated"
        exp = str(self.options.get("exp_dir", "outputs/unimate_uniml3d_f60_v3"))
        _proc.run(
            self,
            job,
            [
                "{python}",
                "-m",
                "unimate.inference.sample",
                "--exp_dir",
                exp,
                "--asset",
                str(ref),
                "--prompt",
                str(job.request["prompt"]),
                "--seed",
                str(job.seed),
                "--num_repetitions",
                "1",
                "--output_dir",
                str(samples),
            ],
        )
        _proc.run(self, job, ["bash", "scripts/run_animate_motion.sh", str(samples), str(animated)])
        return Result([Output("model/gltf-binary", _proc.newest(animated, "*.glb").read_bytes())])
