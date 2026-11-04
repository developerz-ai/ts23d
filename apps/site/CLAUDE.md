# developerz-ai/ts23d — apps/site

> Workspace brain — established by dz-runner setup mode from this workspace, then owned by
> its maintainers. Correct it in place; setup never overwrites a brain that exists.

@ts23d/site — the Vite + three.js asset gallery (GitHub Pages, `/ts23d/`) that compiles recipes in the browser and presents each asset as a looping, scripted, non-interactive show; depends on the library via the `@developerz-ai/ts23d` specifier (aliased to ../../src).

The gate is the repo root’s: `bin/check` (see the root `CLAUDE.md`).

## Structure

- `index.html` — skeleton; `src/main.ts` loads the catalog from the worker, fills hero + gallery, routes `#<asset_name>` to viewer/details/source.
- Compile pipeline, off the main thread: `src/compile.worker.ts` compiles recipe → GLB (`recipe-modules.ts` discovers `recipes/*.ts` worker-side); `compile-protocol.ts` the message types; `compile.ts` the page-side client (GLB → three.js); `recipes.ts` the page-side catalog + lazy recipe source.
- Page: `src/hero.ts` (how-it-works strip), `gallery.ts` (card grid), `thumbnails.ts` (`/thumbs/<name>.png`, LOD2 fallback render), `details.ts` (manifest + contact sheet), `source.ts` (highlighted recipe TS), `downloads.ts` (one GLB per LOD).
- Viewer: `src/viewer.ts` (looping scenario or free look; LOD/wireframe/trim-sheet toggles, parts list, GLB per LOD), `viewer-panels.ts` (stats + parts tree, DOM only), `stage.ts` (lights/grid/framing), `theme.ts` (CSS tokens → three.js).
- `src/scenarios/` — the scripted shows the viewer runs: short, looping, NON-interactive (`types.ts` is the contract; the viewer owns the clock). No input layer, no HUD — nothing here is interactive.
- Scenario shows: `tracked.ts` (drive/stop/traverse/fire poses), `locomotive.ts` (tiled own track + trackside pan), `tree.ts` (gust on crown sway + falling leaves), `landmark.ts` (day-cycle turntable, rising camera for tall things), `turntable.ts` (fallback); `hooks.ts` engine hooks (kind, named nodes, clip, emitters, size) and `pick.ts` match assets by kind + named nodes, never by name; `cinema.ts` camera/timing helpers.
- Presentation: `src/textures.ts` (trim sheet on/off), `diorama.ts` (heightfield base under the model; ground colouring in `ground-color.ts`), `noise.ts` (seeded PRNG + value noise).
- Particles: `src/particles.ts` (recipe-emitter preview), `particle-kinds.ts` (per-kind presets), `particle-layer.ts` (instanced GPU layer).
- `src/shims/zlib.ts` — stub that keeps the library's `node:zlib` import resolvable; the site never uses that path, tree-shaking drops it.
- `src/style.css` + `src/env.d.ts` (vite client types); `DESIGN.md` — the accurate design-identity doc.
- `vite.config.ts` — base `/ts23d/`; aliases `@developerz-ai/ts23d` and subpaths to `../../src/*/index.ts` and `node:zlib` to the stub; `server.fs.allow` reaches the repo root.
- Deps: three 0.186.1 + vite 8.3.5 (the only place three/vite may appear, workspace-private per ADR 005).

## Conventions

- Run from the repo root: `bun run site:dev` (vite, http://localhost:5173/ts23d/) and `bun run site:build`.
- Imports of the library go through the `@developerz-ai/ts23d` specifier — resolved by the vite aliases, never by relative paths into ../../src.
- Keep node imports browser-safe; add stubs under src/shims/ when needed.
- `vite.config.ts` is the repo's only sanctioned default export (biome override in biome.json).
- Deploys from main via pages.yml; site code is still typechecked (tsconfig includes apps/) and linted (biome checks apps/) by the root gate.
