# wolf_hybrid — the grey wolf, code skeleton + model surface

The hybrid recipe pattern (plan 101 slice 15, ADR 014/015): **code owns the animal** — skeleton,
sourced proportions, stance, mass, rig, LODs and every QA gate — and **a model adds the skin**.

| File | What it holds |
|---|---|
| `spec.ts` | The same sourced `CreatureSpec` as [recipes/wolf](../wolf/README.md) (measurements, coat, photos: see that dossier) |
| `concept.ts` | The concept image request as code: model, prompt, negative prompt, seed, size, view |
| `surface.ts` | The mesh request as code (model, seed, triangle cap, params), the whole-animal fit and every BLEND number |
| `head.ts` | Head landmarks on both wolves (nose tip, ear tips, eyes) → the head's own similarity; the neck weight |
| `register.ts` | Body fit → head fit with the neck bent about the atlas → piecewise body warp: the model in OUR pose |
| `blend.ts` | Skin move (≤ 12 mm, everywhere) + silhouette shrinkwrap (per-vertex share), texture by closest point |
| `masks.ts` · `ride.ts` · `wrap.ts` | Per-bone share, buried-in-another-part mask, volume · fur cards and teeth ride the skin · weld, smoothing, shrinkwrap, Taubin, unfold |
| `wolf_hybrid.ts` | The creature-kind wolf, its coat parts passed through the blend (mass kept the code's) |
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
3. Registration (register.ts): one similarity for the whole animal (twelve yaw starts, trimmed
   ICP); then the HEAD's own similarity from landmarks found on both wolves — nose tip (head point
   farthest from the torso), ear tips (two highest front points), eyes (darkest texture points
   between ears and nose; ours: the eyeballs' front face) — solved onto our head frame (residual
   1–2 cm), with the neck taking a smoothly rising share of that move about our atlas; then a
   16-region piecewise warp of the rest. The model's turned, lowered ¾-photo head lands on ours.
4. Blend (blend.ts): every coat vertex moves ≤ 12 mm along its normal onto the model's smoothed
   surface; then each vertex takes its bone's share of a shrinkwrap onto the (Taubin-smoothed)
   model mesh: head, jaw 1 (the model's skull, muzzle and ears replace our head field), neck,
   withers, chest, loin 0.7, croup 0.9, thigh 0.6, ears 0.3; forearm, shank, paws and tail 0 (code).
   The torso takes a smooth union (adds ruff and chest, keeps the sourced girth where the model
   is slimmer) and keeps the code's belly (down-facing skin: the photo never saw it). The neck
   stub buried in the body and the jaw's top inside the head may move in, never out, so the rig,
   the blink and the jaw clip still work. Pinches and new creases are relaxed out (QA
   connections). Texture: the model's 1024 px albedo at the closest point (full within 2 cm, none
   past 5 cm); fur cards and teeth ride the moved skin. Reshaped parts keep the code part's mass
   (density × old volume ÷ new): the model's extra volume is coat, and mass + fore share stay
   sourced. LOD2 takes the colour only.

A miss anywhere (no `neural/`, the gallery, CI without the cache) returns the code wolf.

## Iterations (path-traced hero, ¾ front)

| # | What | Result |
|---|---|---|
| 1 | high-pass relief ±4 mm, colour high-pass ×0.6 | barely different from the CPU wolf |
| 2 | colour high-pass ×1.2, 16 rings | blotchy camo, purple/red specks: worse |
| 3 | value-only high-pass ×0.8 | cleaner, still mottled; head unchanged |
| 4 | piecewise registration + full texture by closest point + normal-only, smoothed warp | wolf colouring (ochre flanks, dark saddle, pale legs); QA PASS |
| 5 | head landmark fit + neck bend; head shrinkwrapped onto the model | the model's muzzle and ears on our head; fans onto the ears, sawtooth throat |
| 6 | normal cone, buried mask, teeth ride, jaw pinned inward | clean muzzle and throat; jaw opens |
| 7 | per-bone torso share, smooth union, Taubin target, unfold + crease relax, kept belly, mass kept | ruff and chest mass; QA PASS (seams, fore share, mass) |
| 8 | albedo texture at full resolution, texture gate 2–5 cm, ears 0.3 | head reads as the model's wolf face; QA PASS |

Honest state (path-traced, s17c): the head is now the model's (long tapered muzzle, white cheeks,
dark mask, the ochre bridge) on our skeleton, eyes and jaw; the ruff and chest have the model's
mass and colour. Weak spots: the coat is still a painted surface (the fur cards are the code
wolf's), the ear tips are thin and pointed, and the back shows the code fur's crest of cards.

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
