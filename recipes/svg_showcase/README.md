# SVG showcase — drawings in code, turned into game-ready solids (`svg_showcase`)

## Identity
A test card for "draw → 3D": a coding agent cannot emit pixels, but SVG is drawing-as-text, and
artists start models from front/side drawings. Every object on this plinth starts as an inline SVG
string in `svg_showcase.ts`. Signature features: a bevelled machine **gear** (12 teeth, a hub hole and
two lightening holes: even-odd holes + chamfer), a turned **amphora** (half profile drawn with
cubic/quadratic curves, spun by `latheSvg`), a **creature head** blocked out from a front and a side
and a top silhouette (`visualHull`) and refined with ordinary sculpt edits (eyes, brow, forehead
wrinkles, notched ears, nostrils, mouth, tusks) on a neck stump and a turned oak stand, and a
bevelled **star emblem** (polygon) on the plinth front. The gear's bore has a keyway.

Materials and wear: the gear is galvanised steel (metal, machined roughness) with oil darkening its
tooth flanks and bore; the amphora is matte clay (concrete strip, true-scale UVs) with throw rings
toned into it, dust on the shoulder, a chipped lip and grime at the foot; the head is pored skin.

## Specs
Design spec, not a real object: sizes chosen to read as one display piece, roughly desk-diorama scale.

| Dimension | Value (m) | Source |
|---|---|---|
| plinth (L × W × H) | 0.50 × 1.80 × 0.12 | design |
| gear outside diameter / thickness | 0.48 / 0.06 | design (`GEAR` svg, 100 units = 0.5 m) |
| gear hub hole diameter | 0.12 | design |
| amphora height / max radius | 0.50 / 0.13 | design (`AMPHORA` svg, 0.005 m per unit) |
| head height / width / depth | 0.42 / 0.36 / 0.40 | design (`HEAD_FRONT`, `HEAD_SIDE` svgs, 0.004 m per unit) |
| emblem star diameter / thickness | 0.09 / 0.012 | design (fits the 0.12 m plinth face) |
| head stand diameter / height | 0.20 / 0.05 | design |

## Photos (by view)
None: the references ARE the drawings, inline in the recipe (front/side for the head, a half profile
for the amphora, plan outlines for the gear and star). Paste any of the `<svg>` strings into a browser
to see the input next to `out/svg_showcase/sheet.png`.

## Parts the engine needs
`plinth`, `gear`, `amphora`, `stand`, `head` (sculpted about y = 0, placed by its part pivot),
`emblem` (LOD0–1 only). All static: a display piece, no motion or sockets.

## Open questions
- Silhouette hulls are intersections of extruded views, so they read boxy from 3/4 until sculpt
  edits round them. The recipe smooth-intersects a skull ellipsoid (trimming the ears), then adds
  the ears back from the same hull clipped to an ear box: the sculptor's "block out, then refine".
- Most triangles go to the sculpted head (0.009 / 0.016 / 0.034 m cells: ≈ 16k / 4.9k / 1k).

Budget why: a showcase board of four drawn objects, one of them a sculpted creature head; ≈ 21k / 6.6k / 1.7k (was 39k / 10k / 1.9k).
