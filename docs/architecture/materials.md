# Materials: one trim sheet, many physically distinct surfaces

Every asset is still **one material, one draw call**: a shared atlas with albedo, normal and ORM
(occlusion, roughness, metalness). A surface looks like oak, rusty iron or chrome because of what
its **strip** holds. Vertex colour multiplies the albedo: it tints a classic strip and sets the paint
colour of a painted strip.

## Layout (v3): 4096² atlas, 56 strip rows

| V range | Contents |
|---|---|
| 0 – 0.125 | 8 **classic** strips: `plain brick stone slate iron wood glass concrete`. Greyscale, tinted by vertex colour. |
| 0.125 – 0.375 | 16 **library** strips with their own colour (`MATERIAL_LIBRARY`, below) |
| 0.375 – 0.656 | 18 **nature** strips painted from texture graphs (`NATURE_LIBRARY`, below) |
| 0.656 – 0.875 | 14 **custom** rows for project materials (`defineMaterial`) |
| 0.875 – 1 | 1/16 cells (256 px at 4096²): decals (row 0), foliage cards (from slot 8) |

Each strip row is 1/64 of the sheet: 64 px at the 4096² house size. Each strip also spans its own
world metres along U (`spanOf(id)`, carried in `stripRect().metres`, so every primitive remaps
automatically): 4 m for classic, library and custom strips; 16 m for the isotropic ground strips;
32 m for `rock_strata` and `cliff`; 4 m for bark.

**Why this layout (the decision, with numbers).** Strips tile along U through the REPEAT sampler,
so a strip must span the full sheet width: per-strip texels = sheet width × row height, and a
2-column layout or U-blocks are impossible without cutting geometry. v2 (2048², 28 rows of 64 px,
2 m span) gave 0.98 mm along U against `scaleMetres/64` along V (7.8–9.4 mm): 8–10 : 1, and it
was full (28 rows, 4 custom). Adding 18 nature strips plus room for projects needs ≥ 52 rows, which
at 2048² means 32 px rows, a 2× loss for everything. So:

| Option | Rows | Texel U × V at scaleMetres 0.5 | Memory (RGBA8 ×3, +mips) | Paint (Bun, this machine) |
|---|---|---|---|---|
| v2: 2048², 1/32 rows, 2 m | 28 (full) | 0.98 × 7.8 mm (8 : 1) | 48 MB → 64 MB | 4.5 s |
| 2048², 1/64 rows | 56 | 0.98–1.95 × 15.6 mm | same | ≈ 4.6 s |
| **v3: 4096², 1/64 rows, span per strip** | **56** | **library 0.98 × 7.8 mm (= v2); nature 3.9 × 7.8 mm (2 : 1)** | 192 MB → 256 MB (BC7 in engines: 64 MB) | **17–18 s** |
| 4096², 1/32 rows | 28 (full) | 0.98 × 3.9 mm (4 : 1) | 256 MB | ≈ 18 s |

v3 keeps every v2 strip at exactly its v2 texel size at the house size, doubles capacity
(42 built-ins + 14 custom), halves visible tiling (4 m repeat instead of 2 m), and fixes the
anisotropy where it hurt: the isotropic nature strips (sand, gravel, cobbles, snow…) get square-ish
texels (≤ 2 : 1, pinned by `variant.test.ts`) by spanning more metres along U. Grain-along-U
materials (wood, brushed metal, canvas, bark furrows) keep fine U on purpose. The UVs are sheet
fractions, so a 2048² paint is a valid half-resolution preview of the same layout (4.6 s, 32 px
rows); `--sheet-size 2048` and the site can keep using it.

**Cost.** One shared sheet set per output folder (`--sheet external`), so GLBs do not grow. The 4096²
PNGs are about 4× the 2048² ones (≈ 14 MB vs 3.6 MB). Edge rows are replicated 1/8 of a row deep
(8 px at 4096²), so the first three mip levels stay inside their strip.

**Compatibility.** Every strip's V rect and the U scale moved (1/32 → 1/64 rows, 2 m → 4 m), so
every asset's UVs change once; geometry and triangle counts do not. Recompile; committed outputs
need `bun run shots`. `stripAtV(v)` is the layout's own V → strip lookup (physics, QA): use it
instead of hard-coding row heights.

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

### Height first: relief on the library strips

The library strips build a **height field first** and derive the rest from it, the way Substance
Designer works: normal (Sobel of height in metres), fine cavity AO (into `occl`, so ORM.r and the
baked albedo darkening agree) and roughness variation (pits and pores rougher, raised wear
smoother). All of it is behind params that default to off, so the eight classic strips and the
cells paint byte for byte as before.

**Texel density decides what can exist.** A strip row is 2048 × 64 px over 2 m × `scaleMetres`:
about 1 mm per texel along U but 8–9 mm along V (16 mm on `canvas`, `scaleMetres` 1). Round
features must clear the coarse V texel or they turn into vertical dashes, and a period-2 pattern
along V cancels out in the Sobel kernel. So `relief.ts` clamps each axis on its own:

| Helper (`paint/relief.ts`) | Use |
|---|---|
| `fineNoise(c, xm, ym, sizeU, sizeV, seed)` | features long along U (brushing); each axis clamped so its top octave spans ≥ 1.5 texels |
| `isoNoise(c, xm, ym, size, seed)` | round features (sand, stipple, pits, orange peel), clamped to the coarser texel |
| `rowNoise(c, xm, y, sizeU, seed)` | a line one texel tall along U (wood pores, brushed metal) |
| `worley(c, xm, ym, size, seed, out)` | cells (leather pebbles, rust flakes, cast blow-holes), ≥ 2.5 texels, tileable |
| `curvature(c, radius)` | height minus its local mean, in metres (+ convex, − concave) |
| `finishRelief(c, params)` | `cavity` (AO 0..1), `cavityDepth` (0.0004 m), `cavityRadius` (0.006 m), `cavityRough` |

| Strip | Relief (param) | Mean normal tilt, before → after |
|---|---|---|
| `oak` `pine` | `grain`: proud latewood, pore grooves along the grain (also darker in albedo), fibre ripple, rounded board arrises | 2.3° → 3.9°, 2.4° → 4.0° |
| `wood_weathered` | `grain` 1.4 on top of `checks` | 2.3° → 5.4° |
| `wood_painted` | `grain` under a `film` (0.6 mm) paint step at the chips | 1.8° → 2.7° |
| `iron_rust` | `relief`: oxide crust with a hard flaking edge, cellular flakes with dark gaps, pits | 0.9° → 2.9° |
| `iron_cast` | `relief`: sand grain plus sparse blow-holes (dark, rough) | 1.6° → 3.1° |
| `steel_painted` | `relief`: paint `film` step at chips, faint orange peel | ≈0 → 0.5° |
| `steel_galvanised` | `relief`: each spangle crystal a slightly different plateau | ≈0 → 0.9° |
| `aluminium` `brass` | `relief`: one-texel brushing lines along U, stock waviness | ≈0 → 1.1°, 0.8° |
| `copper` `chrome` | `relief`: stock waviness only (chrome at half, to keep the mirror) | ≈0 → 0.7°, 0.4° |
| `rubber` `plastic` | `grain`/`grainSize`: moulded stipple / orange peel | ≈0 → 1.1°, 0.4° |
| `canvas` | `relief`: thread ribs along U, shifted a quarter pitch per row (a twill the Sobel keeps) | 0.7° → 3.2° |
| `leather` | `relief`: cellular pebbles with crevices, rubbed tops flatter | 0.7° → 3.1° |

"Before" is the v2 sheet measured on the shipped normal map; ≈0 means at the 8-bit floor. Polished
metals (`brass`, `copper`, `chrome`, `aluminium`, galvanised) get no cavity AO, since a waviness
cavity is not dirt. `paint/library-relief.test.ts` pins a floor per strip, checks that switching the
params off flattens each one, and checks that cavities are darker and rougher than raised spots.

`edgeWear` now ships twice: as the `wear` dial on every strip and as `tex.edgeWear` in graphs.
Planned, not shipped: a `PaintKit` entry for the relief helpers (graphs cover the same ground).

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
  built-in or differently redefined id `T3D_MATERIAL_CONFLICT`, and a fifteenth custom row
  `T3D_SHEET_FULL`. Also: `graph` (a `tex` graph, see below), `spanMetres` (U repeat, default 4)
  and the weathering dials `wet`, `wear`, `age`. A painter that writes NaN or ∞ fails the paint with `T3D_MATERIAL_INVALID`.
- A row comes from the id: a stable hash picks the home row and a taken home probes to the next free
  one (`src/material/slots.ts`). The row never depends on how many materials the process registered
  first, so the same program always produces the same bytes; only a hash clash between two ids makes
  the later one probe (the shipped creature and CC0 ids have none). A row never moves once given out.
  Still define materials in one shared module. Redefining an id with the identical definition is a no-op.
- `DEFAULT_SHEET` paints defined materials automatically. To restyle a built-in for one project,
  override its recipe: `paintTrimSheet({ ...DEFAULT_SHEET, strips: { ...DEFAULT_SHEET.strips, oak: {...} } })`.
- `materialOf(id)` returns the recipe, origin (classic/library/defined), description and sources.
  `resetMaterials()` is for tests and long-lived workers.

## Nature: ground, rock, vegetation, bark, liquids

Painted from texture graphs (`src/material/nature-*.ts`), height first: each strip's colour and
roughness are ramps over the same fields as its height, so relief, tone and gloss agree. Tint
with `NATURAL`. Sources: [physicallybased.info](https://physicallybased.info) (Sand, Snow, Ice,
Water, Charcoal) and the broadband surface-albedo table on
[Wikipedia: Albedo](https://en.wikipedia.org/wiki/Albedo) (fresh asphalt 0.04, worn 0.12, bare
soil ≈ 0.17, green grass ≈ 0.25, desert sand ≈ 0.4, fresh snow 0.8–0.9). Broadband albedo includes
near-infrared, so it is a range check, not a colour: hues are chosen by eye against photographs
(unverified beyond that).

| Strip | Graph | Albedo (sRGB) | Rough | Basis |
|---|---|---|---|---|
| `sand` | ridged wind ripples (~7 cm) + fine grain | `#958a68`–`#cbc2a0` | 0.86–0.94 | PB Sand (0.44, 0.386, 0.231) linear = `#b0a684`, rough 0.9 |
| `soil` | inverted cells (clods) + crumb | `#3a2b1f`–`#7f6a54` | 0.86–0.96 | bare soil ≈ 0.17 |
| `gravel` | rotated overlapping pebbles 2–4 cm in dark fines | greys/browns by pebble id | 0.72 stones / 0.95 fines | Wikipedia ranges |
| `mud` | soft undulation + cracks, **wet 0.75**, porosity 0.9 | `#3a2c20`–`#6a553d`, darkened | 0.6–0.78 → wet | Lagarde wet surfaces |
| `rock_strata` | `strata` beds (11 cm), warped, cross fractures | sandstone `#6f5a48`–`#b59c7c` per bed | 0.8–0.92 | USGS sedimentary layers |
| `cliff` | jointed blocks (cells edge) + ridged fractures + lichen | `#4a4743`–`#a19c93` | 0.78–0.9 | granite by eye |
| `moss` | cushions (inverted cells²) + fibres | `#2a3b16`–`#8aa23a` | 0.86–0.98 | by eye |
| `grass` | ridged blades along V, dry patches | `#253a16`–`#7d9a3c`, dry `#a8995a` | 0.78–0.92 | green grass ≈ 0.25 |
| `snow` | drifts + crust | `#d5dde6`–`#f3f4f5` | 0.5–0.68 | PB Snow 0.85 linear, rough 0.5 |
| `ice` | white fracture lines + bubbles | `#9fc0d4`–`#e8f1f5` | 0.1–0.3 | PB Ice rough 0.5 is frosted; clear ice chosen smoother |
| `bark_oak` | ridged furrows along V, broken ridges | `#2a221b`–`#8f8576` | 0.85–0.95 | by eye |
| `bark_pine` | cell plates with dark fissures | `#6a3b22`–`#a8683f` | 0.84–0.95 | by eye |
| `bark_birch` | white, dark horizontal lenticels, scars | `#cfc8bb`–`#ebe7de` | 0.62–0.9 | by eye |
| `leaf_litter` | two layers of rotated flat leaves on humus | browns/ochres by leaf id | 0.75–0.92 | by eye |
| `cobblestone` | domed cobbles (13 cm), polished crowns (`edgeWear`) | greys by stone id, joints `#4a4134` | 0.52–0.95 | by eye |
| `asphalt` | cone aggregate + hairline cracks | `#3a3a3a`–`#4c4b48`, stones `#7e7a72` | 0.8–0.92 | asphalt 0.04–0.12 |
| `water` | swell + ridged ripples, opaque stylised | `#163d4b`–`#3f7d8a` | 0.03–0.08 | PB Water rough 0 |
| `lava` | crust plates (charcoal) over orange cracks | `#161413`–`#2d2826`, cracks `#c2410c`–`#ffb43a` | 0.45 cracks / 0.9 crust | PB Charcoal 0.02 linear |

**Lava glows only with a glow rule.** glTF emission is a per-material slot, not part of ORM, so a
strip cannot emit. The bright crack albedo reads hot under light; add an export `glow` rule on the
lava part for real emission (`src/export/materials.ts`, `glowMaterial`).

`nature.test.ts` fails a nature strip that is flat (mean normal tilt < 1°), whose albedo leaves
sRGB 25–245, or whose roughness map is constant.

## Creature materials (opt-in)

`CREATURE_MATERIALS` (`creature.ts`) are not on the default sheet; register what a project uses:
`defineMaterial(CREATURE_MATERIALS.dragon_scales)`. `dragon_scales` (pointed imbricated plates,
10 × 6 cm, bronze-worn crowns), `reptile_scales` (2.5 cm round), `hair` (strands in locks), `fur`
(short strands). Built on `tex.scales` and `tex.strands`; vertex colour tints them.

## Variations and weathering

**`materialVariant(id, n)`** (n 1..15) returns `id~n`: the same row, read from a golden-ratio
shifted place along U (`stripRect('oak~3').u0 ≈ 0.85`). Ten crates or rocks stop showing the same
boards or cracks, and it costs no row. It decorrelates; it is not a new material.

**Weathering dials** on any material (`defineMaterial({ wet, wear, age })`, or `params`), all 0..1,
painted after the base painter (`paint/weather.ts`):

- `wear`: convex curvature of the height (radius 6 mm) chewed by noise. Those texels get +18 % tone,
  −0.2 roughness, and `mix` toward albedo2 (bare metal, raw wood).
- `age`: grime (0.7 × age), −12 % tone, +0.08 roughness.
- `wet`, after [Lagarde, *Water drop 3b: physically based wet surfaces*](https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/): albedo × (1 − wet·(0.15 + 0.45·porosity)) (porous surfaces darken more, `porosity` default 0.6), roughness → 0.12 by 85 % of wet. Past wet 0.5, water fills the lowest 45 % of the relief: flat, roughness 0.03 (puddles). The coefficients are approximations of Lagarde's curves, not measurements.

**`weathered(from, { id, wet, wear, age })`** derives a `MaterialDef` from any strip (built-in or
defined) for `defineMaterial`; it takes a custom row because it paints differently.

## Texture graphs: the `tex` DSL

A Substance-Designer-style node graph as typed, chainable functions. Every node is a lazily
evaluated, memoised layer over the strip's texel grid. Every size is in metres and snaps to whole
periods per tile along U, so graphs are **tileable by construction**. Filters (warp, blur) wrap
along U. Same graph + seed = same bytes.

```ts
import { defineMaterial, tex } from '@developerz.ai/ts23d';

const stones = tex.pebbles({ size: 0.12, radius: 0.48, jitter: 0.5, aspect: 1.2 });
const height = stones.height.pow(0.6).add(tex.noise({ size: 0.02 }).mul(0.1));
const polish = tex.edgeWear(height, { width: 0.02, amount: 0.6 });

export const setts = defineMaterial({
  id: 'granite_setts',
  scaleMetres: 0.5,
  spanMetres: 16,               // repeat every 16 m along U, near-square texels
  roughness: 0.8,
  graph: tex.material({
    height,                     // 0..1
    depth: 0.03,                // metres at height 1
    albedo: stones.id.ramp([[0, '#5d5852'], [1, '#8a847a']])
      .mix('#4a4134', stones.mask.invert())
      .mul(polish.remap(1, 1.15)),
    roughness: stones.mask.lerp(0.95, 0.7).sub(polish.mul(0.2)).clamp(),
  }),
  wet: 0.3,
});
```

| Kind | Nodes |
|---|---|
| Generators (0..1) | `noise({ size, sizeV, octaves, gain })` · `ridged` · `cells({ size, jitter, out: 'f1' \| 'edge' \| 'id' })` · `gradientV()` · `constant(v)` · `fn((xm, ym, ctx) => …)` |
| Stamps → `{ height, id, mask }` | `bricks({ width, height, gap, bevel, offset })` · `tiles` · `planks({ width, length })` · `scatter({ size, density, radius, shape, aspect, rotate })` · `pebbles` · `strata({ thickness, jitter, ledge })` · `scales({ width, height, overlap, point })` · `strands({ width, length, clump, wave })` |
| Math / filters (methods) | `add sub mul min max lerp invert pow clamp levels remap smoothstep threshold warp(by, metres) blur(metres) curvature(metres) ramp(stops)` |
| Masks | `edgeWear(height, { width, amount, chip })` · `cavity(height)` · `heightBlend(base, top, contrast)` · `blend(a, b, mask)` |
| Colour | `ramp(field, [[t, '#hex'], …])` · `colour('#hex')` · `.mix(other, mask)` · `.mul(tone)` |
| Output | `tex.material({ height, depth, albedo, roughness, metalness, occlusion })` → `defineMaterial({ graph })` |

**Checked at definition.** `defineMaterial` probe-paints the graph on a two-tile grid and throws
`T3D_MATERIAL_INVALID` when the second tile differs from the first (not tileable: a `tex.fn` must
repeat every `ctx.tileU`), when an output is NaN, or when albedo, roughness, metalness or occlusion
leaves 0..1. The message names the output and the fix. A slope mask needs the mesh normal, so it
belongs on the terrain side. It is planned, not shipped.


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
- **Find and pin sets.** `bun run textures search <words…> [--source polyhaven|ambientcg]` lists
  CC0 sets (id, real size, page) from `api.polyhaven.com` or ambientCG's v2 API.
  `bun run textures add <id> [--source …] [--res 1k]` downloads the maps once, writes them into the
  cache, and prints a ready `defineMaterial` with every map pinned by sha256. Poly Haven gives PNG
  albedo, `nor_gl` and `arm`. ambientCG ships zips, so its maps are `<zip url>#<entry>.png`
  (Color, NormalGL, Roughness, AmbientOcclusion from the `_1K-PNG.zip`), and the sha256 is the
  extracted entry's. `scripts/textures-zip.ts` is a small stored/deflate zip reader on
  `node:zlib`, used by scripts only. ambientCG `dimensionX/Y` are read as centimetres (unverified;
  280 for a 2.8 m set matches the site's listing format).
- **JPEG.** Not decoded. Both sources offer PNG, which the commands always pick.
- `roughness` and `occlusion` greyscale maps fill the ORM when there is no packed `arm`.

## Seeing it: the beauty renderer

`src/render/shade.ts` reads roughness and metalness per texel from the ORM. Specular uses a
normalised Blinn–Phong sun lobe plus a **studio environment reflection** (`envRadiance` in
`lighting.ts`). The environment has a bright cyclorama horizon, a cooler zenith, a dark band where
the floor meets the wall, and the lit floor. Roughness blurs it toward its mean, so chrome shows the
horizon line, brass looks gold, and oak stays matte. Fresnel uses Schlick with a roughness-limited
grazing term. Glass keeps its own path. The site viewer gets the same ORM through three.js
`MeshStandardMaterial`.
