# wolf_hybrid — the grey wolf, code skeleton + model surface

The hybrid recipe pattern (plan 101 slice 15, ADR 014/015): **code owns the animal** — skeleton,
sourced proportions, stance, mass, rig, LODs and every QA gate — and **a model adds the skin**.

| File | What it holds |
|---|---|
| `spec.ts` | The same sourced `CreatureSpec` as [recipes/wolf](../wolf/README.md) (measurements, coat, photos: see that dossier) |
| `concept.ts` | The concept image request as code: model, prompt, negative prompt, seed, size, view |
| `surface.ts` | The mesh request as code (model, seed, triangle cap, params) and the blend: fit, brick, high-pass, texture |
| `wolf_hybrid.ts` | The creature-kind wolf, its `body` part passed through `hybridBody` |
| `neural/<key>/` | The committed model outputs + `record.json` (model, licence, weights hash, request, output hashes) |

## The chain

1. `CONCEPT` (`ctx.neural('image', …)`, model `z-image`: Z-Image-Turbo, Apache-2.0, 9 steps,
   guidance 0) → a 1024² ¾-view wolf on plain light grey, seed 42 (won the lab A/B). It passes
   the input-image rules: one sharp subject on a plain background, ≥ 60 % of the frame, not
   cropped, ≥ 512 px (a cluttered photo is `T3D_NEURAL_INPUT`, D55).
2. `SURFACE` with `image: { sha256 of that PNG }` (`ctx.neural('mesh', …)`, model `pixal3d`, MIT;
   1536 cascade, 25 steps). Committed as the GLB decimated to 60 k faces with a 1024 px albedo
   (6.6 MB with the PNG, cap 8 MB); record.json `overrides` records the decimation and that the
   lab script ran it (the shared card OOMed the server job).
3. `hybridOf` registers the model onto the code wolf's solid coat (body + head + jaw): similarity
   ICP from twelve yaw starts, then a 16-region piecewise warp (each region its own trimmed ICP,
   blended: the model's turned head and planted legs bend onto OUR skeleton). Then every coat
   part moves along its own normals onto the model's smoothed surface (≤ 12 mm, smoothed over the
   mesh so nothing folds; none near the paws, so claws stay rooted; none where the model strays
   > 6 cm) and takes the model's texture by closest point (full within 1 cm, none past 2 cm).
   Fur cards follow the same warp and colour. LOD2 takes the colour only.

A miss anywhere (no `neural/`, the gallery, CI without the cache) returns the code wolf.

## Iterations (path-traced hero, ¾ front)

| # | What | Result |
|---|---|---|
| 1 | high-pass relief ±4 mm, colour high-pass ×0.6 | barely different from the CPU wolf |
| 2 | colour high-pass ×1.2, 16 rings | blotchy camo, purple/red specks: worse |
| 3 | value-only high-pass ×0.8 | cleaner, still mottled; head unchanged |
| 4 | piecewise registration + full texture by closest point + normal-only, smoothed warp | wolf colouring (ochre flanks, dark saddle, pale legs); QA PASS |

Honest state: the body reads as a wolf's coat now; the head keeps the code's shape and colour
(the model's head does not register closely enough, so the 2 cm texture gate rejects it), and
the silhouette is still the code's. The raw Pixal3D statue is the better still image today.

## Re-roll

1. Change a seed (or prompt / model) in `concept.ts` or `surface.ts`.
2. `t3d neural run recipes/wolf_hybrid/wolf_hybrid.ts` on a machine with the adapters
   (`t3d.config.ts`: `image` → `renderAdapter(...)` or `http(gpu, 'z-image')`, `mesh` →
   `http(gpu, 'pixal3d')`; reference server: `examples/neural-server`, profile `rtx3090.toml`;
   one model on the card at a time). It runs in rounds: the image fills first, then the mesh
   request that names it; a mesh input failing the input-image rules is refused before any GPU
   time.
3. `t3d hero` / `t3d shot` and READ them; `t3d build` must PASS.
4. Delete the old key directories under `neural/` and commit the new ones (≤ 8 MB, MIT /
   Apache / CC0 models only: the recipes gate refuses other licences).
