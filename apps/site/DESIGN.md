# ts23d site: design identity

**Direction: blueprint chrome around a photo studio.** The page itself is the drawing set the CLI's
contact sheets belong to: drafting-grid paper, hairline frames with an inset border, title-block
labels in monospace, one "redline" accent for what is selected or moving. The 3D, though, is
presented like a product shot: a studio sweep, PBR Neutral tone mapping (base colours stay true),
procedural image-based light per category (product studio for hard surface, warm portrait key +
cool rim for characters, sky + low sun outdoors), soft key shadows, a baked contact shadow, and on
the high quality tier ambient occlusion + MSAA — close to the CLI's `hero.png` beauty renders, so
the poster image and the live model match.

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
live canvas fades in over them. Text on a stage uses `--studio-ink`. The one exception is a water
asset: its stage is deep water, and the home showcase's copy turns light while it is shown.

## Type

- Monospace (`--font-mono`, system stack, no web fonts) for headings, labels, numbers and code.
  Uppercase with wide tracking for small labels.
- System sans (`--font-body`) for prose and card titles.

## Pages

- **Home** (`#` or any non-asset hash): the showcase (featured assets compiled live at LOD0,
  orbiting, one after another; the first asset's `hero` render is the poster until the compile
  lands), the gallery (category chips, render cards), how it works.
- **Asset** (`#<asset_name>`): breadcrumb + prev/next, the viewer (heavy assets open at LOD1 with a
  redline "Load full detail" button; a time-based bar shows elapsed vs estimated compile time;
  Studio: orbit, turntable, Play
  runs the picked clip (`run`, else `cruise`, `idle`, else the first), Skeleton for skinned assets; Scene: the asset on a diorama in a scenario picked from its named
  parts; an asset declaring `medium: 'water'` swims in open water instead, with no floor, diorama
  or contact shadow in either mode), LOD / wireframe / trim sheet, live stats, parts list (hover outlines the node), GLB per
  LOD; the info panel (category, QA verdict, triangles and draw calls per LOD, real vs model size,
  dossier and recipe links); sounds (play buttons, optional positional audio); measures (spec vs
  model, Δ%, source), sources; quality (critique scores, art metrics, weathering coverage); renders
  (contact sheet, blueprint, RTS icon/portrait/shot); recipe (file picker for multi-file recipes).
- **Two tiers** (`src/tier-toggle.ts`, `src/credits-panel.ts`): a "CPU tier / Model tier" switch
  under the viewer, in two layouts. A pair: an asset `<name>` with a recipe `<name>_hybrid` whose
  model outputs are committed (`recipes/<name>_hybrid/neural/*/record.json`) also gets the switch
  on its card; `#<name>_hybrid` links to the model tier and hybrids never get their own card. One
  recipe: a model-first asset with records in its own folder (`ranger`) opens on the model tier
  (what its committed renders show) and `#<name>@cpu` shows the same recipe built without them.
  The CPU tier is the recipe alone (no GPU, deterministic); the model tier compiles live in the
  worker with the committed outputs (the media plugin publishes them under
  `media/neural/<folder>/<key>/`, never the local-only raw files; the worker re-checks every hash;
  a failed fetch is an error, never a silent CPU asset). Outputs load only on that asset's page:
  the home showcase skips a model-first asset above 2 MB. The credit line is neutral ("Made with
  Pixal3D (MIT) and Z-Image-Turbo (Apache-2.0)"), then one line per record: task · model ·
  licence · adapter kind; a hosted service reads "a hosted service (paid)" with its terms link,
  and a Blender record lists its steps and the tool's version and licence. Data attributions a
  licence asks for (OpenStreetMap, ODbL) show under any viewer. `showcase.config.ts` (repo root)
  names the model or tool per task behind each showcased model tier; a site test holds it to the
  records.
- **Own textures** (`src/texture-sets.ts`): a part's texture set (ADR 016) arrives inside the GLB
  as a `ts23d_tex_<set>` material and is decoded by the browser. The viewer keeps albedo sRGB,
  normal and ORM linear, UVs unflipped, the normal map on the mesh's tangents; the trim-sheet
  toggle never touches these materials (it is off and disabled when nothing else is on screen),
  and the stats name each set and its map sizes.
- **Motion** (`src/viewer-motion.ts`): Studio's clip picker lists every baked clip (idle, walk,
  trot, gallop, blink, talk, cruise, slither, run…; never `rest`); a skinned asset's travelling
  loops play on the spot, so they have no seam. The model holds its rest pose until Play, except that a water asset starts swimming on open unless reduced motion is set; a clip
  that carries it well outside the framed pose pulls the camera back. A Skeleton checkbox draws its
  bones in redline.
- **Order**: the flagships first in the showcase and the grid (`FLAGSHIPS` in `flagships.ts`: wolf,
  ranger, great white, bluefin tuna, octopus, king cobra, hydra, the heads, tiger, dragon, fox, brown
  bear, city block), then categories.
- **Categories** (`src/categories.ts`): Creatures, Characters, Vehicles, Strategy kit, Architecture,
  Nature & Terrain, Sci-fi, Materials & finishes, Parts, Sound, Tech demos, Props.

## Data

- `media-plugin.ts` (Vite) reads `recipes/<folder>/out/<asset>/` (`media-scan.ts`) and exposes the
  card data as `virtual:ts23d-media`; the per-asset rest is `media/<asset>/facts.json`. The build copies them to
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

- Pipeline: `worker-pool.ts` (2–3 compile workers, cancellable), `compile.worker.ts` (recipes →
  GLB, manifest, trim sheet, off the main thread), `recipe-modules.ts` (entry modules only; one
  imported per build; a recipe that fails to import is skipped), `lod-policy.ts`,
  `compile-protocol.ts`, `compile.ts` (worker client, GLB → three.js), `recipes.ts` (page-side
  catalog, lazy recipe source).
- Page: `main.ts` (routing), `items.ts`, `media-types.ts`, `showcase.ts`, `gallery.ts`,
  `thumbnails.ts`, `how.ts`, `details.ts`, `viewer.ts` + `viewer-ui.ts` + `viewer-panels.ts`,
  `downloads.ts`, `source.ts`, `stage.ts` (lights, shadow-casting sun, grid, contact-shadow floor),
  `studio.ts` (renderer, shadow catcher), `look.ts` + `lightbox.ts` + `backdrop.ts` (per-category
  light, procedural environment, backdrop), `contact-shadow.ts`, `post.ts` (lazy AO chunk),
  `quality.ts` (tiers), `theme.ts`.
- Scenarios (`scenarios/`): unchanged contract; they read part names, kind and medium, never the
  name. `ground` may return null (no diorama).
- Presentation: `textures.ts`, `diorama.ts` + `ground-color.ts` + `noise.ts`, `particle-*.ts`.
- Styles: `style.css` imports `styles/{base,home,gallery,asset}.css`.

## Screenshots

`bun run site:build && bun run site:shots` serves the build, drives headless Chrome over the
DevTools protocol, waits for each page's live render, and writes `docs/media/*.png` (used by the
README). `--only site,site-asset`, `--height 3200` for a whole-page review, `--base <url>` to shoot
a running server.
