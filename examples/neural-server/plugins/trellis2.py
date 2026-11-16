"""trellis2 / trellis2-texture: microsoft/TRELLIS.2-4B.

trellis2          mesh     image (required) -> GLB. params: pipeline (512|1024|1024_cascade|
                           1536_cascade, default 1024_cascade), triangles, texture_size. Output faces
                           glTF +X.
trellis2-texture  texture  mesh (the LOD0 GLB to paint, its own UVs kept) + control[0] (the reference
                           image) -> [albedo PNG, metallic-roughness PNG (G roughness, B metallic)],
                           both size x size. params: resolution (512|1024).

Profile: repo = path of a TRELLIS.2 checkout (github.com/microsoft/TRELLIS.2) with its CUDA
extensions built (README "GPU setup").
"""

from __future__ import annotations

import io
from typing import Any

from plugins import _trellis as T
from plugins.base import Job, Output, Plugin, PluginError, Result, free_cuda, png_bytes

REPOS = ("microsoft/TRELLIS.2-4B", "camenduru/dinov3-vitl16-pretrain-lvd1689m", "ZhengPeng7/BiRefNet")
LICENCE = 'MIT (model card microsoft/TRELLIS.2-4B: "license: mit")'


class _Trellis2Base(Plugin):
    vram_gb = 22.9
    isolate = True
    gpu = True
    ram_gb = 16.0  # estimate: the pipeline offloads stage models to RAM

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        super().__init__(options)
        self.repo = self.option_path("repo")
        self.pipeline: Any = None

    def available(self) -> str | None:
        return T.missing(self.repo, "trellis2/pipelines")

    def weights_sha256(self) -> str | None:
        return T.weights(*REPOS)

    def _prepare(self) -> None:
        assert self.repo is not None
        T.on_path(self.repo)
        from trellis2.modules import image_feature_extractor as ife
        from trellis2.pipelines.rembg import BiRefNet

        T.swap_init(ife.DinoV3FeatureExtractor)
        T.swap_init(BiRefNet)

    def unload(self) -> None:
        self.pipeline = None
        free_cuda()
        super().unload()


class Trellis2(_Trellis2Base):
    name = "trellis2"
    task = "mesh"
    licence = LICENCE

    def load(self) -> None:
        self._prepare()
        from trellis2.pipelines import Trellis2ImageTo3DPipeline

        self.pipeline = Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
        self.pipeline.cuda()
        super().load()

    def run(self, job: Job) -> Result:
        mesh = self.pipeline.run(
            T.image_input(job), seed=job.seed, pipeline_type=job.param("pipeline", "1024_cascade")
        )[0]
        mesh.simplify(16777216)  # nvdiffrast's face limit, as the TRELLIS.2 example does
        glb = T.glb_bytes(job, mesh, mesh.layout, voxel_size=mesh.voxel_size)
        return Result([Output("model/gltf-binary", glb)])


class Trellis2Texture(_Trellis2Base):
    name = "trellis2-texture"
    task = "texture"
    licence = LICENCE
    vram_gb = None  # not measured

    def load(self) -> None:
        self._prepare()
        from trellis2.pipelines import Trellis2TexturingPipeline

        self.pipeline = Trellis2TexturingPipeline.from_pretrained(
            "microsoft/TRELLIS.2-4B", config_file="texturing_pipeline.json"
        )
        self.pipeline.cuda()
        super().load()

    def run(self, job: Job) -> Result:
        import trimesh
        from PIL import Image

        data, _ = job.input("mesh")
        mesh = trimesh.load(io.BytesIO(data), file_type="glb", force="mesh")
        ref, _ = job.input("control")
        size = int(job.request["size"])
        out = self.pipeline.run(
            mesh,
            Image.open(io.BytesIO(ref)),
            seed=job.seed,
            resolution=job.param("resolution", 1024),
            texture_size=size,
        )
        mat = getattr(out.visual, "material", None)
        albedo = getattr(mat, "baseColorTexture", None)
        mr = getattr(mat, "metallicRoughnessTexture", None)
        if albedo is None or mr is None:
            raise PluginError("TRELLIS.2 texturing returned no baseColor / metallicRoughness texture")
        return Result(
            [Output("image/png", png_bytes(albedo, (size, size))), Output("image/png", png_bytes(mr, (size, size)))]
        )
