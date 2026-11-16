"""qwen-image: `image` from text with Qwen/Qwen-Image (diffusers QwenImagePipeline), with prompt
templates for the two images a ts23d recipe asks for:

  params.template = "concept"     one hero concept thumbnail of the subject
                  = "turnaround"  orthographic front / side / back turnaround on one sheet, flat light
                  = "raw"         the prompt as given (default)

Output: one PNG of exactly width x height (generated at the nearest multiple of 16, then resized).
params: steps (default 50), cfg (true_cfg_scale, default 4.0). Weights are ~58 GB on disk (bf16);
on a 24 GB card set `offload = true` (enable_model_cpu_offload; needs ~64 GB system RAM).
"""

from __future__ import annotations

from typing import Any

from plugins.base import Job, Output, Plugin, PluginError, Result, free_cuda, hf_weights_sha256, png_bytes

REPO = "Qwen/Qwen-Image"
TEMPLATES = {
    "raw": "{prompt}",
    "concept": "Concept art thumbnail of {prompt}. Single subject, full body, clear silhouette, three-quarter "
    "view, neutral grey background, soft studio light, readable shapes and materials.",
    "turnaround": "Orthographic turnaround sheet of {prompt}: front view, side view and back view side by side, "
    "same scale, aligned on one ground line, neutral pose, flat even lighting, no perspective, plain light grey "
    "background, no text.",
}
NEGATIVE = "text, watermark, logo, cropped, blurry, perspective distortion, extra limbs"


def template(job: Job) -> tuple[str, str]:
    name = str(job.param("template", "raw"))
    if name not in TEMPLATES:
        raise PluginError(f"params.template '{name}' is not one of {sorted(TEMPLATES)}")
    return TEMPLATES[name].format(prompt=job.request["prompt"]), str(job.request.get("negative") or NEGATIVE)


def to16(n: int) -> int:
    return max(256, round(n / 16) * 16)


class QwenImage(Plugin):
    name = "qwen-image"
    task = "image"
    licence = 'Apache-2.0 (model card Qwen/Qwen-Image: "license: apache-2.0")'
    vram_gb = None  # not measured (offload trades VRAM for time)
    isolate = True
    gpu = True
    ram_gb = 60.0  # estimate: bf16 weights offloaded to RAM
    repo = REPO
    pipeline_class = "QwenImagePipeline"

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        super().__init__(options)
        self.pipe: Any = None

    def available(self) -> str | None:
        import importlib.util

        for mod in ("torch", "diffusers"):
            if importlib.util.find_spec(mod) is None:
                return f"python module '{mod}' is missing: run inside the model venv"
        return None

    def weights_sha256(self) -> str | None:
        return hf_weights_sha256(self.repo)

    def load(self) -> None:
        import diffusers
        import torch

        cls = getattr(diffusers, self.pipeline_class)
        self.pipe = cls.from_pretrained(self.repo, torch_dtype=torch.bfloat16)
        if self.options.get("offload", True):
            self.pipe.enable_model_cpu_offload()
        else:
            self.pipe.to("cuda")
        super().load()

    def unload(self) -> None:
        self.pipe = None
        free_cuda()
        super().unload()

    def generate(self, job: Job, prompt: str, negative: str, **extra: Any) -> Result:
        import torch

        w, h = int(job.request["width"]), int(job.request["height"])
        image = self.pipe(
            prompt=prompt,
            negative_prompt=negative,
            width=to16(w),
            height=to16(h),
            num_inference_steps=job.param("steps", 50),
            true_cfg_scale=job.param("cfg", 4.0),
            generator=torch.Generator(device="cpu").manual_seed(job.seed),
            **extra,
        ).images[0]
        return Result([Output("image/png", png_bytes(image, (w, h)))])

    def run(self, job: Job) -> Result:
        return self.generate(job, *template(job))
