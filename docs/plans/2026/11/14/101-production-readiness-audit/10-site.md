# 10 — Gallery site

Rule: the gallery always ends in an asset or a message, never a spinner. Gallery only: no game or
engine code.

## Files
| Path | State | Why |
|---|---|---|
| `apps/site/src/worker-pool.ts` + test | changed | worker failure handling |
| `apps/site/src/viewer.ts` + test | changed | WebGL-unavailable fallback |
| `apps/site/index.html` | changed | `<noscript>`, social meta, canonical |
| `apps/site/public/404.html` | new | GitHub Pages not-found page under `/ts23d/` |

## Depends on
07 only if the site reads `manifest.json` per-LOD arrays (slice 07 checks the readers first and
keeps the shape if it does). Otherwise none. Wave 4 so it builds against the final library.

## Change
- `worker-pool.ts:37-45` listens for `message` only. Add `error` and `messageerror` handlers: reject every job queued on that slot with the recipe name, terminate and respawn the worker once, and after a second failure mark the slot dead and surface the error in the card. The progress bar stops on rejection.
- `viewer.ts`: when a WebGL context cannot be created, show the committed `hero.png` for the asset plus one line of text; no retry loop.
- `index.html`: `<noscript>` with a link to the static renders; `og:title`, `og:description`, `og:image` (an existing hero), `twitter:card`, `<link rel="canonical">`.
- Not in this slice: bundle splitting (index chunk 738 kB / 188 kB gzip under a raised `chunkSizeWarningLimit`) and media weight (41 MB). Record both in `status.yml` notes.

## Tests
- Pool test with a fake `Worker` that fires `error`: the pending job rejects with the recipe name; the next job runs on a respawned worker; a second `error` leaves the slot dead and later jobs reject immediately.
- Viewer test with `getContext` returning `null`: the fallback element is rendered, no throw.

## Checks
`bun test apps/site/src` · `bun run site:build` · `bun run verify --only lint,typecheck`.
Open `bun run site:dev`, block the worker script in devtools, confirm the card shows the error.

## Docs
Slice 11: CHANGELOG line. No README change.

## Done when
A crashed worker and a missing WebGL context each end in a visible message; `site:build` passes.
