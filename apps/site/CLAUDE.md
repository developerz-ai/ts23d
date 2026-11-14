# developerz-ai/ts23d — apps/site

> Workspace brain — established by dz-runner setup mode from this workspace, then owned by
> its maintainers. Correct it in place; setup never overwrites a brain that exists.

@ts23d/site — the Vite + three.js asset gallery (GitHub Pages, `/ts23d/`) that presents every asset like a product page (committed beauty renders in the grid, a live orbiting showcase above the fold, an orbitable studio viewer or a scripted non-interactive scene per asset); depends on the library via the `@developerz.ai/ts23d` specifier (aliased to ../../src).

The gate is the repo root’s: `bin/check` (see the root `CLAUDE.md`).

## Structure

- `index.html` — skeleton (canonical, Open Graph/Twitter meta with `media/tiger_1/hero.webp`, `<noscript>` link to recipes/ on GitHub); `public/404.html` the Pages not-found page (offers `/ts23d/#<name>` for `/ts23d/<name>`); `src/main.ts` loads the catalog, fills showcase + gallery, routes `#<asset_name>` to the asset page (viewer/details/source).
- Media: `media-scan.ts` reads each `recipes/<folder>/out/<asset>/` (manifest.json, critique.json, renders, WAVs); `media-plugin.ts` (vite plugin) publishes the light card data as `virtual:ts23d-media` and the rest as `media/<asset>/facts.json` (measures, sources, critique, liveries, sounds, weathering, extra images), copies hero (WebP at build when cwebp/ImageMagick exists), sheet, blueprint, RTS icon/portrait/rts.png and WAVs; `src/media-types.ts` the shared types; `src/facts.ts` fetches facts per asset page; `src/items.ts` the gallery items (committed media first, each already knowing its recipe entry file; then recipes with no renders yet); `src/categories.ts` category order + rule from kind/tags.
- Compile pipeline, off the main thread: `src/worker-pool.ts` (2–3 workers, idlest first, `cancel` terminates a worker running an abandoned compile; a crashed worker (`error`/`messageerror`) rejects its jobs by recipe name and respawns once, a second crash leaves its slot dead); `src/compile.worker.ts` compiles recipe → GLB (+ physics mass when declared); `recipe-modules.ts` globs only entry modules `recipes/<folder>/<folder>.ts` (siblings, nested folders, `_lib`/`_parts` arrive through imports; tests excluded) and imports one per build, all only for the catalog; `compile-protocol.ts` the message types; `compile.ts` the page-side client (cache, cancel, GLB → three.js); `recipes.ts` entry files + every file of a multi-file recipe as lazy raw text, and the lazily loaded catalog.
- LOD policy: `src/lod-policy.ts` — LOD0 > 150k tris or a sculpted character/creature opens at LOD1 with a "Load full detail" button; compile-time estimates drive `viewer-progress.ts` (time-based bar, elapsed vs est.).
- Page: `src/showcase.ts` (live orbiting hero assets at their start LOD, built only once home is seen), `how.ts` (how-it-works strip), `gallery.ts` (category chips + card grid), `thumbnails.ts` (LOD2 fallback render), `details.ts` (title block, badges, LOD table, measures), `renders-panel.ts` (contact sheet, blueprint, RTS icon/portrait/shot), `quality-panel.ts` (critique scores + art metrics + weathering), `sound-panel.ts` (WAV play buttons; positional via PositionalAudio on the GLB node), `source.ts` (highlighted recipe TS with a file picker), `downloads.ts` (one GLB per LOD, compiled on click).
- Viewer (lazy chunk, loaded on the first asset page): `src/viewer.ts` (Studio orbit or Scene show; LOD/wireframe/trim-sheet toggles, play `run` clip, parts list with hover outline, GLB per LOD), `viewer-load.ts` (compile + hooks + scenario + diorama), `viewer-fallback.ts` (WebGL probe + the one-line message a failed compile or a missing WebGL ends in; `main.ts` skips the showcase and viewer chunk without WebGL, the hero render and GLB downloads stay), `viewer-ui.ts` (DOM contract), `viewer-panels.ts` (stats + parts tree, DOM only), `studio.ts` (renderer: PBR Neutral tone mapping, sRGB, PCF shadows, shadow-only ground), `stage.ts` (look lights/grid/framing), `theme.ts` (CSS tokens → three.js).
- Look (presentation quality): `look.ts` per-category lighting presets (studio · portrait · outdoor), `lightbox.ts` procedural HDR environments → PMREM (no .hdr payload), `backdrop.ts` dithered gradient `scene.background`, `contact-shadow.ts` baked soft contact shadow, `post.ts` (lazy chunk: MSAA + GTAO + OutputPass), `quality.ts` (high/low tier, frame-budget auto-degrade, `?quality=high|low` pins it; high = AO + 2048² trim sheet on by default).
- `src/scenarios/` — the scripted shows the viewer runs: short, looping, NON-interactive (`types.ts` is the contract; the viewer owns the clock). No input layer, no HUD — nothing here is interactive.
- Scenario shows: `tracked.ts` (drive/stop/traverse/fire poses), `locomotive.ts` (tiled own track + trackside pan), `tree.ts` (gust on crown sway + falling leaves), `landmark.ts` (day-cycle turntable, rising camera for tall things), `turntable.ts` (fallback); `hooks.ts` engine hooks (kind, named nodes, clip, emitters, size) and `pick.ts` match assets by kind + named nodes, never by name; `cinema.ts` camera/timing helpers.
- Presentation: `src/textures.ts` (trim sheet on/off), `diorama.ts` (heightfield base under the model; ground colouring in `ground-color.ts`), `noise.ts` (seeded PRNG + value noise).
- Particles: `src/particles.ts` (recipe-emitter preview), `particle-kinds.ts` (per-kind presets), `particle-layer.ts` (instanced GPU layer).
- `src/shims/zlib.ts` — stub that keeps the library's `node:zlib` import resolvable; the site never uses that path, tree-shaking drops it.
- `src/style.css` + `src/styles/*.css` + `src/env.d.ts` (vite client types); `DESIGN.md` — the accurate design-identity doc.
- `vite.config.ts` — base `/ts23d/`; aliases `@developerz.ai/ts23d` and subpaths to `../../src/*/index.ts` and `node:zlib` to the stub; `server.fs.allow` reaches the repo root.
- Deps: three 0.186.1 + vite 8.3.5 (the only place three/vite may appear, workspace-private per ADR 005).

## Conventions

- Run from the repo root: `bun run site:dev` (vite, http://localhost:5173/ts23d/), `bun run site:build`, and `bun run site:shots` (headless Chrome screenshots → `docs/media/`; `--assets a,b --out tmp/site` shoots any asset pages for lighting reviews).
- Imports of the library go through the `@developerz.ai/ts23d` specifier — resolved by the vite aliases, never by relative paths into ../../src.
- Keep node imports browser-safe; add stubs under src/shims/ when needed.
- `vite.config.ts` is the repo's only sanctioned default export (biome override in biome.json).
- Deploys from main via pages.yml; site code is still typechecked (tsconfig includes apps/) and linted (biome checks apps/) by the root gate.
