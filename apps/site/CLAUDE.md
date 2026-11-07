# developerz-ai/ts23d — apps/site

> Workspace brain — established by dz-runner setup mode from this workspace, then owned by
> its maintainers. Correct it in place; setup never overwrites a brain that exists.

@ts23d/site — the Vite + three.js asset gallery (GitHub Pages, `/ts23d/`) that presents every asset like a product page (committed beauty renders in the grid, a live orbiting showcase above the fold, an orbitable studio viewer or a scripted non-interactive scene per asset); depends on the library via the `@developerz.ai/ts23d` specifier (aliased to ../../src).

The gate is the repo root’s: `bin/check` (see the root `CLAUDE.md`).

## Structure

- `index.html` — skeleton; `src/main.ts` loads the catalog, fills showcase + gallery, routes `#<asset_name>` to the asset page (viewer/details/source).
- Media: `media-plugin.ts` (vite plugin) publishes each `recipes/<folder>/out/<asset>/` (hero.png, sheet.png, manifest.json) as `virtual:ts23d-media`, WebP-encoded at build when cwebp/ImageMagick exists; `src/media-types.ts` the shared types; `src/items.ts` the gallery items (committed media first, then recipes with no renders yet) + category from kind/tags.
- Compile pipeline, off the main thread: `src/compile.worker.ts` compiles recipe → GLB (`recipe-modules.ts` discovers `recipes/*/*.ts` worker-side); `compile-protocol.ts` the message types; `compile.ts` the page-side client (GLB → three.js); `recipes.ts` the page-side catalog + lazy recipe source.
- Page: `src/showcase.ts` (live orbiting hero assets, poster = committed hero), `how.ts` (how-it-works strip), `gallery.ts` (card grid), `thumbnails.ts` (`/thumbs/<name>.png`, LOD2 fallback render), `details.ts` (manifest + contact sheet), `source.ts` (highlighted recipe TS), `downloads.ts` (one GLB per LOD).
- Viewer: `src/viewer.ts` (Studio orbit or Scene show; LOD/wireframe/trim-sheet toggles, play `run` clip, parts list with hover outline, GLB per LOD), `viewer-ui.ts` (DOM contract), `viewer-panels.ts` (stats + parts tree, DOM only), `studio.ts` (filmic renderer, room environment, shadow-only ground), `stage.ts` (lights/grid/framing), `theme.ts` (CSS tokens → three.js).
- `src/scenarios/` — the scripted shows the viewer runs: short, looping, NON-interactive (`types.ts` is the contract; the viewer owns the clock). No input layer, no HUD — nothing here is interactive.
- Scenario shows: `tracked.ts` (drive/stop/traverse/fire poses), `locomotive.ts` (tiled own track + trackside pan), `tree.ts` (gust on crown sway + falling leaves), `landmark.ts` (day-cycle turntable, rising camera for tall things), `turntable.ts` (fallback); `hooks.ts` engine hooks (kind, named nodes, clip, emitters, size) and `pick.ts` match assets by kind + named nodes, never by name; `cinema.ts` camera/timing helpers.
- Presentation: `src/textures.ts` (trim sheet on/off), `diorama.ts` (heightfield base under the model; ground colouring in `ground-color.ts`), `noise.ts` (seeded PRNG + value noise).
- Particles: `src/particles.ts` (recipe-emitter preview), `particle-kinds.ts` (per-kind presets), `particle-layer.ts` (instanced GPU layer).
- `src/shims/zlib.ts` — stub that keeps the library's `node:zlib` import resolvable; the site never uses that path, tree-shaking drops it.
- `src/style.css` + `src/styles/*.css` + `src/env.d.ts` (vite client types); `DESIGN.md` — the accurate design-identity doc.
- `vite.config.ts` — base `/ts23d/`; aliases `@developerz.ai/ts23d` and subpaths to `../../src/*/index.ts` and `node:zlib` to the stub; `server.fs.allow` reaches the repo root.
- Deps: three 0.186.1 + vite 8.3.5 (the only place three/vite may appear, workspace-private per ADR 005).

## Conventions

- Run from the repo root: `bun run site:dev` (vite, http://localhost:5173/ts23d/), `bun run site:build`, and `bun run site:shots` (headless Chrome screenshots → `docs/media/`).
- Imports of the library go through the `@developerz.ai/ts23d` specifier — resolved by the vite aliases, never by relative paths into ../../src.
- Keep node imports browser-safe; add stubs under src/shims/ when needed.
- `vite.config.ts` is the repo's only sanctioned default export (biome override in biome.json).
- Deploys from main via pages.yml; site code is still typechecked (tsconfig includes apps/) and linted (biome checks apps/) by the root gate.
