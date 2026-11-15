# 015 — Models are the user's choice, through adapters; licences recorded, not gated

Status: accepted
Date: 2026-11-15

## Context
The neural tier must work with whatever model a user can run: a local diffusion server, a ComfyUI
workflow, any OpenAI-compatible image endpoint, a research mesh or rig model. Model licences vary
widely, and some forbid redistributing outputs. Plan 101 also builds city blocks from
OpenStreetMap data, which is licensed under the ODbL.

## Decision
1. ts23d defines the tasks and their request / result shapes (`NeuralTask`, `src/core/neural-task.ts`);
   users plug in any model through a `NeuralAdapter`. No model is bundled or required.
2. The model's licence is **recorded** in `record.json` and in the asset's credits, **never gated**
   for users' own builds.
3. **One exception, for this repository:** committed outputs under `recipes/*/neural/` must come from
   a model whose licence allows publishing outputs; the recipes gate refuses the rest.
4. OpenStreetMap extracts are pinned by hash and carry ODbL attribution into the credits; the built
   assets are Produced Works under the ODbL.

## Alternatives considered
- **Ship or pick one model** — why not: ties the library to a vendor, a GPU class and a licence; the
  free, code-based option should stay neutral.
- **Gate builds on licence** — why not: users decide what they may do with their own outputs; the
  library cannot know their terms.
- **Treat OSM-derived assets as derivative databases** — why not: the assets are rendered works, not
  databases; ODbL's Produced Work terms (attribution) fit.

## Consequences
- Easier: any model plugs in; credits travel with the asset.
- Harder: this repository has to check licences of committed outputs; attribution must survive export.
- Revisit when: a common machine-readable model-licence format makes automated checks reliable.
