"""video-motion: `motion` tracks from a video of a person, with MediaPipe Pose Landmarker (BlazePose
GHUM 3D; Apache-2.0 code and model, so outputs may be published).

Chosen over WHAM / GVHMR / 4DHumans: those regress SMPL bodies, and the SMPL model licence forbids
commercial use and redistribution of derived results; MediaPipe has no body-model licence.

Request: video (any format OpenCV reads), seconds, fps, seed (unused: the model is deterministic),
skeleton (passed through for the retargeter, not read here).
Output: JSON `t3d-pose-tracks/1` - 33 named joints, world positions in metres per frame resampled
to `fps` for `seconds`, hips-centred, axes as MediaPipe gives them (x right, y down, z toward the
camera), plus per-joint visibility. Per-bone rotations are the retargeter's job
(src/kinds neural-motion, plan 101 slice 15). Frames where no person is found hold the nearest
earlier pose; a video with no person at all fails the job.
Profile: model = path of pose_landmarker_heavy.task (download URL in README). CPU is fine.
"""

from __future__ import annotations

import json
from typing import Any

from plugins.base import Job, Output, Plugin, PluginError, Result

JOINTS = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]


class VideoMotion(Plugin):
    name = "video-motion"
    task = "motion"
    licence = (
        "Apache-2.0 (MediaPipe Pose Landmarker model card: Apache License 2.0; google-ai-edge/mediapipe: Apache-2.0)"
    )
    vram_gb = 0

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        super().__init__(options)
        self.model = self.option_path("model")

    def available(self) -> str | None:
        import importlib.util

        for mod in ("mediapipe", "cv2"):
            if importlib.util.find_spec(mod) is None:
                return f"python module '{mod}' is missing (pip install mediapipe opencv-python-headless)"
        if self.model is None or not self.model.is_file():
            return f"pose landmarker model not found ({self.model}); set `model` in the profile"
        return None

    def weights_sha256(self) -> str | None:
        import hashlib

        return hashlib.sha256(self.model.read_bytes()).hexdigest() if self.model else None

    def run(self, job: Job) -> Result:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        video = job.input_file("video", suffix=".video")
        fps, seconds = float(job.request["fps"]), float(job.request["seconds"])
        n = max(1, round(fps * seconds))
        cap = cv2.VideoCapture(str(video))
        if not cap.isOpened():
            raise PluginError("request.video does not open as a video")
        opts = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(self.model)), running_mode=vision.RunningMode.VIDEO
        )
        found: list[tuple[list[list[float]], list[float]] | None] = []
        with vision.PoseLandmarker.create_from_options(opts) as lm:
            for i in range(n):
                t_ms = round(i * 1000 / fps)
                cap.set(cv2.CAP_PROP_POS_MSEC, t_ms)
                ok, bgr = cap.read()
                if not ok:
                    break
                img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                r = lm.detect_for_video(img, t_ms)
                w = r.pose_world_landmarks[0] if r.pose_world_landmarks else None
                found.append(([[p.x, p.y, p.z] for p in w], [p.visibility for p in w]) if w else None)
        cap.release()
        hits = [f for f in found if f is not None]
        if not hits:
            raise PluginError("no person found in the video")
        # Frames without a person hold the nearest earlier pose (the first pose before any); a video
        # shorter than asked holds its last pose to the end.
        filled, last = [], hits[0]
        for f in found + [None] * (n - len(found)):
            last = f or last
            filled.append(last)
        frames, vis = [f[0] for f in filled], [f[1] for f in filled]
        body = {
            "format": "t3d-pose-tracks/1",
            "source": "mediapipe-pose-landmarker",
            "fps": fps,
            "seconds": seconds,
            "frames": n,
            "axes": "x right, y down, z toward camera; metres; hips origin",
            "joints": list(JOINTS),
            "positions": frames,
            "visibility": vis,
        }
        return Result([Output("application/json", json.dumps(body).encode())])
