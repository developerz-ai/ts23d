"""pixal3d: `mesh` from one photo with TencentARC/Pixal3D (pixel-aligned, TRELLIS.2 backbone).

Profile: repo = path of a Pixal3D checkout (github.com/TencentARC/Pixal3D); low_vram = true keeps the
models on CPU between stages (1024 cascade). Request: image (required), seed, maxTriangles;
params: resolution (1024|1536), steps (all three samplers), fov (radians; default MoGe-2
estimate), triangles, texture_size. Output: one GLB, glTF Y-up in the photo's camera frame (a
three-quarter photo gives a rotated asset: no axis-aligned front).
Measured (RTX 3090, low_vram, wolf photo): README table.
"""

from __future__ import annotations

import importlib.util
import os
from typing import Any

from plugins import _trellis as T
from plugins.base import Job, Output, Plugin, Result, free_cuda

REPOS = (
    "TencentARC/Pixal3D",
    "Ruicheng/moge-2-vitl",
    "camenduru/dinov3-vitl16-pretrain-lvd1689m",
    "ZhengPeng7/BiRefNet",
)


class Pixal3D(Plugin):
    name = "pixal3d"
    task = "mesh"
    licence = 'MIT (model card TencentARC/Pixal3D: "license: mit"; code: MIT License, Copyright (c) 2026 Tencent)'
    vram_gb = 17.5
    isolate = True
    gpu = True
    ram_gb = 20.0  # estimate: low_vram keeps every stage model in RAM between stages

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        super().__init__(options)
        self.repo = self.option_path("repo")
        self.low_vram = bool(self.options.get("low_vram", True))
        self.inf: Any = None
        self.pipeline: Any = None
        self.moge: Any = None

    def available(self) -> str | None:
        return T.missing(self.repo, "inference.py")

    def weights_sha256(self) -> str | None:
        return T.weights(*REPOS)

    def load(self) -> None:
        assert self.repo is not None
        T.on_path(self.repo)
        from pixal3d.pipelines.rembg import BiRefNet

        T.swap_init(BiRefNet)
        spec = importlib.util.spec_from_file_location("pixal3d_inference", self.repo / "inference.py")
        assert spec and spec.loader
        self.inf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.inf)
        self.pipeline = self.inf.init_pipeline(self.inf.MODEL_PATH, low_vram=self.low_vram)
        self.moge = self.inf.load_moge_model(device="cpu")
        super().load()

    def unload(self) -> None:
        self.pipeline = self.moge = self.inf = None
        free_cuda()
        super().unload()

    def run(self, job: Job) -> Result:
        import numpy as np
        import torch

        inf = self.inf
        image = self.pipeline.preprocess_image(T.image_input(job))
        tmp = job.workdir / "preprocessed.png"
        image.save(tmp)
        fov = job.param("fov", -1.0)
        if fov > 0:
            dist = inf.distance_from_fov(fov, torch.tensor([-1.0, 0.0, 0.0]), torch.tensor([0, 511]), 1.0, 512)
            camera = {"camera_angle_x": fov, "distance": dist["distance_from_x"], "mesh_scale": 1.0}
        else:
            self.moge.cuda()
            try:
                camera = inf.get_camera_params_wild_moge(str(tmp), self.moge, device="cuda")
            finally:
                self.moge.cpu()
                torch.cuda.empty_cache()
        steps = job.param("steps", 12)

        def sampler(g: float, r: float, t: float) -> dict[str, float]:
            return {"steps": steps, "guidance_strength": g, "guidance_rescale": r, "rescale_t": t}

        resolution = job.param("resolution", 1024 if self.low_vram else 1536)
        os.environ.setdefault("ATTN_BACKEND", "flash_attn")
        torch.manual_seed(job.seed)
        meshes, (_, _, res) = self.pipeline.run(
            image,
            camera_params=camera,
            seed=job.seed,
            sparse_structure_sampler_params=sampler(7.5, 0.7, 5.0),
            shape_slat_sampler_params=sampler(7.5, 0.5, 3.0),
            tex_slat_sampler_params=sampler(1.0, 0.0, 3.0),
            preprocess_image=False,
            return_latent=True,
            pipeline_type=f"{resolution}_cascade",
            max_num_tokens=49152,
        )
        rot = np.array([[-1, 0, 0, 0], [0, 0, -1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=np.float64)
        glb = T.glb_bytes(job, meshes[0], self.pipeline.pbr_attr_layout, rotate=rot, grid_size=res)
        return Result([Output("model/gltf-binary", glb)])
