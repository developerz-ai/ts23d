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
- `prefers-reduced-motion`: no smooth scrolling, no hover transitions, no orbit damping, and the
  baked animation starts paused.
- Viewer changes are announced through a `role="status"` region.

## Structure

Plain TS and DOM. Each module has one job.

- Pipeline: `recipes.ts` (discovery, family stems), `compile.worker.ts` (recipe → GLB off the main
  thread), `compile-protocol.ts`, `compile.ts` (worker client, GLB → three.js), `axes.ts` (glTF
  front +Z → play frame front +X).
- Page: `main.ts` (wiring, `#play` / `#asset` routing), `hero.ts`, `gallery.ts`, `thumbnails.ts`,
  `viewer.ts`, `source.ts`, `stage.ts`, `theme.ts`.
- Ground: `noise.ts` (seeded PRNG, value noise), `ground-color.ts`, `diorama.ts` (viewer base).
- Particles: `particle-kinds.ts` (per-kind look and physics), `particle-layer.ts` (instanced
  billboards, one draw call per blend mode), `particles.ts` (emitters from `userData.ts23d`).
- Play: `play/input.ts`, `play/rig.ts` (binds part names), `play/vehicle.ts`, `play/weapon.ts`,
  `play/camera.ts`, `play/ground.ts` (pure height function + terrain asset), `play/terrain.ts`
  (chunk LODs, ground fitting), `play/world.ts` (scene composition), `play/hud.ts`,
  `play/index.ts`.

The play scene keeps the blueprint palette for the sky and fog only. The ground and models carry
their own colours, so the scene reads as a diorama on a drawing sheet.
