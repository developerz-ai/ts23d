# 12 — Gallery shows textured parts (site)

## Files
`apps/site/src/**` files that build three.js meshes from compiled assets and the tier toggle (`viewer.ts`, `tier-toggle.ts`, `items.ts`, `recipe-modules.ts`, new `texture-sets.ts` + test) · `showcase.config.ts`.

## Depends on
05, 08–11.

## Change
- The viewer loads the texture sets of a compiled asset (or the prebuilt GLB the toggle already loads) with correct colour spaces and tangents.
- New assets in the showcase order; credits panel shows model + licence + "Blender steps".
- Neutral wording: "CPU tier" / "model tier".

## Tests
Unit test for the texture-set → three material mapping.

## Checks
`bun run site:build`; Playwright screenshot of the wolf page read.

## Done when
The wolf's model tier shows textured in the gallery.
