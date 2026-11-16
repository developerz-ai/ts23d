"""dinov2: `score` a render against reference photos by DINOv2 embedding similarity.

Request: images[0] = the render, images[1..] = references (at least one). The score is 10 x the
mean cosine of the CLS embeddings, clamped to 0..10; the JSON output holds the per-reference
cosines. params: model (default facebook/dinov2-base; -small/-large/-giant work too).
Needs torch + transformers + pillow in the server's environment (~0.35 GB weights, ~1 GB VRAM;
runs on CPU when there is no GPU).
"""

from __future__ import annotations

import io
import json
from typing import Any

from plugins.base import Job, Output, Plugin, PluginError, Result, free_cuda, hf_weights_sha256

REPO = "facebook/dinov2-base"


class Dinov2(Plugin):
    name = "dinov2"
    task = "score"
    licence = 'Apache-2.0 (model card facebook/dinov2-base: "license: apache-2.0")'
    vram_gb = 1.0
    isolate = True
    gpu = True
    ram_gb = 2.0

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        super().__init__(options)
        self.repo = str(self.options.get("model", REPO))
        self.model: Any = None
        self.processor: Any = None

    def available(self) -> str | None:
        import importlib.util

        for mod in ("torch", "transformers", "PIL"):
            if importlib.util.find_spec(mod) is None:
                return f"python module '{mod}' is missing: run inside the model venv"
        return None

    def weights_sha256(self) -> str | None:
        return hf_weights_sha256(self.repo)

    def load(self) -> None:
        import torch
        from transformers import AutoImageProcessor, AutoModel

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = AutoImageProcessor.from_pretrained(self.repo)
        self.model = AutoModel.from_pretrained(self.repo).to(self.device).eval()
        super().load()

    def unload(self) -> None:
        self.model = self.processor = None
        free_cuda()
        super().unload()

    def run(self, job: Job) -> Result:
        import torch
        from PIL import Image

        refs = job.input_refs("images")
        if len(refs) < 2:
            raise PluginError("dinov2 needs images[0] (the render) and at least one reference")
        imgs = [Image.open(io.BytesIO(job.input("images", i)[0])).convert("RGB") for i in range(len(refs))]
        with torch.no_grad():
            batch = self.processor(images=imgs, return_tensors="pt").to(self.device)
            cls = self.model(**batch).last_hidden_state[:, 0]
            cls = torch.nn.functional.normalize(cls, dim=-1)
            cos = (cls[1:] @ cls[0]).tolist()
        mean = sum(cos) / len(cos)
        body = {"model": self.repo, "cosine": cos, "mean": mean}
        return Result([Output("application/json", json.dumps(body).encode())], score=max(0.0, min(10.0, 10 * mean)))
