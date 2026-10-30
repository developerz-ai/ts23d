# developerz-ai/ts23d — apps/site

> Workspace brain — established by dz-runner setup mode from this workspace, then owned by
> its maintainers. Correct it in place; setup never overwrites a brain that exists.

@ts23d/site — the Vite + three.js demo gallery (GitHub Pages, /ts23d/) that compiles recipes in the browser and hosts the drivable tank demo; depends on the library via ../../src.

The gate is the repo root’s: `bin/check` (see the root `CLAUDE.md`).

## Structure

- `index.html` — entry; `src/main.ts` boots viewer/stage/gallery.
- `src/compile.worker.ts` + `compile.ts`/`compile-protocol.ts` — compile recipes client-side in a worker.
- `src/gallery.ts`, `thumbnails.ts`, `source.ts` — the recipe gallery and its sources.
- `src/play/` — the drivable demo (vehicle, terrain, hud, input); binds GLB parts by node name (`turret`, `gun`, `road_wheel_*`).
- `src/shims/zlib.ts` — stub that keeps the library's `node:zlib` import resolvable; tree-shaking drops it.
- `vite.config.ts` — base `/ts23d/`; aliases `@developerz-ai/ts23d` and subpaths to `../../src/*/index.ts`; `server.fs.allow` reaches the repo root.
- Deps: three 0.186.x + vite (the only place three/vite may appear, per ADR 005).

## Conventions

- Run from the repo root: `bun run site:dev` (vite, http://localhost:5173/ts23d/) and `bun run site:build`.
- Imports of the library go through the `@developerz-ai/ts23d` specifier — resolved by the vite aliases, never by relative paths into ../../src.
- Keep node imports browser-safe; add stubs under src/shims/ when needed.
- `vite.config.ts` is the repo's only sanctioned default export (biome override in biome.json).
- Deploys from main via pages.yml; site code is still typechecked (tsconfig includes apps/) and linted (biome checks apps/) by the root gate.
