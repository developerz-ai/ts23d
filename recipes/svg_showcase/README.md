# SVG showcase — drawings in code, turned into game-ready solids (`svg_showcase`)

## Identity
A test card for "draw → 3D": a coding agent cannot emit pixels, but SVG is drawing-as-text, and
artists start models from front/side drawings. Every object on this plinth starts as an inline SVG
string in `svg_showcase.ts`. Signature features: a bevelled machine **gear** (12 teeth, a hub hole and
two lightening holes: even-odd holes + chamfer), a turned **amphora** (half profile drawn with
cubic/quadratic curves, spun by `latheSvg`), a **creature head** blocked out from a front and a side
and a top silhouette (`visualHull`) and refined with ordinary sculpt edits (eyes, brow, forehead
wrinkles, notched ears, nostrils, mouth, tusks) on a neck stump and a turned oak stand, and a
bevelled **star emblem** (polygon) on the plinth front. The gear's bore has a keyway 4 cm wide and
2.5 cm deep.

Materials and wear: the gear is machined steel (`aluminium` strip, bright and cool, face-weighted
normals so its flat faces stay flat) with oil darkening its tooth edges; the amphora is thrown clay
(`clay.ts`: a recipe strip with 1.4 cm throw-ring relief and grit, true-scale UVs) with dust on the
shoulder, a chipped lip and grime at the foot; the head is pored skin; the plinth is lacquered
walnut (a veneer quad keeping the oak strip's grain off its pale band edges) with a maple stringing
inlay round all four sides of its top, dust settled along its back edge and ends in four fading
steps (LOD0/1) and the front arris rubbed through
to pale wood in six worn stretches (LOD0). At LOD2 the head leaves out the features smaller than
its 3.4 cm cell (wrinkles, ear notches, pupils, nostrils, mouth, tusks), which only scattered stray
colour over its coarse facets.

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
- Most triangles go to the sculpted head (0.0095 / 0.016 / 0.034 m cells: ≈ 14.4k / 4.8k / 1k).

Budget why: a showcase board of four drawn objects, one of them a sculpted creature head; ≈ 19.1k / 6.5k / 1.7k (was 39k / 10k / 1.9k).
