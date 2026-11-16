"""hairdeck: `hair` cards + spring-bone chains from one character image (hyz317/HairDeck).

Runs HairDeck's documented CLI in its own env:
    python scripts/image_to_hair.py <image> --out <job>/out --n 1 --seed S
Request: image (the character / hairstyle picture; required here, optional in the `hair` type).
Outputs: hair_seed<S>_nohead.glb (cards with per-card UVs and colours, no head proxy) and
chains_seed<S>.json (spring-bone chains). HairDeck needs the gated SAM 3 and DINOv3 licences
accepted on Hugging Face first.
Profile: repo, python.
"""

from __future__ import annotations

from plugins import _proc
from plugins.base import Job, Output, Plugin, Result, hf_weights_sha256


class HairDeck(Plugin):
    name = "hairdeck"
    task = "hair"
    licence = 'Apache-2.0 (model card hyz317/HairDeck: "license: apache-2.0"; README: "HairDeck code and checkpoints are licensed under Apache-2.0. Third-party models, code and datasets retain their respective licences.")'
    vram_gb = None  # not measured
    gpu = True  # the model runs on the GPU in its own process

    def available(self) -> str | None:
        return _proc.missing(self, "scripts/image_to_hair.py")

    def weights_sha256(self) -> str | None:
        return hf_weights_sha256("hyz317/HairDeck")

    def run(self, job: Job) -> Result:
        image = job.input_file("image", suffix=".png")
        out = job.workdir / "out"
        _proc.run(
            self,
            job,
            [
                "{python}",
                "scripts/image_to_hair.py",
                str(image),
                "--out",
                str(out),
                "--n",
                "1",
                "--seed",
                str(job.seed),
            ],
        )
        s = job.seed
        glb = _proc.newest(out, f"hair_seed{s}_nohead.glb")
        chains = _proc.newest(out, f"chains_seed{s}.json")
        return Result([Output("model/gltf-binary", glb.read_bytes()), Output("application/json", chains.read_bytes())])
