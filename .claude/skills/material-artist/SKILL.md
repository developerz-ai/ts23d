---
name: material-artist
description: A material / texture artist's workflow for ts23d — PBR materials on the shared trim sheet. Physically plausible albedo, roughness and metalness ranges, height-first procedural graphs with `tex.*`, tiling, wear and weathering variants, finishes (clearcoat, sheen, anisotropy), optics for glass and liquids, texel density. Use when creating or reviewing a material, strip, palette, finish, optics preset or any texture-graph / trim-sheet work.
---

# Material / texture artist

Use with [11-materials-authoring](../../../docs/idea/11-materials-authoring.md),
[materials architecture](../../../docs/architecture/materials.md),
[surfaces-volumes research](../../../docs/research/surfaces-volumes.md) and
[16-art-as-text](../../../docs/idea/16-art-as-text.md). One material per asset: everything lands on
the shared trim sheet + vertex colour; extra slots only via `paint`, `finishes`, `optics`, surfaces.

## When
A new strip or library material, a texture graph, a weathered variant, a palette, a finish, glass
or liquid optics, or a critique that scores `materials` below 8.

## Workflow (Substance-style → ts23d)
| # | Stage | ts23d | Exit |
|---|---|---|---|
| 1 | Reference: real swatches under neutral light, close-up and at distance; measured albedo if possible | dossier section; [PBR albedo charts](../../../docs/research/skills-matrix.md#sources) | target values written down |
| 2 | Height first: the shape of the surface (bricks, planks, scales, strata) | `tex.bricks`, `tex.tiles`, `tex.planks`, `tex.cells`, `tex.scales`, `tex.strata`, `tex.pebbles`, `tex.scatter` | height reads in greyscale |
| 3 | Albedo from height and masks | `tex.colour`, `tex.ramp`, `tex.heightBlend`, `tex.blend`, `tex.noise` | values inside the range below |
| 4 | Roughness and metal | `tex.material` channels; metal 0 or 1, rarely between | `assertValueRange` PASS |
| 5 | Masks: cavity, edges, wear | `tex.cavity`, `tex.edgeWear` | wear in crevices and on edges |
| 6 | Register | `defineMaterial({ … })`; variants via `materialVariant` / `weathered(from, { wet, wear, age })` | strip in the library, credited |
| 7 | Tile and pack | `bun run textures`; `paintTrimSheet` | `assertTileable`, `assertNoBleed` PASS |
| 8 | Finishes and optics | asset `finishes` (clearcoat, sheen, anisotropy, iridescence, specular) and `optics` (`OPTICS.*`, ior, attenuation) | right KHR_materials_* in the GLB |
| 9 | Test on an asset under the studio light | `recipes/material_swatches`, `t3d hero`, `t3d critique` (`raking.png`) | reads as itself, not plastic |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Albedo (dielectric) | ≈ 50–243 sRGB; charcoal ≈ 0.04 linear, fresh snow ≈ 0.8 linear | `assertValueRange` |
| Albedo (metal) | specular colour, 0.5–0.98 linear (≈ 180–250 sRGB); diffuse black | `assertValueRange` |
| F0 | dielectrics reflect ≈ 4 % at normal incidence (glTF default specular) | fixed by the metal-rough model |
| Metalness | binary in nature: 0 for paint, rust, dirt, oxide; 1 for clean metal | masks at 0/1, gradients only at transitions |
| Roughness | micro-surface; polished 0.05–0.2, worn paint 0.4–0.6, concrete 0.8–0.95 *typical, verify* | review raking light |
| Texel density | pixels per metre on the asset, consistent across parts | `assertTexelDensity(asset, [lo, hi])` |
| Tileable | no seam step at the wrap | `assertTileable`, `seamStep` |
| Bleed | neighbouring strips do not leak at mip levels | `assertNoBleed` |
| IOR | water 1.33, ice 1.31, window glass 1.52 (Khronos examples) | `optics`, `OPTICS` |
| Wear logic | edges chip, cavities collect dirt, tops collect dust, water streaks down | `tex.edgeWear`, `tex.cavity`; geometry-driven `weather()` **planned** |

## Quality bar
- [ ] Every albedo and roughness inside physical ranges; metal binary.
- [ ] Height drives albedo and roughness (one cause, many channels), not three unrelated noises.
- [ ] Reads at three distances: close (pores, grain), mid (pattern), far (average colour).
- [ ] Tileable, no bleed, texel density even across the asset.
- [ ] Weathered variant tells a story (age, wet, wear) and keeps the base material's identity.
- [ ] Glass/liquids carry real IOR and attenuation; opaque fallback still reads.
- [ ] CC0 sources credited (`stripCredits`); no texture from an unclear licence.

## Common mistakes
- Pure black or pure white albedo; baked lighting in albedo.
- Grey metal with metalness 0.5 everywhere.
- Noise at one frequency only: flat at distance, busy up close.
- Pattern scale wrong for the world (bricks 40 cm long).
- Wear painted uniformly, ignoring edges, gravity and touch.

## Test it
```ts
import { paintTrimSheet } from '@developerz.ai/ts23d';
import { assertNoBleed, assertTileable, assertValueRange } from '@developerz.ai/ts23d/testing';
it('values are physical', () => assertValueRange(paintTrimSheet(sheet)));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run textures                          # repaint and cache the trim sheet
bun test src/testing/texture.test.ts       # tileable / bleed helpers
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [technical-artist](../technical-artist/SKILL.md): texel density, sheet size, draw calls.
- [presentation-artist](../presentation-artist/SKILL.md): look-dev under the studio light.
- [art-director](../art-director/SKILL.md): palette roles and wear conventions.
- [product-designer](../product-designer/SKILL.md): CMF sets and colourways.
- [environment-artist](../environment-artist/SKILL.md): ground and wall strips at scale.

## Tool status
Shipped: `tex.*` graph, `defineMaterial`, libraries (`MATERIAL_LIBRARY`, `NATURE_LIBRARY`,
`CREATURE_MATERIALS`, `CC0_MATERIALS`), variants, finishes, optics, texture helpers.
Planned: emissive texture layer, vertex-colour alpha, geometry-driven `weather()`, edge wear from
mesh curvature, morph/flipbook textures, HDRI look-dev for the beauty render.
Neutral positioning: the free code-based option, no claims against paid texturing tools.
