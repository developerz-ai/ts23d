"""z-image: `image` from text with Tongyi-MAI/Z-Image-Turbo (6B, 8 DiT steps, guidance 0), the default
local image model. kubeez.com hosts `z-image` too, so the no-GPU path (kubeezAdapter) gives the same
model. Same prompt templates as qwen-image (params.template raw|concept|turnaround).

Output: one PNG of exactly width x height (generated at the nearest multiple of 16, then resized).
params: steps (default 9 = 8 DiT forwards, as the model card runs it). ~31 GB on disk. Fully on the
GPU it needs ~20 GB, which ran out of memory on a 24 GB card with a desktop and other apps on it, so
model CPU offload is the default (`offload = false` in the profile on a free card).
"""

from __future__ import annotations

from typing import Any

from plugins.base import Job, Output, Plugin, Result, free_cuda, hf_weights_sha256, png_bytes
from plugins.qwen_image import template, to16

REPO = "Tongyi-MAI/Z-Image-Turbo"


class ZImage(Plugin):
    name = "z-image"
    task = "image"
    licence = 'Apache-2.0 (model card Tongyi-MAI/Z-Image-Turbo: "license: apache-2.0")'
    vram_gb = None  # set from the README measurement
    isolate = True
    gpu = True
    ram_gb = 22.0  # estimate: bf16 weights offloaded to RAM

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
        return hf_weights_sha256(REPO)

    def load(self) -> None:
        import torch
        from diffusers import ZImagePipeline

        self.pipe = ZImagePipeline.from_pretrained(REPO, torch_dtype=torch.bfloat16, low_cpu_mem_usage=False)
        if self.options.get("offload", True):
            self.pipe.enable_model_cpu_offload()
        else:
            self.pipe.to("cuda")
        super().load()

    def unload(self) -> None:
        self.pipe = None
        free_cuda()
        super().unload()

    def run(self, job: Job) -> Result:
        import torch

        w, h = int(job.request["width"]), int(job.request["height"])
        prompt, _ = template(job)  # turbo runs at guidance 0: no negative prompt
        image = self.pipe(
            prompt=prompt,
            width=to16(w),
            height=to16(h),
            num_inference_steps=job.param("steps", 9),
            guidance_scale=0.0,
            generator=torch.Generator("cuda").manual_seed(job.seed),
        ).images[0]
        return Result([Output("image/png", png_bytes(image, (w, h)))])
