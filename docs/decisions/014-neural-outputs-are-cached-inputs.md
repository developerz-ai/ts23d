# 014 — Neural outputs are cached inputs, committed with the recipe

Status: accepted
Date: 2026-11-15

## Context
Models (image, mesh, texture, rig, motion, hair, score) can make assets more realistic, but a GPU run
is not reproducible across drivers and hardware, and CI has no GPU. Two caches grew apart:
[08-neural-adapters](../idea/08-neural-adapters.md) says `refine` commits `.ts23d/neural/`, while
[22-ai-finish](../idea/22-ai-finish.md) caches finish results in the gitignored `.ts23d/finish/`.
A build then depends on whose machine ran the model.

## Decision
1. A model output is an **input** to the build, never a build step. It is cached by content hash
   and **committed** under `recipes/<name>/neural/<key>/` (outputs + `record.json`: model, licence,
   weights hash, request, output hashes, server version).
2. The cache is capped at **12 MB of committed bytes per recipe** (8 MB until 2026-11-16; local outputs are outside the cap, see below).
3. **CI is offline.** A cache miss falls back to the CPU tier and emits a `T3D_NEURAL_MISSING`
   notice; it is an error only with `--require-neural`.
4. Every output passes task validation before use (`T3D_NEURAL_OUTPUT_INVALID`).
5. This **supersedes** the split between `.ts23d/neural` and `.ts23d/finish`: both move to the
   recipe cache. The cache text in idea docs 08 and 22 is superseded by this record.

## Alternatives considered
- **Run models in `t3d build`** — why not: non-deterministic, needs a GPU, breaks "same source + seed
  = same bytes".
- **Gitignored local cache** — why not: other machines and CI cannot reproduce the asset; the CPU
  and GPU variants would diverge silently.
- **Fail the build on a cache miss** — why not: a user without a GPU could not build any recipe that
  ever used a model; the CPU tier must always build.

## Consequences
- Easier: GPU variants rebuild byte-identically anywhere; CI never needs a GPU or network.
- Harder: the repository carries binary outputs (bounded by the cap: 8 MB, 12 MB since the
  2026-11-16 amendment); regeneration is explicit.
- Revisit when: model outputs become bit-reproducible across hardware, or the cap proves too small
  for the flagship set.

## Amendment 2026-11-16 — Local outputs, 12 MB cap
Plan 2026/11/16/101 (organic assets model-first) makes the cache hold a **chain**: concept `image`
(≈ 1 MB) → image-to-3D `mesh` (measured 70–106 MB at 1 M faces) → `blender` steps (≈ 8 MB GLB with
LODs and textures, the output the build uses). The raw mesh cannot be committed, yet its sha256
keys the downstream request.

1. The cap of §2 is **12 MB of committed outputs per recipe** (was 8 MB: an image plus one
   Blender output did not fit).
2. An output may be **local**: the ask says `keep: 'local'` (storage policy, not part of the
   key). It is written as `neural/<key>/local-<i>.<ext>`, git-ignored by name, outside the cap;
   `record.json` is committed as always and marks it `"local": true` with its sha256 and length.
3. A build **never reads a local file**, on any machine: the request is a hit whose output is
   `absent` (no bytes, the sha256). So a fresh clone and the machine that ran the model build the
   same bytes, and the chain reaches the committed downstream output. Only `t3d neural run` reads
   local bytes, to send them to the next request.
4. A downstream miss whose input is a local output not on the machine is not sent; the notice
   says to re-run (or copy) the upstream output there. Re-running a model changes its hash and so
   every request downstream of it: the price of not committing it.
5. The recipes gate accepts a missing local file, checks its sha256 when present, fails when one
   is tracked by git, and still fails on a missing committed output.

Why not git LFS or an external store: a build would then depend on a service; a local output is
only ever an intermediate, and the committed downstream output is what §1 promises.
