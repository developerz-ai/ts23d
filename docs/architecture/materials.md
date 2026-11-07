# Materials: one trim sheet, many physically distinct surfaces

Every asset is still **one material, one draw call**: a shared atlas with albedo, normal and ORM
(occlusion, roughness, metalness). A surface looks like oak, rusty iron or chrome because of what
its **strip** holds. Vertex colour multiplies the albedo: it tints a classic strip and sets the paint
colour of a painted strip.

## Layout (v2): 2048² atlas

| V range | Contents |
|---|---|
| 0 – 0.25 | 8 **classic** strips: `plain brick stone slate iron wood glass concrete`. Greyscale, tinted by vertex colour, unchanged from v1. |
| 0.25 – 0.75 | 16 **library** strips with their own colour (`MATERIAL_LIBRARY`, below) |
| 0.75 – 0.875 | 4 **custom** rows for project materials (`defineMaterial`) |
| 0.875 – 1 | 128 px cells: decals (row 0), foliage cards (from slot 8) |

Each strip row is 1/32 of the sheet: 64 px at 2048², the same V resolution v1 strips had at 1024².
The U density doubles, and cells keep their 128 px. That is why the house sheet moved to 2048².

**Cost.** Painting takes about 4 s at 2048² (about 1 s at 1024²). The three PNGs total about 3.6 MB at 2048² (v1 at 1024² was about 1 MB).
GPU memory is 16 MB per map plus mips. The site's trim-sheet set is shared by every gallery asset.
`--sheet-size 1024` still works (32 px strip rows). The CLI default is 1024 until `src/cli/args.ts`
moves it to 2048.

**Compatibility.** UVs come from `stripRect()`/`cellRect()` at compile time, so geometry and triangle
counts are unchanged and every recipe recompiles onto the new layout. Classic strips paint byte for
byte as before; only their atlas position moved.

## The library and its numbers

Metal colours are the measured reflectance (F0) from [physicallybased.info](https://physicallybased.info)
(API: `api.physicallybased.info/materials`, which cites refractiveindex.info). Each value is
converted to sRGB here. Dielectric albedos stay inside the 30–240 sRGB range from the
[PBR guide](https://www.adobe.com/learn/substance-3d-designer/web/the-pbr-guide-part-2). Roughness
ranges come from the [Roblox material reference](https://create.roblox.com/docs/art/modeling/material-reference),
which uses glTF metal/rough conventions.

| Strip | Kind | Albedo (sRGB) / 2nd | Rough | Metal | Basis |
|---|---|---|---|---|---|
| `oak` | planks + rings + ray flecks | `#a27b52` / latewood `#6a482b` | 0.68 | 0 | worn wood 0.7–0.9, glossy 0.2–0.3 (Roblox) |
| `pine` | planks + strong rings, knots | `#d2b183` / `#9b6a3c` | 0.72 | 0 | same |
| `wood_weathered` | planks + checks (eroded grain, splits) | `#9b968c` / `#4f463c` | 0.86 | 0 | worn wood upper range |
| `wood_painted` | planks + paint film + chips | paint `#ededed` (×vertex colour) / bare wood `#a08c74` | wood 0.84, film 0.62 | 0 | painted surfaces are dielectric |
| `iron_rust` | metal + oxide + streaks | iron `#8e8a85` / rust `#764323` | 0.55 → rust ≈ 0.9 | 0.9 → 0 in rust | Iron F0 0.53 linear; Rust (0.181, 0.057, 0.017) linear, non-metal (physicallybased) |
| `iron_cast` | metal, sand-cast pits, oxide | `#6c6966` / `#55372a` | 0.68 | 0.75 | darker weathered iron skin |
| `steel_painted` | metal + paint film + chips | paint `#eeeeee` (×vertex colour) / rusty steel `#5a3b2a` | film 0.42 | 0 film, 1 under | painted metal 0.3 (Roblox) |
| `steel_galvanised` | metal + zinc spangle | `#d5dadc` / white rust `#9a9c98` | 0.42 | 1 | Zinc (0.808, 0.844, 0.865) linear |
| `brass` | metal, light brush, tarnish | `#f5e5ae` / `#6b5a3a` | 0.28 | 1 | Brass (0.910, 0.778, 0.423) linear; pure metals 0.2–0.3 |
| `copper` | metal + verdigris | `#f2b89c` / `#6fa58f` | 0.32 | 1 | Copper (0.932, 0.623, 0.522) linear, nudged warmer to match photographs |
| `aluminium` | metal, brushed along U | `#e6e8e9` | 0.34 | 1 | Aluminium (0.916, 0.923, 0.924) linear, brushed is a little darker |
| `chrome` | metal, near mirror | `#d3d9dc` | 0.07 | 1 | Chromium (0.654, 0.685, 0.701) linear |
| `rubber` | noise | `#2c2c2c` | 0.78 | 0 | Tire 0.023 linear, roughness 0.7 (physicallybased); rubber 0.5–0.6 (Roblox) |
| `canvas` | weave + folds + stains | `#cbbea2` / `#8a7c62` | 0.88 | 0 | cotton/canvas 0.8–0.9 |
| `leather` | pebble grain + creases + wear | `#7c5438` / `#3e281a` | 0.58 | 0 | worn leather 0.5–0.7 |
| `plastic` | quiet noise | `#ececec` (×vertex colour) | 0.35 | 0 | matte plastic 0.4, glossy 0.1 |

Unverified: the wood albedos are chosen within the dielectric range and checked against photographs
by eye. They are not spectrometer data, because no published wood-species albedo table was found.
Emissive panels have no strip: glTF emission is a separate per-material slot, not ORM. Glowing parts
use `glow` rules in export.

**How to colour library strips.** Use `NATURAL` (white) as the vertex colour on library strips, so
the measured albedo reads true. On painted strips (`wood_painted`, `steel_painted`, `plastic`) the
vertex colour is the paint colour. Chips multiply the bare surface by it too, so they read as
darker, rougher wear.

## Painters (src/material/paint/)

Every painter writes float layers in real metres: `height`, `tone`, `rough`, `metal`, `mix` (blend
from albedo to albedo2) and `occl`. `compose` then derives the normal (Sobel of height) and the
cavity AO, and packs the result. These painters are new or extended in v2:

- `planks`: `rings` (latewood colour at a frequency the strip's V texels can hold), `rays`, `checks`, `paint`/`chips`/`paintRough`.
- `metal`: `brush`, `cast`, `spangle`, `oxide`, `paint`/`chips`, `streaks`.
- `weave`, `leather` (fabric.ts).

All painters are seeded and tileable along U, so the output is deterministic.

## Project materials: `defineMaterial`

```ts
import { defineMaterial, NATURAL, box } from '@developerz.ai/ts23d';

export const teak = defineMaterial({
  id: 'teak_deck',
  kind: 'planks',              // start from any painter kind
  scaleMetres: 0.6,
  roughness: 0.6,
  albedo: '#8a5a32',           // sRGB hex or linear RGB
  albedo2: '#5a3a1e',          // latewood
  params: { width: 0.12, rings: 0.5, knots: 0.5 },
  // optional: your own layer on top, deterministic via kit.noise / kit.hash
  paint: (s, kit) => kit.each((i, xm, ym) => {
    s.tone[i] *= 1 - 0.1 * kit.smooth(0.4, 0.8, kit.noise(xm, ym, 0.5, 0.05, 1));
  }),
  sources: ['https://…'],
});

box({ size: [4, 2, 0.05], strip: teak, color: NATURAL });
```

- It validates first: bad input throws `T3D_MATERIAL_INVALID`, an unknown id `T3D_MATERIAL_UNKNOWN`, a
  built-in or differently redefined id `T3D_MATERIAL_CONFLICT`, and a fifth custom row
  `T3D_SHEET_FULL`. A painter that writes NaN or ∞ fails the paint with `T3D_MATERIAL_INVALID`.
- Rows are given out in registration order. Define materials in one shared module that every recipe
  imports, so the same program always produces the same bytes. Redefining an id with the identical
  definition is a no-op.
- `DEFAULT_SHEET` paints defined materials automatically. To restyle a built-in for one project,
  override its recipe: `paintTrimSheet({ ...DEFAULT_SHEET, strips: { ...DEFAULT_SHEET.strips, oak: {...} } })`.
- `materialOf(id)` returns the recipe, origin (classic/library/defined), description and sources.
  `resetMaterials()` is for tests and long-lived workers.

## CC0 image strips (opt-in)

A strip can come from a photo-scanned CC0 PBR set instead of a painter:

```ts
defineMaterial({ id: 'ph_wood_planks_grey', roughness: 0.85, texture: {
  source: 'polyhaven', id: 'wood_planks_grey', license: 'CC0-1.0',
  page: 'https://polyhaven.com/a/wood_planks_grey', author: 'Rob Tuytel', metres: [1.5, 1.5],
  maps: { albedo: { url: '…_diff_1k.png', sha256: '…' }, normal: { … nor_gl … }, arm: { … } },
} });
```

`CC0_WOOD_PLANKS_GREY` ships as a working example. It is not registered by default.

- **Offline compile.** `bun run textures [module…]` downloads every declared map once into
  `node_modules/.cache/ts23d/textures/<sha256>.png` (gitignored). It checks each file's sha256 and
  refuses a mismatch. `provideTextures(await loadTextureCache())` (from `scripts/textures.ts`) hands
  the bytes to the painter. The library never touches the network. If a map is missing, painting
  throws `T3D_TEXTURE_MISSING`, and the error names the command to run.
- **Painting.** PNGs are 8- or 16-bit (JPEG is not decoded). They are box-filtered onto the strip at
  true scale, with whole repeats along U so the strip still tiles. V is flipped so the image's top is
  world up. The OpenGL normal's green channel is flipped to the sheet's convention. `arm` fills
  occlusion, roughness and metalness.
- **Credits.** Only CC0 licences are accepted. When an asset samples an image strip, the GLB's XMP
  packet gets a `dc:contributor` line with the set, author, licence and page. Assets without image
  strips are byte-identical to before.
- **Next (planned).** ambientCG ships its sets as zips, and zip extraction is not built yet, so
  ambientCG sets work only when pointed at a PNG URL or a local file (`source: 'file'`). The CLI
  does not load the cache yet (see the roadmap request).

## Seeing it: the beauty renderer

`src/render/shade.ts` reads roughness and metalness per texel from the ORM. Specular uses a
normalised Blinn–Phong sun lobe plus a **studio environment reflection** (`envRadiance` in
`lighting.ts`). The environment has a bright cyclorama horizon, a cooler zenith, a dark band where
the floor meets the wall, and the lit floor. Roughness blurs it toward its mean, so chrome shows the
horizon line, brass looks gold, and oak stays matte. Fresnel uses Schlick with a roughness-limited
grazing term. Glass keeps its own path. The site viewer gets the same ORM through three.js
`MeshStandardMaterial`.
