# 005 — Zero runtime dependencies

Status: accepted
Date: 2026-10-25
Supersedes: —

## Context
Recipes run in the CLI, in tests and in the browser gallery. Output must be byte-deterministic. Each dependency adds supply-chain risk, version drift that can change output bytes, and install weight. The things we need (a glTF writer, a PNG encoder, a rasteriser, a PRNG) are each a few hundred lines.

## Decision
`dependencies` is empty. The library writes GLB, PNG (via `node:zlib`, present in Bun and Node) and rasterises on its own. Dev tooling (Biome, TypeScript, lefthook) and the gallery app's `three` + `vite` are dev or workspace-private dependencies. Optional integrations (neural adapters, engine adapters) talk over HTTP or are separate entry points, never required imports.

## Alternatives considered
- **`@gltf-transform/core` for export** — why not: excellent, but its output bytes move with its versions; we need to own byte determinism.
- **`sharp` / `canvas` for PNGs** — why not: native binaries, platform-specific installs, heavier than the problem.
- **`three` for geometry** — why not: pulls a renderer into a compiler, and its geometry classes aren't the IR we want.

## Consequences
- Easier: `bun add` installs one package; no native builds; nothing upstream changes our bytes.
- Harder: we maintain a GLB writer, PNG encoder and rasteriser. Each is small and tested.
- Revisit when: a needed format (Draco, KTX2, meshopt) costs more to own than to depend on. Then add it behind an optional subpath.
