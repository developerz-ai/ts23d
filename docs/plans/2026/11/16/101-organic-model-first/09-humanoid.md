# 09 — A full-body humanoid (recipe `ranger`)

Rule: bipeds take the hosted rig first; the recipe still owns scale, LODs and QA.

## Files
`recipes/ranger/**` (new: `ranger.ts`, `concept.ts`, `surface.ts`, `steps.ts`, `README.md`, `ranger.test.ts`, `neural/`, `out/`) · `recipes/sets.ts` (add) — coordinator.

## Depends on
01–07, 04.

## Change
- Original design: a hooded ranger in leather and wool, 1.78 m, a-pose. Dossier first (proportions 7.5 heads, sourced garment references).
- Chain A (Meshy, ≤ 120 credits, balance read first, each call deliberate): concept image (local `z-image`, a-pose, plain background) → `mesh` (Meshy 7.1, `pose: 'a-pose'`, 2K texture, PBR) → `rig` (`height: 1.78`, clips: idle, walk, run from the library) → `blender` steps (`retopo` keeping weights, `uv` kept from source when islands are sane else re-unwrap, `bake`, `lods`, `export`) → `importModel` → `modelBody({ clips: 'model' })`.
- Chain B (local GPU, recorded as a second variant if time allows): `mesh` via pixal3d, `bind` in Blender on the biped plan skeleton, `idle` only. Labelled experimental in the README.
- No cache → `notImplemented`-free fallback: the asset builds a neutral mannequin from the existing biped creature plan (CPU tier), clearly weaker; the README says so.
- Budget [40000, 12000, 3000]; `textureSets: { count: 1, size: 2048 }`.
- Licence: commit outputs only if slice 04 established the right; otherwise the gallery uses CPU tier and the README shows how to run the chain.

## Tests
Height 1.78 ± 2 %, clip names, bone count ≤ 64, texture set on all LODs, fallback builds.

## Checks
`t3d build` PASS · `bun run shots ranger` · PNGs read · visual-reviewer.

## Docs
Recipe README with real credit spend and times.

## Done when
A walking, textured humanoid GLB with three LODs passes QA.
