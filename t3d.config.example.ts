// Example t3d.config.ts: which model serves each neural task (ADR 015). Copy to t3d.config.ts in
// your project root and edit; `t3d neural ls` lists what the servers offer, `t3d neural run
// <recipe.ts>` fills recipes/<name>/neural/. Builds never call a model (ADR 014).
// The server below is examples/neural-server (t3d-neural/1), run on your own GPU:
//   cd examples/neural-server && source <model venv> && python server.py --profile profiles/rtx3090.toml
// No GPU? `uv run server.py --profile profiles/dummy.toml` serves dummy-mesh / -image / -score.

import { defineConfig, http } from '@developerz.ai/ts23d';

const gpu = process.env['T3D_NEURAL_URL'] ?? 'http://127.0.0.1:8190';

export const config = defineConfig({
  neural: {
    // A mesh job is minutes of GPU (model load + 3 diffusion stages + bake): allow 30 min.
    mesh: http(gpu, 'pixal3d', { jobTimeoutMs: 1_800_000 }),
    texture: http(gpu, 'trellis2-texture', { jobTimeoutMs: 1_800_000 }),
    image: http(gpu, 'z-image'),
    rig: http(gpu, 'unirig'),
    motion: http(gpu, 'video-motion'),
    hair: http(gpu, 'hairdeck'),
    score: http(gpu, 'dinov2'),
  },
});
