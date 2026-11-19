# Import demo — a scanned head on a code-built bust

## Identity
A teaching asset for the **hybrid** path: what ts23d does with a mesh it did not build. Code
cannot sculpt a face as well as a scan or a mature base mesh can, so the face comes **from a GLB**
and ts23d does the rest: licence gate, cleanup, three LOD budgets by QEM simplification, the house
material (or its own baked texture set), a checked joint onto a code-built bust, QA, renders.
Design: [docs/idea/21-import.md](../../docs/idea/21-import.md) · decision: ADR 011.

## The "scan" (a stand-in, CC0)
No real scan ships in the repo. `scan.ts` makes what one looks like on arrival from the committed
**CC0 MakeHuman hm08 base mesh** (`../_lib/face/base`, data only, no warp): one Catmull–Clark
level, a simple skin paint (flush, lips, thin brows, a cropped-hair scalp) as vertex colour, sawn
off through the lower neck the way a head scan ends, and registered onto the human bust (menton
on menton). It gets its **own lat-long UV layout** and a pore-detail PNG, ±0.2 mm scanner noise,
and the defects real scans have — a hole on the crown, flipped and duplicated faces, specks of
debris. `bun scripts/import.ts fixture` writes it to `tmp/import/scan.glb`; the recipe reads the
same bytes (hash-checked against `SCAN.sha256` in `source.ts`).

| Step | Where | Result on the stand-in |
|---|---|---|
| licence gate (CC0 / CC-BY / own; NC refused) | `importGlb` | CC0 accepted, credit line in `sources` |
| read GLB, bake node transforms, Y-up → Z-up | `importGlb` | metres, +X front, registered to the bust |
| clean: weld, winding, holes, duplicates, specks | `cleanMesh` | 9 flipped, 7 duplicates, 1 hole filled, neck cut left open, 5 small shells dropped (3 specks + 2 cut fragments) |
| albedo → vertex colour, UVs → the shared `face_skin` pore strip | `projectAlbedo`, `onSkin` (`recipes/_lib/face/skin-strip.ts`) | one skin material on the trim sheet, pores in its normal map, a `skin` sheen finish |
| LODs | `simplify` (QEM) | head 12 000 / 4 000 / 1 800 triangles (the far head keeps its eye sockets) |
| joint | `ctx.joint('neck', socket)` | the scan's neck plugs into the leather collar, sized from the neck **measured on the mesh** |
| own textures (opt-in) | `bun scripts/import.ts textured` | 1024² baked albedo + normal map (ears, lids, nostrils, lips), `head_own` material, +1 draw call |

## Code-built half
Eyeballs from the bust library seated in the scan's sockets (placed by hm08 landmarks); the human
bust's torso, leaner (`mass` 0.22, shoulders 16 cm half-span) with its neck matched to the scan's,
under the collar plane and sawn flat through each shoulder like a carved bust (no arm stubs):
slate dyed tunic with folds, a slim russet shoulder mantle with a loosely folded hem, a
vegetable-tanned leather collar roll whose centre line follows the neck's own outline as measured
on the mesh (48 sectors; an ellipse through the neck's bounding box stood off the flat back of the
neck), an old-brass brooch, a turned plinth. Muted palette in `build.ts` (`DYED`).

Materials: the garment on the `canvas` strip (weave, folds, water stains; dyes are divided by the
strip's own colour so they land true), the collar on `leather`, the brooch on `brass`, the scan's
skin on `face_skin` with a `skin` sheen finish, the plinth on `stone`.

Wear: the cloth sun-faded and dusty on the shoulders and soiled at the hem (`weather()`, coverage
in the manifest), the mantle's edge frayed to pale thread, the collar rubbed pale on top and dark
in its groove, the plinth chipped and dusty.

## Swap in a real scan (MakeHuman / MPFB, CC0)
1. Export a head from MakeHuman 1.x or MPFB 2 (Blender) as `.glb` (no Draco compression). Their
   bundled assets are CC0 — check any third-party skin or hair you add.
2. `bun scripts/import.ts cache path/to/head.glb` → prints the sha256 and stores the file in
   `node_modules/.cache/ts23d/imports/`.
3. In `source.ts`: set `path`, `sha256`, `author`, `url`, `license: 'CC0-1.0'`; drop `bytes:
   scanGlb()`; choose `place` / `height` (`importGlb(…, { height: 0.23 })` fits the head height).
4. Before compiling: `provideImports(await loadImportCache())` (from `scripts/import.ts`).
5. Re-register: set `OFFSET` (scan-head.ts) so the new menton lands on the bust's; the collar and
   joint follow the neck measured on the mesh. Place the eyes from your scan's own landmarks.
   Rebuild until QA PASS, `bun run shots import_demo`.

## Open questions
The hair is paint on the scan (as a scanner records a short cut), not geometry. The torso ends in
the shared bust library's arm cut (sawn through the deltoid, no stubs). The own-texture GLB is validated by the Khronos validator in
tests but not rendered by ts23d's CPU renderer (it shows the trim-sheet path).
