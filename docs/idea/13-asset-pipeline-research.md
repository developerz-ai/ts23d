# 13 — The professional game-asset pipeline, free CC0 libraries, and where ts23d sits

**The studio pipeline is blockout → high poly → low poly → UV → bake → texture → present. ts23d collapses most of it into one compile: the recipe is the blockout and the low poly, the trim sheet replaces per-asset UV + bake + texture, and `shot` / `hero` / `review` are the presentation. What it borrows from the pipeline is the taste: bevels, roughness variation, consistent texel density, readable silhouettes.** This page records the pipeline as practitioners describe it, the free CC0 libraries (with exact licence wording) that can feed ts23d as inputs, and the gaps. Research as of 2026-11-07; "Proposed" items are **planned, not shipped**. Neutral positioning: artists, DCC tools and AI generators all produce good assets; ts23d is the free, code-based option.

## The pipeline as practitioners describe it

| Stage | What happens | Typical tools | ts23d equivalent | Where |
|---|---|---|---|---|
| Reference | Photos, drawings, specs, front/side sheets | PureRef, browser | `recipes/<name>/README.md` written first; `real` + `sources` + `measures` | CLAUDE.md recipe loop |
| **Blockout** | Primitive masses at real scale, read the silhouette in-engine | Any DCC | Step 2 "Masses", `proportions` ±5% / `measures` ±2% gates | [05](05-agent-loop.md) |
| High poly | Sub-D or sculpt with every bevel and detail, for baking only | ZBrush, Blender, Maya | Not a separate artefact: LOD0 *is* the dense mesh; SDF normals come from the exact field | `src/primitives/sdf.ts` |
| Low poly | Game mesh around the high poly; hard edges at UV splits | DCC, retopo tools | Same recipe at LOD1/LOD2, gated by `ctx.lod`, never decimated | [02](02-dsl.md), CLAUDE.md |
| UV | Unwrap, pack, consistent texel density | RizomUV, Blender | Primitives author UVs onto the trim sheet at true metres | `src/material/trim-sheet.ts` |
| **Bake** | High → low: normal, AO, curvature, ID; cage controls the ray search so hard edges shade soft | Marmoset Toolbag, Substance, xNormal, Blender | Vertex AO (`bakeAo`), weighted normals, field-gradient normals; no per-asset maps by design | `src/passes/bake-ao.ts`, `weighted-normals.ts` |
| Texture | Smart materials on baked maps: edge wear from curvature, dirt from AO, roughness breakup | Substance Painter, ArmorPaint | Procedural trim sheet + vertex colour + `grime` / `livery`; edge wear planned ([11](11-materials-authoring.md)) | `src/material/paint/`, `src/passes/` |
| Present | Marmoset turntable, ArtStation renders, in-engine shots | Marmoset, engine | `t3d shot` (six views), `t3d hero` (beauty), `t3d review` (AI review pack) | `src/render/` |

Order varies: some artists build the high poly first and the low poly around it, others go blockout → mid → high → low; hard-surface flows often add an in-between mesh ([Polycount thread](https://polycount.com/discussion/comment/1771950), practitioner opinions). The bake cage "allows the baker to search for high-poly detail as if edges were soft, while the actual low-poly retains hard edges" (Gnomon course description, [Creating Props for Games](https://bit.thegnomonworkshop.com/workshops/creating-props-for-games-vol-1)).

## The two realism keys

**Bevels.** Real objects have no razor edges; a 1–5 mm chamfer catches a highlight and reads as "manufactured" even at a distance. Studios fake bevels in textures to save triangles: Insomniac's "Ultimate Trim" (GDC 2015, Sunset Overdrive) is a sheet of horizontal trim strips with 45° normal-map bevels, standardised so materials swap without re-UVing ([GDC Vault](https://gdcvault.com/play/1022323/The-Ultimate-Trim-Texturing-Techniques), [CG Channel summary](https://www.cgchannel.com/2019/07/download-justen-lazarros-free-ultimate-trim-texturing-tools)). The Last of Us Part I used baked-bevel trims to save texture memory ([80.lv](https://80.lv/articles/the-last-of-us-remake-s-trim-pipeline-in-substance-3d-explained)).
ts23d today: geometric bevels via `box({ bevel })` + `weightedNormals` (the mid-poly look; `src/primitives/bevel-box.ts`).

**Roughness variation.** A flat roughness value reads as plastic CG; smudges, wear and dirt varying the specular response read as a material. ts23d today: every painter writes a `rough` layer with mottling; there is no gate on it. Proposed: `roughnessVariation` + a flat-roughness test ([11](11-materials-authoring.md)).

### Trim sheets

ts23d's sheet *is* a trim sheet in the studio sense ([ADR 003](../decisions/003-shared-trim-sheet.md) → [ADR 008](../decisions/008-surface-materials.md)): 28 strip rows tiling along U, then decal and foliage cells, one 2048² set (`src/material/trim-sheet.ts`). What studio trims have that ts23d's lacks:

| Studio trim feature | ts23d | Proposed |
|---|---|---|
| Bevel/edge strips with baked 45° normal + worn edge | No; bevels are geometry | A `worn_edge` strip; map `box({ bevel })` chamfers onto it (S–M) |
| Strip heights doubling (small to large trims) | Equal 64 px rows | Only if a recipe needs fine trims; layout change = ADR |
| Decals over trims (bolts, vents, grates) as floating quads | Cells, mapped by `cell()` | `decal()` primitive: a quad offset 1–2 mm along the normal, cutout surface (S) |

### Texel density

Examples from vendor docs: 10.24 px/cm first person, 5.12 px/cm third person, 2.56 px/cm or less top-down; closer cameras need more ([Maxon](https://help.maxon.net/c4d/en-us/Content/html/Texel_Density.html)). ts23d's strips give 1024 px/m along U at 2048² (a strip spans 2 m), constant across assets by construction; along V it depends on `scaleMetres`. The planned texel-density gate (roadmap M2) should measure both axes.

## Free CC0 libraries

All five below state CC0 or public-domain terms. CC0 means no attribution required and commercial use and redistribution allowed; it also means **no warranty** (no indemnity for trademarks, likeness or third-party IP depicted). Verified on each site 2026-11-07 unless noted.

| Library | What | Licence wording | Exceptions | Fits ts23d as |
|---|---|---|---|---|
| [Poly Haven](https://polyhaven.com/license) | HDRIs, PBR textures, models | "Our assets are all licensed as CC0"; "You can redistribute them"; "You do not need to give credit" | Site content other than the assets (logos, renders) is protected | **HDRIs** for the Blender bridge's Cycles renders ([12](12-blender-bridge.md)) and a future image-based-light option in `beauty()`; texture calibration |
| [ambientCG](https://docs.ambientcg.com/license/) | PBR materials, HDRIs, models | "provided under the Creative Commons CC0 1.0 Universal License"; "You don't need to give credit" | None stated | Calibrating `MaterialDef` roughness/albedo; CC0 **height** maps as strip sources ([11](11-materials-authoring.md)) |
| [cgbookcase](https://www.cgbookcase.com) | PBR textures (hundreds of sets) | CC0 per the author's announcements ([BlenderNation 2018](https://www.blendernation.com/2018/09/14/250-free-cc0-high-quality-pbr-textures-from-cgbookcase-com/), [CG Channel 2019](https://www.cgchannel.com/2019/03/download-380-free-pbr-texture-sets-from-cgbookcase-com/)) | **Licence page not reachable when checked (404)**; verify on the site before vendoring | Same as ambientCG |
| [Kenney](https://kenney.nl/support) | Low-poly game kits, UI, audio | "all game assets on the asset pages are public domain licensed (CC0)"; "Attribution is not required" | "Do not use our logo" | `importGlb` (planned, M5) inputs; scale/style references for stylised recipes |
| [Quaternius](https://quaternius.com/packs/fantasypropsmegakit.html) | Low-poly models, some rigged/animated, glTF included | CC0, "free to use in personal, educational and commercial projects" (pack pages; [OpenGameArt mirrors](https://opengameart.org/content/low-poly-rpg-pack)) | None stated | `importGlb` inputs: rigged characters for what recipes do weakly ([07](07-what-fits.md)) |

Other licences to know, **not** CC0: Sketchfab downloads carry per-model CC-BY / CC-BY-NC etc. (check each); Fab/Quixel Megascans have their own EULA; Substance Source is subscription content. None of these should be vendored into the repo.

### How CC0 assets enter ts23d without breaking determinism

| Rule | Why |
|---|---|
| **Vendor, never fetch at build time.** Commit the file (or publish it with the package) with its sha256 | A URL can change or vanish; bytes in git cannot |
| **Record provenance in `sources`** (URL, licence, date) and in GLB XMP (`KHR_xmp_json_ld`, shipped) | CC0 needs no credit, but provenance is how a reviewer checks it |
| **Images are inputs, not the only path** ([04](04-materials.md#image-sources)) | The sheet must still paint with no image present |
| **Imported meshes go through `importGlb` → fit → recolour onto the sheet** | Keeps one material and real units |
| A `licence` field per vendored input, checked by a script in `bun run verify` (proposed) | "A rule without a script is a suggestion" (CLAUDE.md) |

## Where ts23d differs on purpose

| Studio practice | ts23d choice | Reason |
|---|---|---|
| Per-asset baked normal/AO/curvature maps | One shared sheet; wear in vertex data | One draw call, swap palette by recipe edit ([ADR 008](../decisions/008-surface-materials.md)) |
| Decimate the high poly for LODs | LOD-gated emission from one source | Cleaner silhouettes, named parts survive every LOD |
| Hand UVs | UVs by construction at true metres | Agents don't unwrap; consistent density for free |
| Quad retopology | Triangles, vertex-cache ordered (`optimize`) | Engines draw triangles; ts23d doesn't subdivide |

## Next steps for ts23d (prioritised)

1. **Texel-density gate** (px/m along U and V per part; V-stretch warning). S–M. Already on roadmap M2.
2. **`worn_edge` strip + bevel-to-strip mapping** in `box({ bevel })`: the Ultimate-Trim idea with real geometry. S–M.
3. **`decal()` primitive**: offset quad on a cell, cutout surface, for bolts/vents/grates. S.
4. **Vendored-input convention + `licence` check** in `bun run verify` (sha256, URL, licence, date per file under `assets/vendor/` or similar). S.
5. **Roughness-variation knob + flat-roughness test** ([11](11-materials-authoring.md)). S.
6. **CC0 HDRI support**: Poly Haven `.hdr` loader for an optional IBL term in `beauty()` (zero-dep RGBE decode is ~100 lines) and for the Blender bridge. M.
7. **Document the calibration workflow** in `.claude/skills/author-recipe/SKILL.md`: sample a CC0 texture's albedo/roughness, put the numbers in `MaterialDef`, cite the URL. S.

## Sources

- Pipeline: [Polycount threads](https://polycount.com/discussion/comment/1771950), [Gnomon: Creating Props for Games](https://bit.thegnomonworkshop.com/workshops/creating-props-for-games-vol-1) (course description) — practitioner accounts, not a standard
- Trims: [GDC Vault, "The Ultimate Trim: Texturing Techniques of Sunset Overdrive"](https://gdcvault.com/play/1022323/The-Ultimate-Trim-Texturing-Techniques) (Insomniac, 2015), [CG Channel](https://www.cgchannel.com/2019/07/download-justen-lazarros-free-ultimate-trim-texturing-tools), [80.lv on The Last of Us Part I trims](https://80.lv/articles/the-last-of-us-remake-s-trim-pipeline-in-substance-3d-explained)
- Texel density: [Maxon Cinema 4D docs](https://help.maxon.net/c4d/en-us/Content/html/Texel_Density.html)
- Licences: [Poly Haven](https://polyhaven.com/license), [ambientCG](https://docs.ambientcg.com/license/), [Kenney](https://kenney.nl/support), [Quaternius](https://quaternius.com/packs/fantasypropsmegakit.html), cgbookcase via [BlenderNation](https://www.blendernation.com/2018/09/14/250-free-cc0-high-quality-pbr-textures-from-cgbookcase-com/) and [CG Channel](https://www.cgchannel.com/2019/03/download-380-free-pbr-texture-sets-from-cgbookcase-com/)
