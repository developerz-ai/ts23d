# ts23d site: design identity

**Direction: blueprint / technical drawing.** The CLI's contact sheets are orthographic line
renders, so the site looks like the drawing set they belong to: drafting-grid paper, hairline
frames with an inset border (a drawing frame), title-block labels in monospace, and one
"redline" accent for what is selected or moving. No gradients, shadows, glass or rounded corners.

## Tokens (`src/style.css`, `:root`)

| token                           | role                                       | light (vellum)        | dark (cyanotype)      |
| ------------------------------- | ------------------------------------------ | --------------------- | --------------------- |
| `--paper` / `--paper-raised`    | page / sheet                               | `#f4f1e8` / `#fbf9f3` | `#0b2545` / `#0f2e54` |
| `--ink` / `--ink-muted`         | text                                       | `#12305a` / `#3f5878` | `#e6f0ff` / `#a9bfdc` |
| `--rule` / `--rule-strong`      | hairlines, frames, control borders         | `#9fb3cc` / `#5f7ea3` | `#33598a` / `#6f9ad0` |
| `--grid-minor` / `--grid-major` | drafting grid (CSS and the 3D ground grid) |                       |                       |
| `--redline`                     | selection, moving parts, pressed state     | `#b5380b`             | `#ff9a76`             |
| `--focus`                       | focus ring                                 | `#b5380b`             | `#ffd166`             |
| `--tok-*`                       | source highlighting                        |                       |                       |

The scheme follows `prefers-color-scheme`. `theme.ts` reads the tokens into three.js, so the
3D grid matches the page and updates when the scheme flips.

## Type

- Monospace (`--font-mono`, system stack, no web fonts) for headings, labels, numbers and code:
  the title-block voice. Uppercase with wide tracking for small labels.
- System sans (`--font-body`) for prose.

## Accessibility

- Text tokens meet WCAG AA (4.5:1) on their surfaces in both schemes. Most are above 6:1.
- Every control is native (`a`, `button`, radio, checkbox), with a visible 2px `--focus`
  outline. A skip link goes to the viewer. The canvas and the scrolling source listing can take
  focus, and the orbit controls respond to the arrow keys.
- `prefers-reduced-motion`: no smooth scrolling, no hover transitions, no orbit damping, no camera
  easing or shake, and scenarios wait for Play instead of autoplaying.
- Viewer changes are announced through a `role="status"` region.

## Structure

Plain TS and DOM, one job per module. The site is an asset gallery; ts23d makes assets for other
engines, so there is no game code here.

- Pipeline: `compile.worker.ts` (recipes → GLB, manifest and trim sheet, off the main thread),
  `recipe-modules.ts` (worker-side discovery, family stems), `compile-protocol.ts`, `compile.ts`
  (worker client, GLB → three.js), `recipes.ts` (page-side catalog and lazy recipe source).
- Page: `main.ts` (wiring, `#asset` routing), `hero.ts`, `gallery.ts`, `thumbnails.ts`,
  `viewer.ts`, `downloads.ts` (GLB per LOD), `details.ts` (manifest and contact sheet),
  `source.ts`, `stage.ts`, `theme.ts`. Cards show the published `/thumbs/<name>.png`, with a
  LOD2 render as the fallback.
- Scenarios (`scenarios/`): `types.ts` (contract), `hooks.ts` (kind, named nodes, clip, emitters,
  size), `pick.ts` (most specific match wins), and one module per show: `tracked.ts` (drive,
  stop, traverse, fire), `locomotive.ts` (tiled own track, trackside pan), `tree.ts` (gust on the
  crown sway, falling leaves), `landmark.ts` (turntable through a day, rising camera for tall
  things), `turntable.ts` (fallback), plus `cinema.ts` (eased camera). Scenarios read part names
  and kind, never the asset's name. `?t=<seconds>` deep-links to a paused moment.
- Presentation: `textures.ts` (trim sheet on/off), `diorama.ts` + `ground-color.ts` + `noise.ts`
  (terrain base under the model), `particle-kinds.ts` + `particle-layer.ts` + `particles.ts`
  (preview of the emitters a recipe declares).
