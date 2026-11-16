"""qwen-edit-split: `image` that splits a concept into one clean part image (head, torso, arms,
legs, clothing, hair, weapon) with Qwen/Qwen-Image-Edit-2511 (diffusers QwenImageEditPlusPipeline).
Split-part mode (plan 101 slice 15) asks once per part and models each from its crop.

Request: control[0] = the concept image; params.part (required, one of PARTS); prompt = extra words
(style, the character's name). Output: one PNG of exactly width x height, the part alone, centred,
front-on, on plain white. Weights ~58 GB (bf16); `offload = true` on a 24 GB card.
"""

from __future__ import annotations

import io

from plugins.base import Job, PluginError, Result
from plugins.qwen_image import QwenImage

PARTS = {
    "head": "the head and face only (neck cut cleanly), front view",
    "torso": "the torso only, without head, arms or legs, front view",
    "arms": "both arms only, side by side, without the body, front view",
    "legs": "both legs and feet only, without the upper body, front view",
    "clothing": "the clothing only, laid out flat as a garment without the body, front view",
    "hair": "the hair only, without the face or head, front view",
    "weapon": "the weapon or held prop only, without the hand, side view",
}
PROMPT = (
    "Extract {what} of this character. Keep the exact design, colours, materials and proportions. "
    "Clean edges, centred, filling the frame, plain white background, flat even lighting, no shadow, no text. {extra}"
)
NEGATIVE = "other body parts, background, scenery, text, watermark, blurry, changed design"


class QwenEditSplit(QwenImage):
    name = "qwen-edit-split"
    task = "image"
    licence = 'Apache-2.0 (model card Qwen/Qwen-Image-Edit-2511: "license: apache-2.0")'
    repo = "Qwen/Qwen-Image-Edit-2511"
    pipeline_class = "QwenImageEditPlusPipeline"

    def run(self, job: Job) -> Result:
        from PIL import Image

        part = str(job.param("part", ""))
        if part not in PARTS:
            raise PluginError(f"params.part '{part}' is not one of {sorted(PARTS)}")
        concept = Image.open(io.BytesIO(job.input("control")[0])).convert("RGB")
        prompt = PROMPT.format(what=PARTS[part], extra=job.request.get("prompt", "")).strip()
        return self.generate(job, prompt, str(job.request.get("negative") or NEGATIVE), image=[concept])
