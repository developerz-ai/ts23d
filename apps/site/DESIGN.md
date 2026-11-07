# ts23d site: design identity

**Direction: blueprint chrome around a photo studio.** The page itself is the drawing set the CLI's
contact sheets belong to: drafting-grid paper, hairline frames with an inset border, title-block
labels in monospace, one "redline" accent for what is selected or moving. The 3D, though, is
presented like a product shot: a light-grey studio sweep, filmic tone mapping, environment light,
soft shadows and a contact shadow on an invisible floor — the same look as the CLI's `hero.png`
beauty renders, so the poster image and the live model match.

That is a deliberate change from the earlier "no gradients, no shadows" rule: the site's job is to
present assets well, and a model with no shadow floats and reads as a diagram. Gradients and
shadows are allowed **only on the stages** (showcase, viewer, card images) and on card hover; the
chrome stays flat, square and hairline.

## Tokens (`src/styles/base.css`, `:root`)

| token                           | role                                       | light (vellum)        | dark (cyanotype)      |
| ------------------------------- | ------------------------------------------ | --------------------- | --------------------- |
| `--paper` / `--paper-raised`    | page / sheet                               | `#f4f1e8` / `#fbf9f3` | `#0b2545` / `#0f2e54` |
| `--ink` / `--ink-muted`         | text                                       | `#12305a` / `#3f5878` | `#e6f0ff` / `#a9bfdc` |
| `--rule` / `--rule-strong`      | hairlines, frames, control borders         | `#9fb3cc` / `#5f7ea3` | `#33598a` / `#6f9ad0` |
| `--grid-minor` / `--grid-major` | drafting grid (CSS and the 3D ground grid) |                       |                       |
| `--redline`                     | selection, moving parts, pressed state     | `#b5380b`             | `#ff9a76`             |
| `--ok`                          | QA pass, measures within tolerance         | `#2f6b2f`             | `#9fdc8c`             |
| `--studio-hi` / `--studio-lo`   | the studio sweep behind every 3D stage     | `#f3f4f6` / `#cfd4da` | same (renders match)  |
| `--tok-*`                       | source highlighting                        |                       |                       |

The studio stays light in the dark scheme: the committed renders are shot on light grey, and the
live canvas fades in over them. Text on a stage uses `--studio-ink`.

## Type

- Monospace (`--font-mono`, system stack, no web fonts) for headings, labels, numbers and code.
  Uppercase with wide tracking for small labels.
- System sans (`--font-body`) for prose and card titles.

## Pages

- **Home** (`#` or any non-asset hash): the showcase (featured assets compiled live at LOD0,
  orbiting, one after another; the first asset's `hero` render is the poster until the compile
  lands), the gallery (category chips, render cards), how it works.
- **Asset** (`#<asset_name>`): breadcrumb + prev/next, the viewer (Studio: orbit, turntable, Play
  runs the baked `run` clip; Scene: the asset on a diorama in a scenario picked from its named
  parts), LOD / wireframe / trim sheet, live stats, parts list (hover outlines the node), GLB per
  LOD; the info panel (category, QA verdict, triangles and draw calls per LOD, real vs model size,
  dossier and recipe links); measures (spec vs model, Δ%, source), sources, contact sheet, recipe.

## Data

- `media-plugin.ts` (Vite) reads `recipes/<folder>/out/<asset>/{manifest.json, hero.png,
  sheet.png}` and exposes them as `virtual:ts23d-media`. The build copies them to
  `media/<asset>/`, re-encoding heroes as WebP (1600×900 and an 800×450 card) when `cwebp` or
  ImageMagick is installed. The grid needs no compile at all.
- `items.ts` merges that with the worker's catalog (recipes without renders get a live LOD2 card),
  derives the category from `kind` and `tags`, and a title from the description.

## Accessibility

- Text tokens meet WCAG AA on their surfaces in both schemes. Every control is native (`a`,
  `button`, radio, checkbox, `details`) with a visible 2px `--focus` outline; the canvas and the
  source listing take focus, orbit responds to the arrow keys, part rows are focusable.
- `prefers-reduced-motion`: no smooth scrolling, transitions or animations, no turntable or orbit
  damping, the showcase does not cycle, and scenes wait for Play.
- Viewer changes are announced through a `role="status"` region.

## Structure

Plain TS and DOM, one job per module. The site is an asset gallery; ts23d makes assets for other
engines, so there is no game code here.

- Pipeline: `compile.worker.ts` (recipes → GLB, manifest, trim sheet, off the main thread),
  `recipe-modules.ts` (worker-side discovery; a recipe that fails to import is skipped),
  `compile-protocol.ts`, `compile.ts` (worker client, GLB → three.js), `recipes.ts` (page-side
  catalog, lazy recipe source).
- Page: `main.ts` (routing), `items.ts`, `media-types.ts`, `showcase.ts`, `gallery.ts`,
  `thumbnails.ts`, `how.ts`, `details.ts`, `viewer.ts` + `viewer-ui.ts` + `viewer-panels.ts`,
  `downloads.ts`, `source.ts`, `stage.ts` (lights, shadow-casting sun, grid, contact-shadow floor),
  `studio.ts` (renderer, environment, shadow catcher), `theme.ts`.
- Scenarios (`scenarios/`): unchanged contract; they read part names and kind, never the name.
- Presentation: `textures.ts`, `diorama.ts` + `ground-color.ts` + `noise.ts`, `particle-*.ts`.
- Styles: `style.css` imports `styles/{base,home,gallery,asset}.css`.

## Screenshots

`bun run site:build && bun run site:shots` serves the build, drives headless Chrome over the
DevTools protocol, waits for each page's live render, and writes `docs/media/*.png` (used by the
README). `--only site,site-asset`, `--height 3200` for a whole-page review, `--base <url>` to shoot
a running server.
